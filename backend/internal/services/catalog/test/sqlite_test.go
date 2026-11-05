package catalog_test

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	catalog "playmarket-backend/internal/services/catalog/services"
)

func writeCatalog(t *testing.T, path string, entries []catalog.Entry) {
	t.Helper()
	data, err := json.Marshal(entries)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestSQLiteMigratesLegacyOnceAndPreservesCustomOnSeedRefresh(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	legacy := filepath.Join(dir, "catalog.json")
	writeCatalog(t, seed, []catalog.Entry{{ID: "publisher-app", Name: "Original"}})
	writeCatalog(t, legacy, []catalog.Entry{{ID: "legacy-app", Name: "Uploaded"}})
	s, err := catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "catalog.db")); err != nil {
		t.Fatal("SQLite database was not created:", err)
	}
	if e, ok := s.Get("legacy-app"); !ok || !e.Custom {
		t.Fatal("legacy custom entry was not migrated")
	}
	if _, err := s.AddCustom(catalog.Entry{ID: "admin-app", Name: "Administrator version"}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteCustom("legacy-app"); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}

	writeCatalog(t, seed, []catalog.Entry{
		{ID: "publisher-app", Name: "Updated metadata"},
		{ID: "admin-app", Name: "Publisher collision"},
		{ID: "new-app", Name: "New addition"},
	})
	s, err = catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, ok := s.Get("legacy-app"); ok {
		t.Fatal("legacy JSON resurrected a deleted entry")
	}
	if e, ok := s.Get("publisher-app"); !ok || e.Name != "Updated metadata" {
		t.Fatal("seed metadata was not refreshed")
	}
	if e, ok := s.Get("admin-app"); !ok || !e.Custom || e.Name != "Administrator version" {
		t.Fatal("seed refresh overwrote administrator data")
	}
	if _, ok := s.Get("new-app"); !ok {
		t.Fatal("new seed entry was not imported")
	}
	if seedCount, customCount := s.Counts(); seedCount != 2 || customCount != 1 {
		t.Fatalf("counts: seed=%d custom=%d", seedCount, customCount)
	}
}

func TestSQLiteIsRuntimeSourceAndSurvivesWithoutSeed(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	writeCatalog(t, seed, []catalog.Entry{{ID: "publisher-app", Name: "Initial"}})
	s, err := catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "catalog.db"))
	if err != nil {
		t.Fatal(err)
	}
	document, _ := json.Marshal(catalog.Entry{ID: "publisher-app", Name: "Read from database", Kind: catalog.KindApp})
	if _, err := db.Exec(`UPDATE catalog_entries SET document=? WHERE id=?`, string(document), "publisher-app"); err != nil {
		t.Fatal(err)
	}
	if e, ok := s.Get("publisher-app"); !ok || e.Name != "Read from database" {
		t.Fatal("catalog lookup is serving a memory/JSON copy instead of SQLite")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(seed); err != nil {
		t.Fatal(err)
	}
	s, err = catalog.Open(dir, seed)
	if err != nil {
		t.Fatal("existing database must work without an import file:", err)
	}
	defer s.Close()
	if e, ok := s.Get("publisher-app"); !ok || e.Name != "Read from database" {
		t.Fatal("database data did not persist")
	}
}

func TestSQLiteCustomCRUDAndPublisherArtifactsSurviveRestart(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	writeCatalog(t, seed, []catalog.Entry{{ID: "publisher-app", Name: "Publisher"}})
	s, err := catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	uploads := s.UploadsDir("publisher-app")
	if err := os.MkdirAll(uploads, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(uploads, "artifact-android.apk"), []byte("original-package"), 0o600); err != nil {
		t.Fatal(err)
	}
	entry := catalog.Entry{ID: "custom-app", Name: "Custom", DownloadsByPlatform: map[string]catalog.DownloadSource{
		"android": {URL: "https://downloads.example.com/app.apk", Kind: "file", Filename: "app.apk"},
	}}
	if _, err := s.AddCustom(entry); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if e, ok := s.Get(entry.ID); !ok || e.DownloadsByPlatform["android"].URL != entry.DownloadsByPlatform["android"].URL {
		t.Fatal("download metadata did not persist")
	}
	if e, ok := s.Get("publisher-app"); !ok {
		t.Fatal("publisher missing")
	} else if path, ok := s.Artifact(e, "android"); !ok || path != filepath.Join(uploads, "artifact-android.apk") {
		t.Fatal("publisher artifact was not attached")
	}
	if err := s.DeleteCustom(entry.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Get(entry.ID); ok {
		t.Fatal("deleted custom entry was returned")
	}
	if err := s.DeleteCustom("publisher-app"); err != catalog.ErrNotCustom {
		t.Fatalf("seed deletion returned %v", err)
	}
}

func TestDownloadSourceValidation(t *testing.T) {
	valid := catalog.DownloadSource{URL: "https://play.google.com/store/apps/details?id=org.example.app", Kind: "store"}
	if err := catalog.ValidateDownloads(map[string]catalog.DownloadSource{"android": valid}); err != nil {
		t.Fatal(err)
	}
	invalid := []catalog.DownloadSource{
		{URL: "javascript:alert(1)", Kind: "file"},
		{URL: "http://example.com/app.apk", Kind: "file"},
		{URL: "https://user:secret@example.com/app.apk", Kind: "file"},
		{URL: "https://127.0.0.1/app.apk", Kind: "file"},
		{URL: "https://192.168.1.1/app.apk", Kind: "file"},
		{URL: "https://localhost/app.apk", Kind: "file"},
		{URL: "https://example.com/app.apk", Kind: "file", Filename: "../app.apk"},
		{URL: "https://example.com/app.apk", Kind: "unknown"},
	}
	for _, source := range invalid {
		if err := catalog.ValidateDownloads(map[string]catalog.DownloadSource{"android": source}); err == nil {
			t.Errorf("invalid source accepted: %+v", source)
		}
	}
}

func TestSQLiteSeedImportRollsBackOnInvalidRow(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	writeCatalog(t, seed, []catalog.Entry{{ID: "publisher-app", Name: "Preserved"}})
	s, err := catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	writeCatalog(t, seed, []catalog.Entry{
		{ID: "publisher-app", Name: "Must roll back"},
		{ID: "../invalid", Name: "Invalid ID"},
	})
	if invalidStore, err := catalog.Open(dir, seed); err == nil {
		invalidStore.Close()
		t.Fatal("invalid seed import succeeded")
	}
	if err := os.Remove(seed); err != nil {
		t.Fatal(err)
	}
	s, err = catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if e, ok := s.Get("publisher-app"); !ok || e.Name != "Preserved" {
		t.Fatal("failed import partially changed the database")
	}
}
