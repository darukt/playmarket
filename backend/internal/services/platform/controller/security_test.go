package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Заголовки безопасности должны стоять на API-ответах.
func TestSecurityHeaders(t *testing.T) {
	h := newTestServer(t).routes(true)
	rec := do(t, h, "GET", "/api/healthz", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("healthz: %d", rec.Code)
	}
	want := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy":        "no-referrer",
		"X-Frame-Options":        "DENY",
	}
	for key, value := range want {
		if got := rec.Header().Get(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
}

// Открытая БД: служебные JSON-файлы (каталог, счета, очки, сессии) не должны
// отдаваться по HTTP ни напрямую, ни через path traversal.
func TestNoDataFilesServed(t *testing.T) {
	h := newTestServer(t).routes(true)
	paths := []string{
		"/data/seed.json",
		"/data/catalog.json",
		"/data/scores.json",
		"/data/users.json",
		"/data/accounts.json",
		"/backend/data/seed.json",
		"/seed.json",
		"/users.json",
		"/scores.json",
		"/.env",
		"/.git/config",
		"/api/../data/seed.json",
		"/uploads/../seed.json",
		"/uploads/a/%2e%2e/%2e%2e/seed.json",
	}
	for _, path := range paths {
		rec := do(t, h, "GET", path, nil, nil)
		if rec.Code == http.StatusOK {
			t.Errorf("%s: data file served with 200 (%d bytes)", path, rec.Body.Len())
		}
		body := rec.Body.String()
		if strings.Contains(body, "com.example.chat") || strings.Contains(body, "passwordHash") {
			t.Errorf("%s: leaked database contents", path)
		}
	}
}

// SQLi-пейлоады не должны выполняться/ломать сервис: у нас нет SQL, но
// запросы с инъекциями обязаны обрабатываться как обычные данные и не давать 5xx.
func TestSQLInjectionPayloadsAreInert(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	loginFixture(t, s, h)

	payloads := []string{
		"' OR 1=1--",
		`" OR "1"="1`,
		"1; DROP TABLE accounts;--",
		"admin'--",
	}
	for _, payload := range payloads {
		// Логин с инъекцией не должен пускать без пароля.
		body, _ := json.Marshal(map[string]string{"email": payload, "password": payload})
		rec := do(t, h, "POST", "/api/auth/login", bytes.NewReader(body), map[string]string{"Content-Type": "application/json"})
		if rec.Code >= 500 {
			t.Errorf("login with %q returned 5xx: %s", payload, rec.Body.String())
		}
		if rec.Code == http.StatusOK {
			t.Errorf("login bypassed with %q", payload)
		}
		// Поиск приложения по инъекции — обычный 404, без утечек и SQL-ошибок.
		rec = do(t, h, "GET", "/api/apps/"+url.PathEscape(payload), nil, nil)
		if rec.Code >= 500 {
			t.Errorf("app lookup with %q returned 5xx", payload)
		}
		if strings.Contains(strings.ToLower(rec.Body.String()), "sql") {
			t.Errorf("app lookup with %q leaked SQL details", payload)
		}
	}
}

// XSS/JS-пейлоады в пользовательских полях либо отклоняются валидацией,
// либо остаются текстом в JSON (Go экранирует HTML-символы в JSON).
func TestXSSPayloadsRejectedOrEscaped(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	loginFixture(t, s, h)

	payloads := []string{
		"<script>alert(1)</script>",
		"<svg/onload=alert(1)>",
		"<img src=x onerror=alert(1)>",
		"javascript:alert(1)",
	}
	for _, payload := range payloads {
		body, _ := json.Marshal(map[string]any{"name": payload, "score": 10})
		rec := do(t, h, "POST", "/api/games/snake/scores", bytes.NewReader(body), map[string]string{"Content-Type": "application/json"})
		if rec.Code >= 500 {
			t.Errorf("score with %q returned 5xx", payload)
		}
		if strings.Contains(rec.Body.String(), payload) {
			t.Errorf("score response contains raw payload %q", payload)
		}
		if rec.Code == http.StatusOK && strings.Contains(rec.Body.String(), "<") {
			t.Errorf("score response returned unescaped markup for %q", payload)
		}
	}

	// Публичный поиск не должен отражать HTML как разметку.
	rec := do(t, h, "GET", "/api/catalog?q="+url.QueryEscape("<script>alert(1)</script>"), nil, nil)
	if rec.Code >= 500 {
		t.Fatalf("catalog search with XSS payload: 5xx")
	}
	if strings.Contains(rec.Body.String(), "<script>") {
		t.Fatal("catalog search reflected raw script tag")
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("catalog content type = %q", ct)
	}
}

// Загруженные файлы не должны отдаваться как исполняемый контент (HTML/SVG/JS).
func TestUploadsDoNotServeActiveContent(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	for _, path := range []string{
		"/uploads/com.example.chat/icon.html",
		"/uploads/com.example.chat/icon.svg",
		"/uploads/com.example.chat/icon.js",
		"/uploads/com.example.chat/artifact-windows.exe",
	} {
		if rec := do(t, h, "GET", path, nil, nil); rec.Code == http.StatusOK {
			t.Errorf("active/private upload served: %s", path)
		}
	}
}
