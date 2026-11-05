package controller

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"playmarket-backend/internal/services/catalog/services"
)

func (s *server) checkAdmin(w http.ResponseWriter, r *http.Request) bool {
	return s.auth.RequireAdmin(w, r)
}

// /api/admin/games[/{id}] (verified admin session):
//
//	GET    /api/admin/games       — позиции, добавленные через Студию
//	POST   /api/admin/games       — добавить (multipart, см. adminAddGame)
//	DELETE /api/admin/games/{id}  — удалить добавленную позицию и её файлы
func (s *server) adminGames(w http.ResponseWriter, r *http.Request) {
	if !s.checkAdmin(w, r) {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/games"), "/")
	if id != "" {
		if !allowMethods(w, r, http.MethodDelete) {
			return
		}
		switch err := s.store.DeleteCustom(id); {
		case errors.Is(err, catalog.ErrNotFound):
			writeError(w, http.StatusNotFound, "not found")
		case errors.Is(err, catalog.ErrNotCustom):
			writeError(w, http.StatusForbidden, err.Error())
		case err != nil:
			writeError(w, http.StatusInternalServerError, "operation failed")
		default:
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": id})
		}
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.ListCustom())
	case http.MethodPost:
		s.adminAddGame(w, r)
	default:
		allowMethods(w, r, http.MethodGet, http.MethodPost)
	}
}

// GET /api/admin/stats?recent=20 — загрузки, посетители, таблицы рекордов.
func (s *server) adminStats(w http.ResponseWriter, r *http.Request) {
	if !s.checkAdmin(w, r) || !allowMethods(w, r, http.MethodGet) {
		return
	}
	recent, _ := strconv.Atoi(r.URL.Query().Get("recent"))
	if recent <= 0 || recent > 500 {
		recent = 20
	}
	st, err := s.store.DownloadStats(recent)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "operation failed")
		return
	}
	seed, custom := s.store.Counts()
	writeJSON(w, http.StatusOK, map[string]any{
		"downloads": st,
		"users":     s.users.Count(),
		"catalog":   map[string]int{"seed": seed, "custom": custom},
		"scores":    s.scores.Counts(),
	})
}

