// Package services owns authentication, session and authorization policy.
package services

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"playmarket-backend/internal/services/auth/repo"
)

type Config struct {
	AccountsPath string
	PublicURL    string
	// Additional exact browser origins served by a trusted reverse proxy.
	AllowedOrigins     []string
	GoogleClientID     string
	GoogleClientSecret string
	AdminUserIDs       []string
	AdminGoogleEmails  []string
	AdminDeviceKey     string
	// Only enable behind a private gateway that overwrites X-Real-IP.
	TrustProxy bool
	HTTPClient *http.Client
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}
type session struct {
	Identity         string
	AccountID        string
	CSRF             string
	Expires          time.Time
	AdminUntil       time.Time
	Challenge        string
	ChallengeExpires time.Time
	OAuthState       string
	OAuthVerifier    string
	OAuthExpires     time.Time
}
type SessionView struct {
	User          *User  `json:"user"`
	CSRFToken     string `json:"csrfToken"`
	GoogleEnabled bool   `json:"googleEnabled"`
	AdminUnlocked bool   `json:"adminUnlocked"`
}
type rateBucket struct {
	Count int
	Until time.Time
}
type sessionKey struct{}
type Manager struct {
	Config     Config
	Accounts   *repo.Accounts
	mu         sync.Mutex
	sessions   map[string]session
	rates      map[string]rateBucket
	dummyHash  string
	hashSlots  chan struct{}
	cookieName string
	secure     bool
	origin     string
	origins    map[string]struct{}
	jwtKeys    map[string]*rsa.PublicKey
	jwtExpires time.Time
}

var ErrCredentials = errors.New("invalid email or password")
var ErrRegistration = errors.New("unable to create account with these credentials")

func parseOrigin(value string) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil || u.Host == "" || u.User != nil || strings.ContainsAny(u.Host, "*\\") || (u.Scheme != "https" && u.Scheme != "http") || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("authentication URL must be an absolute origin without wildcards")
	}
	if u.Scheme != "https" && u.Hostname() != "localhost" && !net.ParseIP(u.Hostname()).IsLoopback() {
		return nil, errors.New("public authentication requires HTTPS")
	}
	return u, nil
}

func New(c Config) (*Manager, error) {
	if c.PublicURL == "" {
		c.PublicURL = "http://localhost:8088"
	}
	u, err := parseOrigin(c.PublicURL)
	if err != nil {
		return nil, errors.New("PM_PUBLIC_URL must be an absolute origin")
	}
	origins := map[string]struct{}{u.Scheme + "://" + u.Host: {}}
	for _, value := range c.AllowedOrigins {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		extra, err := parseOrigin(value)
		if err != nil || (u.Scheme != "https" && extra.Scheme == "https") {
			return nil, errors.New("PM_ALLOWED_ORIGINS requires exact secure origins and an HTTPS PM_PUBLIC_URL")
		}
		origins[extra.Scheme+"://"+extra.Host] = struct{}{}
	}
	if (c.GoogleClientID == "") != (c.GoogleClientSecret == "") {
		return nil, errors.New("configure both Google OAuth credentials")
	}
	if c.AdminDeviceKey != "" && len(c.AdminDeviceKey) < 32 {
		return nil, errors.New("PM_ADMIN_DEVICE_KEY must have at least 32 bytes")
	}
	if c.AccountsPath == "" {
		return nil, errors.New("account store path required")
	}
	accounts, err := repo.Open(c.AccountsPath)
	if err != nil {
		return nil, err
	}
	dummy, err := HashPassword(randomToken())
	if err != nil {
		return nil, err
	}
	if c.HTTPClient == nil {
		c.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	m := &Manager{Config: c, Accounts: accounts, sessions: map[string]session{}, rates: map[string]rateBucket{}, dummyHash: dummy, hashSlots: make(chan struct{}, 4), secure: u.Scheme == "https", origin: u.Scheme + "://" + u.Host, cookieName: "pm_session"}
	m.origins = origins
	if m.secure {
		m.cookieName = "__Host-pm_session"
	}
	return m, nil
}

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func requestKey(r *http.Request) string {
	key, _ := r.Context().Value(sessionKey{}).(string)
	return key
}

func (m *Manager) setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: m.cookieName, Value: token, Path: "/", HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode, MaxAge: 12 * 3600})
}

// Sessions contain only server-generated credentials and live in memory. A
// process restart revokes them; account data is persisted by the repository.
func (m *Manager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !(strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws/")) || r.URL.Path == "/api/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		now := time.Now()
		key := ""
		if cookie, err := r.Cookie(m.cookieName); err == nil && len(cookie.Value) == 64 {
			if _, err := hex.DecodeString(cookie.Value); err == nil {
				key = tokenHash(cookie.Value)
			}
		}
		m.mu.Lock()
		current, ok := m.sessions[key]
		if !ok || !current.Expires.After(now) {
			delete(m.sessions, key)
			// Bootstrap a guest only through the explicit auth entry points.
			// Parallel public catalog/media requests must never issue competing
			// cookies that overwrite a just-authenticated browser session.
			if r.Method != http.MethodGet || (r.URL.Path != "/api/auth/session" && r.URL.Path != "/api/auth/google") {
				m.mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}
			// A hard bound prevents anonymous visitors exhausting memory. Expired
			// entries are removed opportunistically without per-request disk I/O.
			if len(m.sessions) >= 10000 {
				for k, s := range m.sessions {
					if !s.Expires.After(now) {
						delete(m.sessions, k)
					}
				}
			}
			if len(m.sessions) >= 10000 {
				m.mu.Unlock()
				http.Error(w, "session capacity reached", http.StatusServiceUnavailable)
				return
			}
			token := randomToken()
			key = tokenHash(token)
			m.sessions[key] = session{Identity: randomToken(), CSRF: randomToken(), Expires: now.Add(2 * time.Hour)}
			m.setCookie(w, token)
		}
		m.mu.Unlock()
		if strings.HasPrefix(r.URL.Path, "/api/auth/") || strings.HasPrefix(r.URL.Path, "/api/admin/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Referrer-Policy", "no-referrer")
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, key)))
	})
}

