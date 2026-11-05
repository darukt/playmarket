package controller

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"playmarket-backend/internal/services/auth"
	authrepo "playmarket-backend/internal/services/auth/repo"
	authservices "playmarket-backend/internal/services/auth/services"
	transfer "playmarket-backend/internal/services/transfers/services"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"playmarket-backend/internal/services/catalog/services"
	scorescontroller "playmarket-backend/internal/services/scores/controller"
	"playmarket-backend/internal/services/scores/services"
)

type scoresResponse = scorescontroller.Response

const testUID = "0123456789abcdef0123456789abcdef"

var testWindowsPackage = []byte("MZ-uploaded-package-fixture")

func newTestServer(t *testing.T) *server {
	t.Helper()
	dir := t.TempDir()
	seed := `[
	  {"id":"com.example.chat","name":"Example Chat","developer":"Example","genre":"Чат","category":"social","rating":4.5,"downloadsM":10,"kind":"app","detail":{"description":"d","itempropDescription":"d","screenshots":[]}},
	  {"id":"com.example.music","name":"Example Music","developer":"Other","genre":"Музыка","category":"music","rating":4.1,"downloadsM":500,"kind":"app","detail":{"description":"d","itempropDescription":"d","screenshots":[]}},
	  {"id":"web.snake","name":"Змейка","developer":"Play Market Studio","genre":"Аркада","category":"games","rating":4.8,"kind":"web","game":"snake","detail":{"description":"d","itempropDescription":"d","screenshots":[]}}
	]`
	seedPath := filepath.Join(dir, "seed.json")
	if err := os.WriteFile(seedPath, []byte(seed), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := catalog.Open(dir, seedPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	// A real uploaded fixture exercises disk streaming; no demo package fallback.
	if err := os.MkdirAll(store.UploadsDir("com.example.chat"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.UploadsDir("com.example.chat"), "artifact-windows.exe"), testWindowsPackage, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store.UploadsDir("com.example.chat"), "artifact-android.apk"), []byte("PK-real-apk-fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	us, err := openUsers(filepath.Join(dir, "users.json"))
	if err != nil {
		t.Fatal(err)
	}
	board, err := scores.Open(filepath.Join(dir, "scores.json"))
	if err != nil {
		t.Fatal(err)
	}
	manager, err := auth.New(auth.Config{AccountsPath: filepath.Join(dir, "accounts.json"), PublicURL: "http://localhost", AdminUserIDs: []string{"admin-test"}, AdminDeviceKey: strings.Repeat("k", 32)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testSessions.Delete(t) })
	return &server{store: store, users: us, scores: board, auth: manager, tcpKey: strings.Repeat("t", 32), started: time.Now()}
}

type testClient struct {
	cookies []*http.Cookie
	csrf    string
}

var testSessions sync.Map

func do(t *testing.T, h http.Handler, method, target string, body io.Reader, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	value, _ := testSessions.LoadOrStore(t, &testClient{})
	client := value.(*testClient)
	bootstrap := httptest.NewRequest("GET", "/api/auth/session", nil)
	for _, c := range client.cookies {
		bootstrap.AddCookie(c)
	}
	boot := httptest.NewRecorder()
	h.ServeHTTP(boot, bootstrap)
	if c := boot.Result().Cookies(); len(c) > 0 {
		client.cookies = c
	}
	var view struct{ CSRFToken string }
	_ = json.Unmarshal(boot.Body.Bytes(), &view)
	client.csrf = view.CSRFToken
	req := httptest.NewRequest(method, target, body)
	for _, c := range client.cookies {
		req.AddCookie(c)
	}
	req.AddCookie(&http.Cookie{Name: "pm_uid", Value: testUID})
	req.Header.Set("X-CSRF-Token", client.csrf)
	req.Header.Set("Origin", "http://localhost")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if c := rec.Result().Cookies(); len(c) > 0 {
		client.cookies = c
	}
	return rec
}
func loginFixture(t *testing.T, s *server, h http.Handler) {
	t.Helper()
	hash, err := authservices.HashPassword("correct-horse-battery")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.auth.Accounts.Create(authrepo.Account{ID: "admin-test", Email: "admin@example.com", Name: "Admin", PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]string{"email": "admin@example.com", "password": "correct-horse-battery"})
	if rec := do(t, h, "POST", "/api/auth/login", bytes.NewReader(payload), map[string]string{"Content-Type": "application/json"}); rec.Code != 200 {
		t.Fatalf("login: %d %s", rec.Code, rec.Body.String())
	}
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestHealthAndMethods(t *testing.T) {
	h := newTestServer(t).routes(true)
	if rec := do(t, h, "GET", "/api/healthz", nil, nil); rec.Code != 200 {
		t.Fatalf("healthz: %d", rec.Code)
	}
	rec := do(t, h, "POST", "/api/healthz", nil, nil)
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") == "" {
		t.Fatalf("POST healthz: %d allow=%q", rec.Code, rec.Header().Get("Allow"))
	}
	if rec := do(t, h, "GET", "/api/nope", nil, nil); rec.Code != 404 || !strings.Contains(rec.Body.String(), "error") {
		t.Fatalf("unknown api: %d %s", rec.Code, rec.Body.String())
	}
}

func TestCookieIssuedOnlyForNonStatic(t *testing.T) {
	h := newTestServer(t).routes(true)
	req := httptest.NewRequest("GET", "/api/auth/session", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !strings.Contains(rec.Header().Get("Set-Cookie"), "pm_session=") {
		t.Fatal("expected opaque session cookie for explicit bootstrap")
	}
	req = httptest.NewRequest("GET", "/assets/app.js", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatal("static request must not issue a cookie")
	}
	if rec.Code != 404 {
		t.Fatalf("missing asset should be 404, got %d", rec.Code)
	}
}

func TestCatalogFilter(t *testing.T) {
	h := newTestServer(t).routes(true)
	all := decode[[]catalog.Entry](t, do(t, h, "GET", "/api/catalog", nil, nil))
	if len(all) != 3 {
		t.Fatalf("all: %d", len(all))
	}
	web := decode[[]catalog.Entry](t, do(t, h, "GET", "/api/catalog?kind=web", nil, nil))
	if len(web) != 1 || web[0].ID != "web.snake" {
		t.Fatalf("kind=web: %+v", web)
	}
	q := decode[[]catalog.Entry](t, do(t, h, "GET", "/api/catalog?q=music", nil, nil))
	if len(q) != 1 || q[0].ID != "com.example.music" {
		t.Fatalf("q=music: %+v", q)
	}
	byDl := decode[[]catalog.Entry](t, do(t, h, "GET", "/api/catalog?sort=downloads&limit=1", nil, nil))
	if len(byDl) != 1 || byDl[0].ID != "com.example.music" {
		t.Fatalf("sort=downloads: %+v", byDl)
	}
	if rec := do(t, h, "GET", "/api/apps/com.example.chat", nil, nil); rec.Code != 200 {
		t.Fatalf("app: %d", rec.Code)
	}
	if rec := do(t, h, "GET", "/api/apps/missing", nil, nil); rec.Code != 404 {
		t.Fatalf("missing app: %d", rec.Code)
	}
}

func TestScores(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	loginFixture(t, s, h)
	post := func(body string) *httptest.ResponseRecorder {
		return do(t, h, "POST", "/api/games/snake/scores", strings.NewReader(body), map[string]string{"Content-Type": "application/json"})
	}
	if rec := do(t, h, "GET", "/api/games/tetris/scores", nil, nil); rec.Code != 404 {
		t.Fatalf("unknown game: %d", rec.Code)
	}
	if rec := post(`{"name":"<script>","score":5}`); rec.Code != 400 {
		t.Fatalf("bad name: %d", rec.Code)
	}
	if rec := post(`{"name":"Аня","score":999999}`); rec.Code != 400 {
		t.Fatalf("score over cap: %d", rec.Code)
	}
	rec := post(`{"name":"Аня","score":42}`)
	if rec.Code != 200 {
		t.Fatalf("submit: %d %s", rec.Code, rec.Body.String())
	}
	res := decode[struct {
		Rank     int  `json:"rank"`
		Improved bool `json:"improved"`
	}](t, rec)
	if res.Rank != 1 || !res.Improved {
		t.Fatalf("submit result: %+v", res)
	}
	if rec := post(`{"name":"Аня","score":50}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("rate limit: %d", rec.Code)
	}
	board := decode[scoresResponse](t, do(t, h, "GET", "/api/games/snake/scores", nil, nil))
	if len(board.Top) != 1 || board.Top[0].Score != 42 || !board.Top[0].Mine || board.Me == nil || board.Me.Rank != 1 {
		t.Fatalf("board: %+v", board)
	}
	if strings.Contains(do(t, h, "GET", "/api/games/snake/scores", nil, nil).Body.String(), testUID) {
		t.Fatal("uuid must not leak into public leaderboard")
	}
}

func TestDownloads(t *testing.T) {
	h := newTestServer(t).routes(true)
	rec := do(t, h, "GET", "/api/download/com.example.chat?platform=windows", nil, nil)
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), testWindowsPackage) {
		t.Fatalf("windows: %d %q", rec.Code, rec.Body.String())
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "Example-Chat-Setup.exe") {
		t.Fatalf("content-disposition: %q", cd)
	}
	rec = do(t, h, "GET", "/api/download/com.example.chat?platform=android", nil, nil)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/vnd.android.package-archive" || !bytes.HasPrefix(rec.Body.Bytes(), []byte("PK")) {
		t.Fatalf("android apk: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if rec := do(t, h, "GET", "/api/download/web.snake", nil, nil); rec.Code != http.StatusConflict {
		t.Fatalf("web game download: %d", rec.Code)
	}
	if rec := do(t, h, "GET", "/api/download/missing", nil, nil); rec.Code != 404 {
		t.Fatalf("missing: %d", rec.Code)
	}
}

func multipartBody(t *testing.T, fields map[string]string, files map[string][]byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	for field, data := range files {
		fw, err := mw.CreateFormFile(field, field+".bin")
		if err != nil {
			t.Fatal(err)
		}
		_, _ = fw.Write(data)
	}
	_ = mw.Close()
	return &buf, mw.FormDataContentType()
}

func TestAdminLifecycle(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	key := map[string]string{}

	if rec := do(t, h, "GET", "/api/admin/games", nil, nil); rec.Code != 401 {
		t.Fatalf("no key: %d", rec.Code)
	}
	if rec := do(t, h, "GET", "/api/admin/games", nil, map[string]string{"X-Admin-Key": "wrong"}); rec.Code != 401 {
		t.Fatalf("wrong key: %d", rec.Code)
	}

	loginFixture(t, s, h)
	if rec := do(t, h, "GET", "/api/admin/stats", nil, key); rec.Code != 403 {
		t.Fatalf("admin needs device handshake: %d", rec.Code)
	}
	challengeRec := do(t, h, "POST", "/api/auth/admin/challenge", nil, key)
	var challenge struct{ Challenge string }
	if err := json.Unmarshal(challengeRec.Body.Bytes(), &challenge); err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha256.New, []byte(strings.Repeat("k", 32)))
	mac.Write([]byte(challenge.Challenge))
	proof := hex.EncodeToString(mac.Sum(nil))
	payload, _ := json.Marshal(map[string]string{"proof": proof})
	verify := do(t, h, "POST", "/api/auth/admin/verify", bytes.NewReader(payload), map[string]string{"Content-Type": "application/json"})
	if verify.Code != 200 {
		t.Fatalf("device handshake: %d %s", verify.Code, verify.Body.String())
	}
	apk := []byte("PK-real-apk")
	body, ct := multipartBody(t,
		map[string]string{"name": "My Tool", "description": "Полезная штука"},
		map[string][]byte{"artifactAndroid": apk})
	rec := do(t, h, "POST", "/api/admin/games", body, map[string]string{"X-Admin-Key": "secret", "Content-Type": ct})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: %d %s", rec.Code, rec.Body.String())
	}
	added := decode[struct {
		Entry catalog.Entry `json:"entry"`
	}](t, rec)
	id := added.Entry.ID
	if id != "custom-my-tool" {
		t.Fatalf("id: %q", id)
	}

	list := decode[[]catalog.Entry](t, do(t, h, "GET", "/api/admin/games", nil, key))
	if len(list) != 1 {
		t.Fatalf("list: %d", len(list))
	}

	rec = do(t, h, "GET", "/api/download/"+id+"?platform=android", nil, nil)
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), apk) || !strings.Contains(rec.Header().Get("Content-Disposition"), ".apk") {
		t.Fatalf("uploaded apk: %d %q %q", rec.Code, rec.Body.String(), rec.Header().Get("Content-Disposition"))
	}

	stats := decode[struct {
		Downloads catalog.Stats `json:"downloads"`
	}](t, do(t, h, "GET", "/api/admin/stats", nil, key))
	if stats.Downloads.Total != 1 || stats.Downloads.ByApp[id] != 1 {
		t.Fatalf("stats: %+v", stats.Downloads)
	}

	if rec := do(t, h, "DELETE", "/api/admin/games/com.example.chat", nil, key); rec.Code != http.StatusForbidden {
		t.Fatalf("delete seed: %d", rec.Code)
	}
	if rec := do(t, h, "DELETE", "/api/admin/games/"+id, nil, key); rec.Code != 200 {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(t, h, "GET", "/api/apps/"+id, nil, nil); rec.Code != 404 {
		t.Fatalf("after delete: %d", rec.Code)
	}
}

func TestUploadsTraversal(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	for _, p := range []string{"/uploads/", "/uploads/missing/icon.webp"} {
		if rec := do(t, h, "GET", p, nil, nil); rec.Code != 404 {
			t.Fatalf("%s: %d", p, rec.Code)
		}
	}
	// Прямой вызов обходит редирект ServeMux и проверяет защиту самого обработчика.
	for _, p := range []string{"/uploads/../seed.json", "/uploads/a/../../seed.json", "/uploads/"} {
		req := httptest.NewRequest("GET", p, nil)
		rec := httptest.NewRecorder()
		s.uploads(rec, req)
		if rec.Code != 404 {
			t.Fatalf("direct %s: %d", p, rec.Code)
		}
	}
}

func TestWebSocketDownload(t *testing.T) {
	ts := httptest.NewServer(newTestServer(t).routes(true))
	defer ts.Close()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/download?id=com.example.chat&platform=windows"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	var start wsMessage
	if err := conn.ReadJSON(&start); err != nil || start.Type != "start" || start.Size != int64(len(testWindowsPackage)) {
		t.Fatalf("start: %+v %v", start, err)
	}
	var got []byte
	for {
		kind, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if kind == websocket.BinaryMessage {
			got = append(got, data...)
			continue
		}
		var done wsMessage
		_ = json.Unmarshal(data, &done)
		if done.Type != "done" || done.Bytes != int64(len(testWindowsPackage)) {
			t.Fatalf("done: %+v", done)
		}
		break
	}
	if !bytes.Equal(got, testWindowsPackage) {
		t.Fatalf("payload: %q", got)
	}
}

func tcpChallenge(t *testing.T, c net.Conn) *bufio.Reader {
	t.Helper()
	_ = c.SetDeadline(time.Now().Add(time.Second))
	r := bufio.NewReader(c)
	line, err := r.ReadString('\n')
	if err != nil || !strings.HasPrefix(line, "PM2-CHALLENGE ") {
		t.Fatalf("challenge: %q %v", line, err)
	}
	return r
}

func TestTCPProtocol(t *testing.T) {
	s := newTestServer(t)
	client, srv := net.Pipe()
	go handleTCPConn(srv, s)
	defer client.Close()
	_ = client.SetDeadline(time.Now().Add(time.Second))
	r := bufio.NewReader(client)
	challenge, err := r.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	nonce := strings.TrimSpace(strings.TrimPrefix(challenge, "PM2-CHALLENGE "))
	proof := transfer.Proof(s.tcpKey, nonce, "com.example.chat", "windows")
	_, _ = io.WriteString(client, "PM2-GET com.example.chat windows "+proof+"\n")
	header, err := r.ReadString('\n')
	if err != nil || header != fmt.Sprintf("PM2-OK %d Example-Chat-Setup.exe\n", len(testWindowsPackage)) {
		t.Fatalf("header: %q %v", header, err)
	}
	body := make([]byte, len(testWindowsPackage))
	if _, err := io.ReadFull(r, body); err != nil || !bytes.Equal(body, testWindowsPackage) {
		t.Fatalf("body: %q %v", body, err)
	}
	for _, request := range []string{"PM1-GET com.example.chat windows\n", "PM2-GET com.example.chat windows " + proof + "\n"} {
		c2, s2 := net.Pipe()
		go handleTCPConn(s2, s)
		r2 := tcpChallenge(t, c2)
		_, _ = io.WriteString(c2, request)
		line, _ := r2.ReadString('\n')
		c2.Close()
		if !strings.HasPrefix(line, "PM2-ERR") {
			t.Fatalf("anonymous/replayed proof accepted: %q", line)
		}
	}
}

func TestPrivatePathsAndLegacyIdentity(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	for _, path := range []string{"/backend/data/users.json", "/data/users.json", "/.env", "/api/users/" + testUID, "/uploads/a/artifact-windows.exe"} {
		if rec := do(t, h, "GET", path, nil, nil); rec.Code != 404 {
			t.Fatalf("private path %s returned %d", path, rec.Code)
		}
	}
	me := do(t, h, "GET", "/api/me?uuid="+testUID, nil, nil)
	if strings.Contains(me.Body.String(), testUID) {
		t.Fatal("legacy/client selected identity trusted")
	}
	if rec := do(t, h, "GET", "/api/admin/stats", nil, map[string]string{"X-Admin-Key": "secret"}); rec.Code != 401 {
		t.Fatalf("header authenticated admin: %d", rec.Code)
	}
}
func TestTCPPublicListenerRequiresTLS(t *testing.T) {
	t.Setenv("PM_TCP_TLS_CERT", "")
	t.Setenv("PM_TCP_TLS_KEY", "")
	if err := listenTCP(context.Background(), "0.0.0.0:0", newTestServer(t)); err == nil {
		t.Fatal("public plaintext TCP listener accepted")
	}
}
func TestHEADDoesNotCountDownload(t *testing.T) {
	s := newTestServer(t)
	h := s.routes(true)
	rec := do(t, h, "HEAD", "/api/download/com.example.chat?platform=windows", nil, nil)
	if rec.Code != 200 || rec.Header().Get("Content-Length") == "" || rec.Body.Len() != 0 {
		t.Fatalf("head metadata: %d %s", rec.Code, rec.Body.String())
	}
	stats, err := s.store.DownloadStats(10)
	if err != nil || stats.Total != 0 {
		t.Fatalf("preflight counted as download: %+v %v", stats, err)
	}
}
