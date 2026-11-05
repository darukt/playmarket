package auth_test

import (
	"bytes"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"playmarket-backend/internal/services/auth"
	"playmarket-backend/internal/services/auth/repo"
	"playmarket-backend/internal/services/auth/services"
)

type client struct {
	t      *testing.T
	h      http.Handler
	cookie *http.Cookie
	csrf   string
}

func setup(t *testing.T, configure func(*auth.Config)) (*auth.Manager, *client) {
	t.Helper()
	config := auth.Config{AccountsPath: filepath.Join(t.TempDir(), "accounts.json"), PublicURL: "http://localhost:8088"}
	if configure != nil {
		configure(&config)
	}
	m, err := auth.New(config)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	m.RegisterRoutes(mux)
	mux.HandleFunc("/api/admin/test", func(w http.ResponseWriter, r *http.Request) {
		if m.RequireAdmin(w, r) {
			w.WriteHeader(http.StatusOK)
		}
	})
	c := &client{t: t, h: m.Middleware(mux)}
	c.do(http.MethodGet, "/api/auth/session", nil, true)
	return m, c
}
func (c *client) do(method, target string, payload any, csrf bool) *httptest.ResponseRecorder {
	c.t.Helper()
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			c.t.Fatal(err)
		}
		body = bytes.NewReader(b)
	}
	r := httptest.NewRequest(method, target, body)
	r.RemoteAddr = "192.0.2.10:2345"
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	if csrf {
		r.Header.Set("X-CSRF-Token", c.csrf)
	}
	if payload != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	for _, cookie := range w.Result().Cookies() {
		c.cookie = cookie
	}
	var view services.SessionView
	if json.Unmarshal(w.Body.Bytes(), &view) == nil && view.CSRFToken != "" {
		c.csrf = view.CSRFToken
	}
	return w
}
func expect(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("want %d, got %d: %s", status, w.Code, w.Body.String())
	}
}

func TestRegistrationSessionRotationAndPrivateScope(t *testing.T) {
	m, c := setup(t, nil)
	oldCookie, oldCSRF := *c.cookie, c.csrf
	expect(t, c.do("POST", "/api/auth/register", map[string]string{"email": "person@example.com", "password": "a-long-unusual-password", "name": "Аня"}, false), 403)
	w := c.do("POST", "/api/auth/register", map[string]string{"email": "person@example.com", "password": "a-long-unusual-password", "name": "Аня"}, true)
	expect(t, w, 201)
	if c.cookie.Value == oldCookie.Value || c.csrf == oldCSRF {
		t.Fatal("login must rotate session and CSRF")
	}
	if !c.cookie.HttpOnly || c.cookie.SameSite != http.SameSiteLaxMode {
		t.Fatal("cookie flags")
	}
	var view services.SessionView
	json.Unmarshal(w.Body.Bytes(), &view)
	if view.User == nil || view.User.Email != "person@example.com" || view.User.Role != "user" {
		t.Fatalf("bad user: %+v", view)
	}
	if strings.Contains(w.Body.String(), "passwordHash") || strings.Contains(w.Body.String(), "PasswordHash") {
		t.Fatal("hash leaked")
	}
	// URL identifiers are never used to select private account data.
	w = c.do("GET", "/api/auth/session?id=someone-else&email=other@example.com", nil, true)
	expect(t, w, 200)
	if !strings.Contains(w.Body.String(), "person@example.com") || strings.Contains(w.Body.String(), "other@example.com") {
		t.Fatal("request query changed private principal")
	}
	old := &client{t: t, h: c.h, cookie: &oldCookie, csrf: oldCSRF}
	w = old.do("GET", "/api/auth/session", nil, true)
	if strings.Contains(w.Body.String(), "person@example.com") {
		t.Fatal("old session remained valid")
	}
	a, _ := m.Accounts.ByEmail("person@example.com")
	if a.PasswordHash == "" || strings.Contains(a.PasswordHash, "a-long-unusual-password") {
		t.Fatal("password not hashed")
	}
	expect(t, c.do("POST", "/api/auth/logout", nil, true), 200)
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "missing@example.com", "password": "a-long-unusual-password"}, true), 401)
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "person@example.com", "password": "wrong-password"}, true), 401)
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "person@example.com", "password": "a-long-unusual-password"}, true), 200)
}

func TestCSRFOriginAndForgedCookies(t *testing.T) {
	_, c := setup(t, nil)
	r := httptest.NewRequest("POST", "/api/auth/logout", nil)
	r.AddCookie(c.cookie)
	r.Header.Set("X-CSRF-Token", c.csrf)
	r.Header.Set("Origin", "https://attacker.example")
	w := httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	expect(t, w, 403)
	r = httptest.NewRequest("GET", "/api/auth/session", nil)
	r.AddCookie(&http.Cookie{Name: "pm_session", Value: strings.Repeat("a", 64)})
	r.AddCookie(&http.Cookie{Name: "pm_uid", Value: "admin-test"})
	w = httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	expect(t, w, 200)
	if strings.Contains(w.Body.String(), `"role":"admin"`) {
		t.Fatal("forged identity accepted")
	}
}