func (m *Manager) current(r *http.Request) (session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[requestKey(r)]
	return s, ok && s.Expires.After(time.Now())
}
func (m *Manager) role(a repo.Account) string {
	for _, id := range m.Config.AdminUserIDs {
		if id != "" && a.ID == id {
			return "admin"
		}
	}
	if a.GoogleSubject != "" {
		for _, email := range m.Config.AdminGoogleEmails {
			if strings.EqualFold(a.Email, strings.TrimSpace(email)) {
				return "admin"
			}
		}
	}
	return "user"
}
func (m *Manager) user(s session) *User {
	if a, ok := m.Accounts.ByID(s.AccountID); ok {
		return &User{a.ID, a.Email, a.Name, m.role(a)}
	}
	return nil
}
func (m *Manager) View(r *http.Request) SessionView {
	s, _ := m.current(r)
	return SessionView{m.user(s), s.CSRF, m.Config.GoogleClientID != "", s.AdminUntil.After(time.Now())}
}
func (m *Manager) UserID(r *http.Request) string {
	s, ok := m.current(r)
	if !ok {
		return ""
	}
	if s.AccountID != "" {
		return s.AccountID
	}
	return "guest:" + s.Identity
}

func (m *Manager) CheckCSRF(r *http.Request) bool {
	s, ok := m.current(r)
	if !ok {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin != "" {
		if _, allowed := m.origins[origin]; !allowed {
			return false
		}
	}
	got := r.Header.Get("X-CSRF-Token")
	return got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(s.CSRF)) == 1
}

func (m *Manager) RequireAdmin(w http.ResponseWriter, r *http.Request) bool {
	s, ok := m.current(r)
	u := m.user(s)
	if !ok || u == nil {
		writeFailure(w, http.StatusUnauthorized, "authentication required")
		return false
	}
	if u.Role != "admin" || !s.AdminUntil.After(time.Now()) || m.Config.AdminDeviceKey == "" {
		writeFailure(w, http.StatusForbidden, "admin device verification required")
		return false
	}
	if !m.CheckCSRF(r) {
		writeFailure(w, http.StatusForbidden, "invalid CSRF token")
		return false
	}
	return true
}

func writeFailure(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":"` + message + `"}`))
}

func (m *Manager) clientIP(r *http.Request) string {
	if m.Config.TrustProxy {
		if ip := net.ParseIP(r.Header.Get("X-Real-IP")); ip != nil {
			return ip.String()
		}
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return ip
	}
	return r.RemoteAddr
}
func (m *Manager) Allow(r *http.Request, category, email string) bool {
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.rates) > 20000 {
		for k, v := range m.rates {
			if !v.Until.After(now) {
				delete(m.rates, k)
			}
		}
		if len(m.rates) > 20000 {
			return false
		}
	}
	keys := []string{category + ":ip:" + m.clientIP(r)}
	if email != "" {
		keys = append(keys, category+":email:"+email)
	}
	for _, key := range keys {
		v := m.rates[key]
		if v.Until.After(now) && v.Count >= 10 {
			return false
		}
	}
	for _, key := range keys {
		v := m.rates[key]
		if !v.Until.After(now) {
			v = rateBucket{Until: now.Add(10 * time.Minute)}
		}
		v.Count++
		m.rates[key] = v
	}
	return true
}

func NormalizeEmail(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	a, err := mail.ParseAddress(email)
	if err != nil || a.Address != email || len(email) > 254 || !strings.Contains(email, "@") {
		return ""
	}
	return email
}

func (m *Manager) HashSlot() bool {
	select {
	case m.hashSlots <- struct{}{}:
		return true
	default:
		return false
	}
}
func (m *Manager) ReleaseHashSlot() { <-m.hashSlots }

func (m *Manager) Register(email, password, name string) (repo.Account, error) {
	// Always derive a password even for an existing email to reduce enumeration
	// timing; the controller caps input length before this work is reached.
	hash, err := HashPassword(password)
	if err != nil {
		return repo.Account{}, err
	}
	if email == "" || utf8.RuneCountInString(password) < 12 || len(password) > 1024 {
		return repo.Account{}, ErrRegistration
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Игрок"
	}
	if utf8.RuneCountInString(name) > 64 {
		return repo.Account{}, ErrRegistration
	}
	a := repo.Account{ID: randomToken(), Email: email, Name: name, PasswordHash: hash}
	if err := m.Accounts.Create(a); err != nil {
		return repo.Account{}, ErrRegistration
	}
	return a, nil
}
func (m *Manager) Login(email, password string) (repo.Account, error) {
	a, ok := m.Accounts.ByEmail(email)
	hash := a.PasswordHash
	if !ok || hash == "" {
		hash = m.dummyHash
	}
	valid := VerifyPassword(hash, password)
	if !ok || a.PasswordHash == "" || !valid {
		return repo.Account{}, ErrCredentials
	}
	return a, nil
}

func (m *Manager) Rotate(w http.ResponseWriter, r *http.Request, accountID string) *http.Request {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, requestKey(r))
	token := randomToken()
	key := tokenHash(token)
	m.sessions[key] = session{Identity: randomToken(), AccountID: accountID, CSRF: randomToken(), Expires: time.Now().Add(12 * time.Hour)}
	m.setCookie(w, token)
	return r.WithContext(context.WithValue(r.Context(), sessionKey{}, key))
}
