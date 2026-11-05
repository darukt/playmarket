package catalog_test

import (
	"os"
	"path/filepath"
	catalog "playmarket-backend/internal/services/catalog/services"
	"testing"
)

func TestSelectionAndPersistence(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	if err := os.WriteFile(seed, []byte(`[{"id":"a","name":"Alpha","rating":3,"category":"games"},{"id":"b","name":"Beta","rating":5,"category":"social"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := catalog.Open(dir, seed)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if rows := s.Filter(catalog.Query{Category: "games", Q: "ALP"}); len(rows) != 1 || rows[0].ID != "a" {
		t.Fatalf("filter: %+v", rows)
	}
	if rows := s.List(); rows[0].ID != "b" {
		t.Fatalf("rating order: %+v", rows)
	}
	e := catalog.Entry{ID: "custom-c", Name: "Custom", Kind: catalog.KindApp}
	if _, err := s.AddCustom(e); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Get(e.ID); !ok {
		t.Fatal("added entry missing from lookup")
	}
	if _, err := s.AddCustom(e); err == nil {
		t.Fatal("duplicate entry accepted")
	}
	if err := s.DeleteCustom(e.ID); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Get(e.ID); ok {
		t.Fatal("deleted entry remains in lookup")
	}
}
func TestMalformedPersistenceAndPathIDsRejected(t *testing.T) {
	dir := t.TempDir()
	seed := filepath.Join(dir, "seed.json")
	os.WriteFile(seed, []byte(`[{"id":"../private","name":"invalid"}]`), 0o600)
	if s, err := catalog.Open(dir, seed); err == nil {
		s.Close()
		t.Fatal("path-like seed id accepted")
	}
	os.WriteFile(seed, []byte(`[]`), 0o600)
	os.WriteFile(filepath.Join(dir, "catalog.json"), []byte(`{"broken"`), 0o600)
	if s, err := catalog.Open(dir, seed); err == nil {
		s.Close()
		t.Fatal("corrupted catalog silently discarded")
	}
}