// DELETE /api/admin/scores/{slug} — обнулить таблицу рекордов игры.
func (s *server) adminScores(w http.ResponseWriter, r *http.Request) {
	if !s.checkAdmin(w, r) || !allowMethods(w, r, http.MethodDelete) {
		return
	}
	slug := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/scores/"), "/")
	if slug == "" {
		writeError(w, http.StatusBadRequest, "missing slug")
		return
	}
	if err := s.scores.Reset(slug); err != nil {
		writeError(w, http.StatusInternalServerError, "operation failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "reset": slug})
}

// POST /api/admin/games (verified admin session, multipart/form-data):
//
//	name*, developer, genre, category, rating, version, description*,
//	kind (app|web), game (slug, обязателен для web),
//	icon (файл), screenshots[] (до 8 файлов),
//	artifactWindows (.exe), artifactAndroid (.apk)
func (s *server) adminAddGame(w http.ResponseWriter, r *http.Request) {
	const maxMemory = 32 << 20 // 32 MB в памяти, остальное — на диске
	r.Body = http.MaxBytesReader(w, r.Body, 2*maxArtifact+(256<<20))
	if err := r.ParseMultipartForm(maxMemory); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart request"})
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()

	get := func(key string) string { return strings.TrimSpace(r.FormValue(key)) }
	name := get("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	kind := strings.ToLower(get("kind"))
	gameSlug := get("game")
	if kind == catalog.KindWeb && gameSlug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "game slug is required for kind=web"})
		return
	}
	rate := parseRating(get("rating"))

	id := "custom-" + strings.ToLower(sanitizeSegment(gameSlug))
	if id == "custom-" {
		id = "custom-" + strings.ToLower(sanitizeSegment(name))
	}
	if id == "custom-" {
		id = catalog.NewID()
	}
	if _, exists := s.store.Get(id); exists {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "id already exists: " + id})
		return
	}

	desc := get("description")
	if desc == "" {
		desc = "Добавлено через Студию."
	}
	uploadsDir := s.store.UploadsDir(id)
	if err := os.Mkdir(uploadsDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "operation failed"})
		return
	}

	committed := false
	defer func() {
		if !committed {
			_ = os.RemoveAll(uploadsDir)
		}
	}()

	// icon (optional; клиенту вернём путь в ответе)
	iconPath := ""
	if f, hdr, err := r.FormFile("icon"); err == nil {
		name := "icon" + extFromHeader(hdr, ".webp")
		full := filepath.Join(uploadsDir, name)
		if err := saveFormFile(f, full, 16<<20); err != nil {
			f.Close()
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid icon upload"})
			return
		}
		iconPath = "/uploads/" + id + "/" + name
		f.Close()
	}

	// screenshots (до 8)
	screenshots := []string{}
	if files := r.MultipartForm.File["screenshots"]; len(files) > 0 {
		for i, fh := range files[:min(8, len(files))] {
			f, err := fh.Open()
			if err != nil {
				fmt.Fprintf(os.Stderr, "screenshot %d open: %v\n", i, err)
				continue
			}
			name := fmt.Sprintf("screen-%d%s", i, extFromHeader(fh, ".webp"))
			full := filepath.Join(uploadsDir, name)
			if err := saveFormFile(f, full, 24<<20); err == nil {
				screenshots = append(screenshots, "/uploads/"+id+"/"+name)
			}
			f.Close()
		}
	}

	// artifacts (optional) — настоящий .exe и человеческий .apk
	saveArtifact := func(field, fileName string) error {
		f, _, err := r.FormFile(field)
		if err != nil {
			return nil // поле не передано
		}
		defer f.Close()
		full := filepath.Join(uploadsDir, fileName)
		return saveFormFile(f, full, 512<<20)
	}
	if err := saveArtifact("artifactWindows", "artifact-windows.exe"); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid Windows artifact"})
		return
	}
	if err := saveArtifact("artifactAndroid", "artifact-android.apk"); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid Android artifact"})
		return
	}

	gamePtr := (*string)(nil)
	if kind == catalog.KindWeb {
		g := gameSlug
		gamePtr = &g
	}

	e := catalog.Entry{
		ID:         id,
		Name:       name,
		Developer:  orDefault(get("developer"), "Play Market Studio"),
		Genre:      orDefault(get("genre"), "Игра"),
		Category:   orDefault(get("category"), "games"),
		Rating:     rate,
		Ratings:    "ново",
		Downloads:  "—",
		DownloadsM: 0,
		Mb:         float64(getMb(r)),
		Version:    orDefault(get("version"), "1.0"),
		Updated:    time.Now().Format("2 January 2006"),
		Fresh:      time.Now().Format("2006-01-02"),
		Color:      "#141414",
		Ink:        "light",
		Tag:        strptr("Студия"),
		Kind:       kind,
		Game:       gamePtr,
		Icon:       iconPath,
		Detail: catalog.Detail{
			Description:         desc,
			ItempropDescription: firstLine(desc),
			Screenshots:         screenshots,
			UpdatedRaw:          time.Now().Format("2 янв. 2006 г."),
		},
	}
	entry, err := s.store.AddCustom(e)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "operation failed"})
		return
	}
	committed = true
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "entry": entry})
}

func parseRating(s string) float64 {
	var f float64
	_, _ = fmt.Sscanf(strings.Replace(s, ",", ".", 1), "%f", &f)
	if f < 0 {
		return 0
	}
	if f > 5 {
		return 5
	}
	return f
}

func getMb(r *http.Request) int64 {
	var mb int64
	_, _ = fmt.Sscanf(r.FormValue("mb"), "%d", &mb)
	if mb < 0 {
		mb = 0
	}
	return mb
}

func firstLine(s string) string {
	line := strings.SplitN(s, "\n", 2)[0]
	line = strings.TrimSpace(line)
	if len([]rune(line)) > 160 {
		r := []rune(line)
		line = string(r[:160])
	}
	return line
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return strings.TrimSpace(v)
}

func strptr(s string) *string { return &s }

func sanitizeSegment(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '.', r == '_':
			b.WriteRune(r)
		default: // кириллица и прочее не попадают в id: он же имя каталога загрузок
			b.WriteRune('-')
		}
	}
	out := b.String()
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return strings.Trim(out, "-.")
}

func extFromHeader(fh *multipart.FileHeader, fallback string) string {
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	switch ext {
	case ".webp", ".png", ".jpg", ".jpeg", ".gif":
		return ext
	}
	return fallback
}

func saveFormFile(f multipart.File, full string, limit int64) error {
	out, err := os.Create(full)
	if err != nil {
		return err
	}
	defer out.Close()
	n, err := io.Copy(out, io.LimitReader(f, limit+1))
	if err != nil {
		return err
	}
	if n > limit {
		return fmt.Errorf("file exceeds %d bytes", limit)
	}
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
