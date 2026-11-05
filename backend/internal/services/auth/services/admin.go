package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"time"
)

func (m *Manager) AdminChallenge(r *http.Request) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := requestKey(r)
	s, ok := m.sessions[key]
	u := m.user(s)
	if !ok || u == nil || u.Role != "admin" || m.Config.AdminDeviceKey == "" {
		return "", errors.New("admin role required")
	}
	// The nonce is tied to this server session and consumed on any proof attempt.
	s.Challenge = "pm-admin-v1:" + randomToken()
	s.ChallengeExpires = time.Now().Add(time.Minute)
	m.sessions[key] = s
	return s.Challenge, nil
}

func (m *Manager) VerifyAdmin(r *http.Request, proof string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := requestKey(r)
	s, ok := m.sessions[key]
	challenge := s.Challenge
	expires := s.ChallengeExpires
	s.Challenge = ""
	s.ChallengeExpires = time.Time{}
	m.sessions[key] = s
	u := m.user(s)
	if !ok || u == nil || u.Role != "admin" || challenge == "" || !expires.After(time.Now()) || m.Config.AdminDeviceKey == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(m.Config.AdminDeviceKey))
	mac.Write([]byte(challenge))
	got, err := hex.DecodeString(proof)
	if err != nil || !hmac.Equal(got, mac.Sum(nil)) {
		return false
	}
	s.AdminUntil = time.Now().Add(5 * time.Minute)
	m.sessions[key] = s
	return true
}
