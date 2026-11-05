package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	catalog "playmarket-backend/internal/services/catalog/services"
)

func TestOfficialDownloadResolutionAndRedirect(t *testing.T) {
	s := newTestServer(t)
	e, err := s.store.AddCustom(catalog.Entry{ID: "official.android", Name: "Official app", DownloadsByPlatform: map[string]catalog.DownloadSource{
		"android": {URL: "https://f-droid.org/repo/example_1.apk", Kind: "file", Filename: "example.apk"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	h := s.routes(true)
	metadata := do(t, h, "GET", "/api/download/"+e.ID+"?platform=windows&resolve=1", nil, nil)
	if metadata.Code != 200 || !strings.Contains(metadata.Body.String(), `"platform":"android"`) || !strings.Contains(metadata.Body.String(), `"kind":"file"`) {
		t.Fatalf("Android fallback metadata: %d %s", metadata.Code, metadata.Body.String())
	}
	for _, method := range []string{"GET", "HEAD"} {
		rec := do(t, h, method, "/api/download/"+e.ID+"?platform=android", nil, nil)
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != "https://f-droid.org/repo/example_1.apk" {
			t.Fatalf("official redirect: %d %s", rec.Code, rec.Header().Get("Location"))
		}
	}
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("redirect cannot prove downloaded bytes: %+v %v", stats, err)
	}
}

func TestMissingPackageNeverReturnsDemoInstaller(t *testing.T) {
	h := newTestServer(t).routes(true)
	for _, platform := range []string{"android", "windows"} {
		rec := do(t, h, "GET", "/api/download/com.example.music?platform="+platform, nil, nil)
		if rec.Code != http.StatusNotFound || strings.HasPrefix(rec.Body.String(), "MZ") || strings.HasPrefix(rec.Body.String(), "PK") {
			t.Fatalf("missing %s package returned a fake installer: %d", platform, rec.Code)
		}
	}
}

func TestStoreResolutionIsDistinctFromFile(t *testing.T) {
	s := newTestServer(t)
	e, err := s.store.AddCustom(catalog.Entry{ID: "official.store", Name: "Store app", DownloadsByPlatform: map[string]catalog.DownloadSource{
		"android": {URL: "https://play.google.com/store/apps/details?id=example", Kind: "store"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	rec := do(t, s.routes(true), "GET", "/api/download/"+e.ID+"?resolve=1", nil, nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"kind":"store"`) {
		t.Fatalf("store metadata: %d %s", rec.Code, rec.Body.String())
	}
}

func TestUploadedResolutionChecksPackageBeforeSuccess(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	packagePath := filepath.Join(s.store.UploadsDir("com.example.chat"), "artifact-windows.exe")
	if err := os.Truncate(packagePath, 0); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"&resolve=1", ""} {
		rec := do(t, h, "GET", "/api/download/com.example.chat?platform=windows"+suffix, nil, nil)
		if rec.Code != http.StatusConflict {
			t.Fatalf("empty uploaded package returned success: %d %s", rec.Code, rec.Body.String())
		}
	}
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("unavailable artifact was counted: %+v %v", stats, err)
	}

	for _, name := range []string{"artifact-windows.exe", "artifact-android.apk"} {
		if err := os.Remove(filepath.Join(s.store.UploadsDir("com.example.chat"), name)); err != nil {
			t.Fatal(err)
		}
	}
	if rec := do(t, h, "GET", "/api/download/com.example.chat?platform=windows&resolve=1", nil, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("removed upload resolved successfully: %d", rec.Code)
	}
}

func TestAndroidFallbackPrefersUploadedPackageOverStore(t *testing.T) {
	s := newTestServer(t)
	e, err := s.store.AddCustom(catalog.Entry{ID: "official.uploaded", Name: "Uploaded app", DownloadsByPlatform: map[string]catalog.DownloadSource{
		"android": {URL: "https://play.google.com/store/apps/details?id=example", Kind: "store"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	packageBytes := []byte("PK-original-uploaded-apk")
	if err := os.WriteFile(filepath.Join(s.store.UploadsDir(e.ID), "artifact-android.apk"), packageBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	h := s.routes(true)
	metadata := do(t, h, "GET", "/api/download/"+e.ID+"?platform=windows&resolve=1", nil, nil)
	if metadata.Code != http.StatusOK || !strings.Contains(metadata.Body.String(), `"kind":"file"`) || !strings.Contains(metadata.Body.String(), `"platform":"android"`) || !strings.Contains(metadata.Body.String(), `"url":"/api/download/`) {
		t.Fatalf("fallback did not resolve uploaded APK: %d %s", metadata.Code, metadata.Body.String())
	}
	if metadata.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("availability metadata must not be cached")
	}
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("metadata was counted as a transfer: %+v %v", stats, err)
	}
	rec := do(t, h, "GET", "/api/download/"+e.ID+"?platform=windows", nil, nil)
	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), packageBytes) || rec.Header().Get("X-Platform") != "android" || rec.Header().Get("Content-Type") != "application/vnd.android.package-archive" {
		t.Fatalf("fallback response: %d %s", rec.Code, rec.Body.String())
	}
}

func TestOnlyCompleteDownloadResponsesAreCounted(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	path := "/api/download/com.example.chat?platform=windows"
	head := do(t, h, "HEAD", path, nil, nil)
	if head.Code != http.StatusOK {
		t.Fatalf("HEAD: %d", head.Code)
	}
	if rec := do(t, h, "GET", path, nil, map[string]string{"If-Modified-Since": head.Header().Get("Last-Modified")}); rec.Code != http.StatusNotModified {
		t.Fatalf("conditional GET: %d", rec.Code)
	}
	if rec := do(t, h, "GET", path, nil, map[string]string{"Range": "bytes=0-1"}); rec.Code != http.StatusPartialContent {
		t.Fatalf("partial GET: %d", rec.Code)
	}
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("HEAD, 304, or range was counted: %+v %v", stats, err)
	}
	if rec := do(t, h, "GET", path, nil, nil); rec.Code != http.StatusOK {
		t.Fatalf("full GET: %d", rec.Code)
	}
	stats, err = s.store.DownloadStats(10)
	if err != nil || stats.Total != 1 || stats.Bytes != int64(len(testWindowsPackage)) {
		t.Fatalf("complete package response was not counted: %+v %v", stats, err)
	}
}

type interruptedDownloadWriter struct{ header http.Header }

func (w *interruptedDownloadWriter) Header() http.Header     { return w.header }
func (*interruptedDownloadWriter) WriteHeader(int)           {}
func (*interruptedDownloadWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestInterruptedDownloadIsNotCounted(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/download/com.example.chat?platform=windows", nil)
	s.download(&interruptedDownloadWriter{header: http.Header{}}, req)
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("interrupted download was counted: %+v %v", stats, err)
	}
}
