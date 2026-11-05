package services

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"playmarket-backend/internal/services/auth/repo"
)

const googleAuthorization = "https://accounts.google.com/o/oauth2/v2/auth"
const googleToken = "https://oauth2.googleapis.com/token"
const googleUserInfo = "https://openidconnect.googleapis.com/v1/userinfo"

func (m *Manager) GoogleStart(r *http.Request) (string, error) {
	if m.Config.GoogleClientID == "" {
		return "", errors.New("Google OAuth not configured")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	key := requestKey(r)
	s, ok := m.sessions[key]
	if !ok {
		return "", errors.New("session required")
	}
	s.OAuthState = randomToken()
	s.OAuthVerifier = randomToken()
	s.OAuthExpires = time.Now().Add(5 * time.Minute)
	m.sessions[key] = s
	challenge := sha256.Sum256([]byte(s.OAuthVerifier))
	q := url.Values{"client_id": {m.Config.GoogleClientID}, "redirect_uri": {m.origin + "/api/auth/google/callback"}, "response_type": {"code"}, "scope": {"openid email profile"}, "state": {s.OAuthState}, "nonce": {s.OAuthState}, "code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"}, "prompt": {"select_account"}}
	return googleAuthorization + "?" + q.Encode(), nil
}

// GoogleFinish exchanges an authorization code on the server and obtains the
// provider identity over authenticated HTTPS. No client-supplied ID token,
// email, callback URL, or claims are trusted. Accounts never auto-link by email.
func (m *Manager) GoogleFinish(r *http.Request) (repo.Account, error) {
	m.mu.Lock()
	key := requestKey(r)
	s, ok := m.sessions[key]
	state, verifier, expires := s.OAuthState, s.OAuthVerifier, s.OAuthExpires
	s.OAuthState = ""
	s.OAuthVerifier = ""
	s.OAuthExpires = time.Time{}
	m.sessions[key] = s
	m.mu.Unlock()
	got := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if !ok || state == "" || got == "" || subtle.ConstantTimeCompare([]byte(got), []byte(state)) != 1 || !expires.After(time.Now()) || code == "" || len(code) > 4096 || r.URL.Query().Get("error") != "" {
		return repo.Account{}, errors.New("OAuth state or code invalid")
	}
	q := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "client_id": {m.Config.GoogleClientID}, "client_secret": {m.Config.GoogleClientSecret}, "redirect_uri": {m.origin + "/api/auth/google/callback"}, "code_verifier": {verifier}}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, googleToken, strings.NewReader(q.Encode()))
	if err != nil {
		return repo.Account{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := m.Config.HTTPClient.Do(req)
	if err != nil {
		return repo.Account{}, errors.New("Google unavailable")
	}
	defer resp.Body.Close()
	var tokens struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&tokens) != nil || tokens.AccessToken == "" || !strings.EqualFold(tokens.TokenType, "Bearer") {
		return repo.Account{}, errors.New("Google code exchange failed")
	}
	claims, err := m.verifyGoogleIDToken(r, tokens.IDToken, state)
	if err != nil {
		return repo.Account{}, err
	}
	req, err = http.NewRequestWithContext(r.Context(), http.MethodGet, googleUserInfo, nil)
	if err != nil {
		return repo.Account{}, err
	}
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	profile, err := m.Config.HTTPClient.Do(req)
	if err != nil {
		return repo.Account{}, errors.New("Google unavailable")
	}
	defer profile.Body.Close()
	var identity struct {
		Subject       string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if profile.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(profile.Body, 65536)).Decode(&identity) != nil || identity.Subject == "" || identity.Subject != claims.Subject || len(identity.Subject) > 255 || !identity.EmailVerified {
		return repo.Account{}, errors.New("Google identity is not verified")
	}
	email := NormalizeEmail(identity.Email)
	if email == "" {
		return repo.Account{}, errors.New("invalid provider email")
	}
	if a, ok := m.Accounts.ByGoogle(identity.Subject); ok {
		if a.Email != email {
			return repo.Account{}, errors.New("provider email changed; administrator intervention required")
		}
		return a, nil
	}
	// A verified Google email must not take over an existing local account.
	if _, ok := m.Accounts.ByEmail(email); ok {
		return repo.Account{}, errors.New("email belongs to another sign-in method")
	}
	name := strings.TrimSpace(identity.Name)
	if name == "" {
		name = "Игрок"
	}
	if len(name) > 256 {
		name = "Игрок"
	}
	a := repo.Account{ID: randomToken(), Email: email, Name: name, GoogleSubject: identity.Subject}
	if err := m.Accounts.Create(a); err != nil {
		return repo.Account{}, err
	}
	return a, nil
}
