// Package controller exposes authentication through same-origin HTTP routes.
package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"playmarket-backend/internal/services/auth/services"
)

type Controller struct{ Manager *services.Manager }

func (c Controller) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/auth/session", c.session)
	mux.HandleFunc("/api/auth/register", c.register)
	mux.HandleFunc("/api/auth/login", c.login)
	mux.HandleFunc("/api/auth/logout", c.logout)
	mux.HandleFunc("/api/auth/google", c.googleStart)
	mux.HandleFunc("/api/auth/google/callback", c.googleCallback)
	mux.HandleFunc("/api/auth/admin/challenge", c.adminChallenge)
	mux.HandleFunc("/api/auth/admin/verify", c.adminVerify)
}
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]string{"error": message})
}
func method(w http.ResponseWriter, r *http.Request, want string) bool {
	if r.Method != want {
		w.Header().Set("Allow", want)
		fail(w, http.StatusMethodNotAllowed, "method not allowed")
		return false
	}
	return true
}
func (c Controller) mutation(w http.ResponseWriter, r *http.Request) bool {
	if !method(w, r, http.MethodPost) {
		return false
	}
	if !c.Manager.CheckCSRF(r) {
		fail(w, http.StatusForbidden, "invalid CSRF token")
		return false
	}
	return true
}
func read(w http.ResponseWriter, r *http.Request, v any) bool {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		fail(w, http.StatusUnsupportedMediaType, "application/json required")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, http.StatusBadRequest, "invalid request")
		return false
	}
	var trailing any
	if !errors.Is(d.Decode(&trailing), io.EOF) {
		fail(w, http.StatusBadRequest, "invalid request")
		return false
	}
	return true
}
func (c Controller) session(w http.ResponseWriter, r *http.Request) {
	if method(w, r, http.MethodGet) {
		write(w, http.StatusOK, c.Manager.View(r))
	}
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name,omitempty"`
}

func (c Controller) credentialRequest(w http.ResponseWriter, r *http.Request, v *credentials) bool {
	if !c.mutation(w, r) || !read(w, r, v) {
		return false
	}
	v.Email = services.NormalizeEmail(v.Email)
	if len(v.Password) > 1024 || len(v.Name) > 256 {
		fail(w, http.StatusBadRequest, "invalid credentials")
		return false
	}
	if !c.Manager.Allow(r, "credentials", v.Email) {
		w.Header().Set("Retry-After", "600")
		fail(w, http.StatusTooManyRequests, "too many attempts; try again later")
		return false
	}
	if !c.Manager.HashSlot() {
		w.Header().Set("Retry-After", "1")
		fail(w, http.StatusServiceUnavailable, "authentication busy; try again")
		return false
	}
	return true
}
func (c Controller) register(w http.ResponseWriter, r *http.Request) {
	var input credentials
	if !c.credentialRequest(w, r, &input) {
		return
	}
	defer c.Manager.ReleaseHashSlot()
	a, err := c.Manager.Register(input.Email, input.Password, input.Name)
	if err != nil {
		fail(w, http.StatusBadRequest, "unable to create account with these credentials")
		return
	}
	r = c.Manager.Rotate(w, r, a.ID)
	write(w, http.StatusCreated, c.Manager.View(r))
}
func (c Controller) login(w http.ResponseWriter, r *http.Request) {
	var input credentials
	if !c.credentialRequest(w, r, &input) {
		return
	}
	defer c.Manager.ReleaseHashSlot()
	a, err := c.Manager.Login(input.Email, input.Password)
	if err != nil {
		fail(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	r = c.Manager.Rotate(w, r, a.ID)
	write(w, http.StatusOK, c.Manager.View(r))
}
func (c Controller) logout(w http.ResponseWriter, r *http.Request) {
	if !c.mutation(w, r) {
		return
	}
	r = c.Manager.Rotate(w, r, "")
	write(w, http.StatusOK, c.Manager.View(r))
}
func (c Controller) googleStart(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodGet) {
		return
	}
	if !c.Manager.Allow(r, "oauth", "") {
		fail(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	location, err := c.Manager.GoogleStart(r)
	if err != nil {
		fail(w, http.StatusServiceUnavailable, "Google sign-in is not configured")
		return
	}
	http.Redirect(w, r, location, http.StatusFound)
}
func (c Controller) googleCallback(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, http.MethodGet) {
		return
	}
	a, err := c.Manager.GoogleFinish(r)
	if err != nil {
		http.Redirect(w, r, "/?auth=error", http.StatusSeeOther)
		return
	}
	c.Manager.Rotate(w, r, a.ID)
	http.Redirect(w, r, "/?auth=success", http.StatusSeeOther)
}
func (c Controller) adminChallenge(w http.ResponseWriter, r *http.Request) {
	if !c.mutation(w, r) {
		return
	}
	if !c.Manager.Allow(r, "admin", c.Manager.UserID(r)) {
		fail(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	challenge, err := c.Manager.AdminChallenge(r)
	if err != nil {
		fail(w, http.StatusForbidden, "admin role required")
		return
	}
	write(w, http.StatusOK, map[string]any{"challenge": challenge, "expiresIn": 60})
}
func (c Controller) adminVerify(w http.ResponseWriter, r *http.Request) {
	if !c.mutation(w, r) {
		return
	}
	var input struct {
		Proof string `json:"proof"`
	}
	if !read(w, r, &input) {
		return
	}
	if !c.Manager.Allow(r, "admin-proof", c.Manager.UserID(r)) {
		fail(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	if !c.Manager.VerifyAdmin(r, input.Proof) {
		fail(w, http.StatusForbidden, "invalid or expired device proof")
		return
	}
	write(w, http.StatusOK, c.Manager.View(r))
}
