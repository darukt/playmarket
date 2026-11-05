package controller

import (
	"net/http"
	"os"
	"path/filepath"
	"playmarket-backend/internal/httpx"
	"strings"
	"time"

	"playmarket-backend/internal/services/auth"
	"playmarket-backend/internal/services/catalog/services"
	"playmarket-backend/internal/services/scores/services"
)

type server struct {
	store   *catalog.Service
	users   *usersRegistry
	scores  *scores.Service
	stub    []byte
	auth    *auth.Manager
	tcpKey  string
	started time.Time
}

var writeJSON = httpx.WriteJSON
var writeError = httpx.WriteError
var allowMethods = httpx.AllowMethods

// GET /api/healthz — живость + немного цифр для мониторинга.
func (s *server) healthz(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	seed, custom := s.store.Counts()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"uptimeS": int64(time.Since(s.started).Seconds()),
		"catalog": map[string]int{"seed": seed, "custom": custom},
	})
}

// GET /api/me returns only counters belonging to the current server-side session.
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	uuid := uuidFrom(r.Context())
	u := s.users.Get(uuid)
	writeJSON(w, http.StatusOK, map[string]any{
		"uuid":         uuid,
		"firstSeen":    u.FirstSeen,
		"downloads":    u.Downloads,
		"lastPlatform": u.LastPlatform,
	})
}

// Only media referenced by a published catalog entry is public. Installers go through /api/download.
func (s *server) uploads(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/uploads/")
	if rest == "" || strings.ContainsAny(rest, "\\\x00") || strings.Contains(rest, "..") {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(rest, "/")
	if len(parts) != 2 {
		http.NotFound(w, r)
		return
	}
	e, ok := s.store.Get(parts[0])
	if !ok || !e.Custom {
		http.NotFound(w, r)
		return
	}
	allowed := e.Icon == r.URL.Path
	for _, p := range e.Detail.Screenshots {
		allowed = allowed || p == r.URL.Path
	}
	switch strings.ToLower(filepath.Ext(parts[1])) {
	case ".webp", ".png", ".jpg", ".jpeg", ".gif":
	default:
		allowed = false
	}
	if !allowed {
		http.NotFound(w, r)
		return
	}
	root, err := os.OpenRoot(s.store.UploadsRoot())
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer root.Close()
	f, err := root.Open(rest)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeContent(w, r, parts[1], st.ModTime(), f)
}
