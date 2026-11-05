package services

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"
)

type googleClaims struct {
	Issuer          string `json:"iss"`
	Audience        string `json:"aud"`
	AuthorizedParty string `json:"azp"`
	Subject         string `json:"sub"`
	Nonce           string `json:"nonce"`
	Expires         int64  `json:"exp"`
	Issued          int64  `json:"iat"`
}

func (m *Manager) verifyGoogleIDToken(r *http.Request, token, nonce string) (googleClaims, error) {
	invalid := errors.New("invalid Google ID token")
	parts := strings.Split(token, ".")
	if len(parts) != 3 || len(token) > 16384 {
		return googleClaims{}, invalid
	}
	var header struct {
		Algorithm string `json:"alg"`
		KeyID     string `json:"kid"`
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(b, &header) != nil || header.Algorithm != "RS256" || header.KeyID == "" {
		return googleClaims{}, invalid
	}
	key, err := m.googleSigningKey(r, header.KeyID)
	if err != nil {
		return googleClaims{}, invalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return googleClaims{}, invalid
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature) != nil {
		return googleClaims{}, invalid
	}
	var claims googleClaims
	b, err = base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(b, &claims) != nil {
		return googleClaims{}, invalid
	}
	now := time.Now().Unix()
	if (claims.Issuer != "https://accounts.google.com" && claims.Issuer != "accounts.google.com") || claims.Audience != m.Config.GoogleClientID || (claims.AuthorizedParty != "" && claims.AuthorizedParty != m.Config.GoogleClientID) || claims.Subject == "" || claims.Expires <= now || claims.Issued > now+30 || claims.Issued <= 0 || claims.Nonce == "" || subtle.ConstantTimeCompare([]byte(claims.Nonce), []byte(nonce)) != 1 {
		return googleClaims{}, invalid
	}
	return claims, nil
}

func (m *Manager) googleSigningKey(r *http.Request, kid string) (*rsa.PublicKey, error) {
	m.mu.Lock()
	key := m.jwtKeys[kid]
	fresh := m.jwtExpires.After(time.Now())
	m.mu.Unlock()
	if key != nil && fresh {
		return key, nil
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, "https://www.googleapis.com/oauth2/v3/certs", nil)
	if err != nil {
		return nil, err
	}
	resp, err := m.Config.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var document struct {
		Keys []struct {
			Type      string `json:"kty"`
			Use       string `json:"use"`
			Algorithm string `json:"alg"`
			ID        string `json:"kid"`
			N         string `json:"n"`
			E         string `json:"e"`
		} `json:"keys"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&document) != nil || len(document.Keys) > 20 {
		return nil, errors.New("invalid Google signing keys")
	}
	keys := map[string]*rsa.PublicKey{}
	for _, jwk := range document.Keys {
		if jwk.Type != "RSA" || jwk.Use != "sig" || jwk.Algorithm != "RS256" || jwk.ID == "" {
			continue
		}
		n, err := base64.RawURLEncoding.DecodeString(jwk.N)
		if err != nil || len(n) < 256 || len(n) > 512 {
			continue
		}
		e, err := base64.RawURLEncoding.DecodeString(jwk.E)
		if err != nil || len(e) == 0 || len(e) > 4 {
			continue
		}
		exponent := 0
		for _, part := range e {
			exponent = exponent<<8 | int(part)
		}
		if exponent < 3 || exponent%2 == 0 {
			continue
		}
		keys[jwk.ID] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponent}
	}
	m.mu.Lock()
	m.jwtKeys = keys
	m.jwtExpires = time.Now().Add(time.Hour)
	m.mu.Unlock()
	if keys[kid] == nil {
		return nil, errors.New("unknown Google signing key")
	}
	return keys[kid], nil
}