func TestOnlyExplicitAuthBootstrapIssuesAnonymousCookie(t *testing.T) {
	_, c := setup(t, nil)
	for _, path := range []string{"/api/catalog", "/api/games/snake/scores", "/api/me", "/ws/download"} {
		r := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		c.h.ServeHTTP(w, r)
		if w.Header().Get("Set-Cookie") != "" {
			t.Fatalf("parallel public request %s issued competing session cookie", path)
		}
	}
	r := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(`{"email":"a@example.com","password":"long-password"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	expect(t, w, 403)
	if w.Header().Get("Set-Cookie") != "" {
		t.Fatal("mutation issued session instead of requiring bootstrap")
	}
}

func TestAdminRequiresRoleAndSingleUseDeviceHandshake(t *testing.T) {
	key := strings.Repeat("secret-device-", 4)
	m, c := setup(t, func(config *auth.Config) { config.AdminUserIDs = []string{"admin-test"}; config.AdminDeviceKey = key })
	hash, err := services.HashPassword("admin-long-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Accounts.Create(repo.Account{ID: "admin-test", Email: "admin@example.com", Name: "Admin", PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/api/admin/test", nil)
	r.Header.Set("X-Admin-Key", key)
	w := httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	expect(t, w, 401)
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "admin@example.com", "password": "admin-long-password"}, true), 200)
	expect(t, c.do("GET", "/api/admin/test", nil, true), 403)
	w = c.do("POST", "/api/auth/admin/challenge", nil, true)
	expect(t, w, 200)
	var challenge struct {
		Challenge string `json:"challenge"`
	}
	json.Unmarshal(w.Body.Bytes(), &challenge)
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(challenge.Challenge))
	proof := hex.EncodeToString(mac.Sum(nil))
	expect(t, c.do("POST", "/api/auth/admin/verify", map[string]string{"proof": proof}, true), 200)
	expect(t, c.do("GET", "/api/admin/test", nil, true), 200)
	expect(t, c.do("GET", "/api/admin/test", nil, false), 403)
	expect(t, c.do("POST", "/api/auth/admin/verify", map[string]string{"proof": proof}, true), 403)
}

func TestLocalRegistrationCannotClaimGoogleAdminEmail(t *testing.T) {
	_, c := setup(t, func(config *auth.Config) {
		config.AdminGoogleEmails = []string{"admin@example.com"}
		config.AdminDeviceKey = strings.Repeat("s", 32)
	})
	w := c.do("POST", "/api/auth/register", map[string]string{"email": "admin@example.com", "password": "long-enough-password"}, true)
	expect(t, w, 201)
	if !strings.Contains(w.Body.String(), `"role":"user"`) {
		t.Fatal("unverified local email granted admin")
	}
	expect(t, c.do("POST", "/api/auth/admin/challenge", nil, true), 403)
}

func TestAuthenticationRateLimit(t *testing.T) {
	_, c := setup(t, nil)
	for i := 0; i < 10; i++ {
		expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "missing@example.com", "password": "invalid-password"}, true), 401)
	}
	expect(t, c.do("POST", "/api/auth/login", map[string]string{"email": "missing@example.com", "password": "invalid-password"}, true), 429)
}

type roundTripper func(*http.Request) (*http.Response, error)

func (f roundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(body string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func TestGooglePKCEStateAndProviderIdentity(t *testing.T) {
	var verifier string
	var nonce string
	audience := "client"
	expiration := time.Now().Add(time.Hour).Unix()
	badSignature := false
	profileRequests := 0
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	clientHTTP := &http.Client{Transport: roundTripper(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Host {
		case "oauth2.googleapis.com":
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			verifier = r.Form.Get("code_verifier")
			if verifier == "" || r.Form.Get("client_secret") != "secret" || r.Form.Get("redirect_uri") != "http://localhost:8088/api/auth/google/callback" {
				t.Fatal("invalid token exchange")
			}
			header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","kid":"google-test"}`))
			claims, _ := json.Marshal(map[string]any{"iss": "https://accounts.google.com", "aud": audience, "sub": "google-123", "exp": expiration, "iat": time.Now().Unix(), "nonce": nonce})
			message := header + "." + base64.RawURLEncoding.EncodeToString(claims)
			sum := sha256.Sum256([]byte(message))
			signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, sum[:])
			if err != nil {
				t.Fatal(err)
			}
			if badSignature {
				signature[0] ^= 1
			}
			data, _ := json.Marshal(map[string]string{"access_token": "provider-token", "token_type": "Bearer", "id_token": message + "." + base64.RawURLEncoding.EncodeToString(signature)})
			return response(string(data)), nil
		case "www.googleapis.com":
			data, _ := json.Marshal(map[string]any{"keys": []map[string]string{{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "google-test", "n": base64.RawURLEncoding.EncodeToString(privateKey.N.Bytes()), "e": "AQAB"}}})
			return response(string(data)), nil
		case "openidconnect.googleapis.com":
			profileRequests++
			if r.Header.Get("Authorization") != "Bearer provider-token" {
				t.Fatal("missing provider auth")
			}
			return response(`{"sub":"google-123","email":"google@example.com","email_verified":true,"name":"Google User"}`), nil
		default:
			t.Fatalf("unexpected provider host %s", r.URL.Host)
			return nil, nil
		}
	})}
	_, c := setup(t, func(config *auth.Config) {
		config.GoogleClientID = "client"
		config.GoogleClientSecret = "secret"
		config.HTTPClient = clientHTTP
	})
	w := c.do("GET", "/api/auth/google", nil, true)
	expect(t, w, 302)
	u, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	state := u.Query().Get("state")
	nonce = u.Query().Get("nonce")
	if len(state) < 32 || u.Query().Get("code_challenge_method") != "S256" {
		t.Fatal("missing state or PKCE")
	}
	w = c.do("GET", "/api/auth/google/callback?state="+state+"&code=server-code", nil, true)
	expect(t, w, 303)
	if w.Header().Get("Location") != "/?auth=success" || verifier == "" {
		t.Fatalf("OAuth callback failed: %s", w.Header().Get("Location"))
	}
	w = c.do("GET", "/api/auth/session", nil, true)
	expect(t, w, 200)
	if !strings.Contains(w.Body.String(), "google@example.com") {
		t.Fatal("provider identity not logged in")
	}
	// The state cannot be replayed after session rotation.
	w = c.do("GET", "/api/auth/google/callback?state="+state+"&code=server-code", nil, true)
	if w.Header().Get("Location") != "/?auth=error" {
		t.Fatal("OAuth state replay accepted")
	}
	// Reject correctly signed claims for another client, a bad nonce, expired
	// claims and a forged signature before using any user profile information.
	for _, failure := range []string{"audience", "nonce", "expired", "signature"} {
		w = c.do("GET", "/api/auth/google", nil, true)
		expect(t, w, 302)
		u, _ = url.Parse(w.Header().Get("Location"))
		state = u.Query().Get("state")
		nonce = u.Query().Get("nonce")
		audience = "client"
		expiration = time.Now().Add(time.Hour).Unix()
		badSignature = false
		switch failure {
		case "audience":
			audience = "attacker-client"
		case "nonce":
			nonce = "forged-nonce"
		case "expired":
			expiration = time.Now().Add(-time.Minute).Unix()
		case "signature":
			badSignature = true
		}
		w = c.do("GET", "/api/auth/google/callback?state="+state+"&code=server-code", nil, true)
		if w.Header().Get("Location") != "/?auth=error" {
			t.Fatalf("accepted invalid %s", failure)
		}
	}
	if profileRequests != 1 {
		t.Fatal("invalid token reached provider profile lookup")
	}
}

func TestConfigRejectsUnsafePublicHTTPAndWeakDeviceKey(t *testing.T) {
	for _, config := range []auth.Config{{AccountsPath: filepath.Join(t.TempDir(), "a.json"), PublicURL: "http://public.example"}, {AccountsPath: filepath.Join(t.TempDir(), "b.json"), PublicURL: "https://safe.example", AdminDeviceKey: "weak"}} {
		if _, err := auth.New(config); err == nil {
			t.Fatal("insecure config accepted")
		}
	}
}

func TestAccountPersistenceReplacesExistingFileAndPreservesIndexes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "accounts.json")
	accounts, err := repo.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range []repo.Account{{ID: "local-id", Email: "local@example.com", Name: "Local", PasswordHash: "stored-password-hash"}, {ID: "google-id", Email: "google@example.com", Name: "Google", GoogleSubject: "provider-subject"}} {
		if err := accounts.Create(a); err != nil {
			t.Fatal(err)
		}
	}
	if err := accounts.Create(repo.Account{ID: "duplicate", Email: "local@example.com"}); err != repo.ErrExists {
		t.Fatal("duplicate email accepted")
	}
	reopened, err := repo.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if a, ok := reopened.ByEmail("local@example.com"); !ok || a.ID != "local-id" || a.PasswordHash != "stored-password-hash" {
		t.Fatal("local persistence lost")
	}
	if a, ok := reopened.ByGoogle("provider-subject"); !ok || a.ID != "google-id" {
		t.Fatal("provider persistence lost")
	}
}
