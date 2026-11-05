// Package catalog persists the catalog in SQLite. JSON files are import sources,
// never the runtime catalog.
package catalog

import (
	"bufio"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"

	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	KindApp = "app"
	KindWeb = "web"
)

type Detail struct {
	Description         string   `json:"description"`
	ItempropDescription string   `json:"itempropDescription"`
	Screenshots         []string `json:"screenshots"`
	Video               *string  `json:"video"`
	Poster              *string  `json:"poster"`
	UpdatedRaw          string   `json:"updatedRaw"`
}

// DownloadSource points to an original publisher file or its official store.
// Store links are deliberately distinct from files in the public API.
type DownloadSource struct {
	URL      string `json:"url"`
	Kind     string `json:"kind"`
	Filename string `json:"filename,omitempty"`
}

type Entry struct {
	ID                  string                    `json:"id"`
	Name                string                    `json:"name"`
	Developer           string                    `json:"developer"`
	Genre               string                    `json:"genre"`
	Category            string                    `json:"category"`
	Rating              float64                   `json:"rating"`
	Ratings             string                    `json:"ratings"`
	Downloads           string                    `json:"downloads"`
	DownloadsM          float64                   `json:"downloadsM"`
	Mb                  float64                   `json:"mb"`
	Version             string                    `json:"version"`
	Updated             string                    `json:"updated"`
	Fresh               string                    `json:"fresh"`
	Color               string                    `json:"color"`
	Ink                 string                    `json:"ink"`
	Tag                 *string                   `json:"tag"`
	Kind                string                    `json:"kind"`
	Game                *string                   `json:"game"`
	Custom              bool                      `json:"custom"`
	Icon                string                    `json:"icon,omitempty"`
	Detail              Detail                    `json:"detail"`
	DownloadsByPlatform map[string]DownloadSource `json:"downloadsByPlatform,omitempty"`

	artifactWindows string
	artifactAndroid string
}

type Store struct {
	mu         sync.RWMutex
	registryMu sync.Mutex
	db         *sql.DB
	uploads    string
	registry   *os.File
}

func Open(dataDir, seedPath string) (*Store, error) {
	s := &Store{uploads: filepath.Join(dataDir, "uploads")}
	var seed []Entry
	seedMissing := false
	if err := readJSON(seedPath, &seed); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("load seed: %w", err)
		}
		if _, dbErr := os.Stat(filepath.Join(dataDir, "catalog.db")); dbErr != nil {
			return nil, fmt.Errorf("load seed: %w", err)
		}
		seedMissing = true
	}
	if err := os.MkdirAll(s.uploads, 0o755); err != nil {
		return nil, err
	}
	databasePath := filepath.Join(dataDir, "catalog.db")
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("open catalog database: %w", err)
	}
	s.db = db
	// One database/sql connection serializes transactions and applies the same
	// busy timeout to every operation. SQLite remains the source of truth.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
		CREATE TABLE IF NOT EXISTS catalog_entries (
			id TEXT PRIMARY KEY, kind TEXT NOT NULL, game TEXT NOT NULL DEFAULT '',
			custom INTEGER NOT NULL CHECK(custom IN (0,1)), document TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS catalog_web_games ON catalog_entries(kind, game);
		CREATE TABLE IF NOT EXISTS catalog_migrations (name TEXT PRIMARY KEY);
	`); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize catalog database: %w", err)
	}
	if seedMissing {
		var imported int
		if err := db.QueryRow(`SELECT COUNT(*) FROM catalog_migrations WHERE name='legacy-json-v1'`).Scan(&imported); err != nil || imported == 0 {
			db.Close()
			return nil, fmt.Errorf("catalog has not been imported and the seed file is missing")
		}
	}
	if err := s.importCatalog(seed, filepath.Join(dataDir, "catalog.json")); err != nil {
		db.Close()
		return nil, err
	}
	reg, err := os.OpenFile(filepath.Join(dataDir, "downloads.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		db.Close()
		return nil, err
	}
	s.registry = reg
	return s, nil
}

// importCatalog refreshes publisher metadata while preserving administrator
// entries. The migration marker and legacy rows commit together so a deleted
// custom entry is never resurrected by a leftover catalog.json on restart.
func (s *Store) importCatalog(seed []Entry, legacyPath string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	for _, e := range seed {
		if !validID(e.ID) || seen[e.ID] {
			return fmt.Errorf("invalid or duplicate seed entry id")
		}
		seen[e.ID] = true
		if err := ValidateDownloads(e.DownloadsByPlatform); err != nil {
			return fmt.Errorf("invalid seed download source for %s: %w", e.ID, err)
		}
		e.Custom = false
		if e.Kind == "" {
			e.Kind = KindApp
		}
		if err := insertEntry(tx, e, true); err != nil {
			return fmt.Errorf("import catalog seed: %w", err)
		}
	}
	var migrated int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM catalog_migrations WHERE name='legacy-json-v1'`).Scan(&migrated); err != nil {
		return err
	}
	if migrated == 0 {
		var custom []Entry
		if err := readJSON(legacyPath, &custom); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("load custom catalog: %w", err)
		}
		for _, e := range custom {
			if !validID(e.ID) || seen[e.ID] {
				return fmt.Errorf("invalid or duplicate custom catalog id")
			}
			seen[e.ID] = true
			if err := ValidateDownloads(e.DownloadsByPlatform); err != nil {
				return fmt.Errorf("invalid custom download source: %w", err)
			}
			e.Custom = true
			if e.Kind == "" {
				e.Kind = KindApp
			}
			if err := insertEntry(tx, e, false); err != nil {
				return fmt.Errorf("migrate custom catalog: %w", err)
			}
		}
		if _, err := tx.Exec(`INSERT INTO catalog_migrations(name) VALUES ('legacy-json-v1')`); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func insertEntry(tx *sql.Tx, e Entry, refresh bool) error {
	document, err := json.Marshal(e)
	if err != nil {
		return err
	}
	query := `INSERT INTO catalog_entries(id, kind, game, custom, document) VALUES(?,?,?,?,?)`
	if refresh {
		query += ` ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, game=excluded.game, document=excluded.document WHERE catalog_entries.custom=0`
	}
	game := ""
	if e.Game != nil {
		game = *e.Game
	}
	_, err = tx.Exec(query, e.ID, e.Kind, game, e.Custom, string(document))
	return err
}

// ValidateDownloads rejects executable schemes, credentials, local destinations,
// ambiguous source kinds, and filenames that could escape a download directory.
func ValidateDownloads(sources map[string]DownloadSource) error {
	for platform, source := range sources {
		if platform != "windows" && platform != "android" {
			return fmt.Errorf("unsupported download platform")
		}
		if source.Kind != "file" && source.Kind != "store" {
			return fmt.Errorf("unsupported download source kind")
		}
		u, err := url.Parse(source.URL)
		if err != nil || len(source.URL) > 4096 || u.Scheme != "https" || u.User != nil || u.Hostname() == "" || u.Fragment != "" || (u.Port() != "" && u.Port() != "443") {
			return fmt.Errorf("download source must be an absolute public HTTPS URL")
		}
		host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
		if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || !strings.Contains(host, ".") {
			return fmt.Errorf("local download source is not allowed")
		}
		if ip := net.ParseIP(host); ip != nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsMulticast()) {
			return fmt.Errorf("local download source is not allowed")
		}
		if source.Filename != "" && (len(source.Filename) > 200 || sanitizeFilename(source.Filename) != source.Filename || strings.Contains(source.Filename, "..")) {
			return fmt.Errorf("invalid download filename")
		}
	}
	return nil
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (s *Store) attachArtifacts(e *Entry) {
	uploadDir := filepath.Join(s.uploads, e.ID)
	if st, err := os.Stat(filepath.Join(uploadDir, "artifact-windows.exe")); err == nil && !st.IsDir() {
		e.artifactWindows = filepath.Join(uploadDir, "artifact-windows.exe")
	}
	if st, err := os.Stat(filepath.Join(uploadDir, "artifact-android.apk")); err == nil && !st.IsDir() {
		e.artifactAndroid = filepath.Join(uploadDir, "artifact-android.apk")
	}
}

func (s *Store) List() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.list(`SELECT document FROM catalog_entries ORDER BY rowid`)
}

func (s *Store) Get(id string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.get(`SELECT document FROM catalog_entries WHERE id=?`, id)
}

func (s *Store) list(query string, args ...any) []Entry {
	out := []Entry{}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("catalog database query failed: %v", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var document string
		var e Entry
		if err := rows.Scan(&document); err != nil {
			log.Printf("catalog database scan failed: %v", err)
			return []Entry{}
		}
		if err := json.Unmarshal([]byte(document), &e); err != nil {
			log.Printf("catalog database entry is invalid: %v", err)
			return []Entry{}
		}
		s.attachArtifacts(&e)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		log.Printf("catalog database rows failed: %v", err)
		return []Entry{}
	}
	return out
}

func (s *Store) get(query string, args ...any) (Entry, bool) {
	var document string
	var e Entry
	if err := s.db.QueryRow(query, args...).Scan(&document); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Printf("catalog database lookup failed: %v", err)
		}
		return e, false
	}
	if err := json.Unmarshal([]byte(document), &e); err != nil {
		log.Printf("catalog database entry is invalid: %v", err)
		return e, false
	}
	s.attachArtifacts(&e)
	return e, true
}
func validID(id string) bool {
	return id != "" && len(id) <= 200 && !strings.Contains(id, "..") && sanitizeFilename(id) == id
}

func sanitizeFilename(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Map(func(r rune) rune { return r }, b.String())
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return strings.Trim(out, "-.")
}

func NewID() string { return "custom-" + randomID(5) }

func randomID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Store) FilenameFor(e Entry, platform string) string {
	name := sanitizeFilename(e.Name)
	if name == "" {
		name = "package"
	}
	switch platform {
	case "windows":
		return name + "-Setup.exe"
	default:
		return name + ".apk"
	}
}

// Artifact returns the absolute path of an uploaded artifact, if any.
func (s *Store) Artifact(e Entry, platform string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch platform {
	case "windows":
		if e.artifactWindows != "" {
			return e.artifactWindows, true
		}
	case "android":
		if e.artifactAndroid != "" {
			return e.artifactAndroid, true
		}
	}
	return "", false
}

// UploadsRoot — корень всех загрузок (data/uploads).
func (s *Store) UploadsRoot() string { return s.uploads }

func (s *Store) UploadsDir(id string) string {
	name := sanitizeFilename(id)
	if name == "" {
		name = "item"
	}
	return filepath.Join(s.uploads, name)
}

func (s *Store) AddCustom(e Entry) (Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e.Kind = strings.ToLower(strings.TrimSpace(e.Kind))
	if e.Kind != KindApp && e.Kind != KindWeb {
		e.Kind = KindApp
	}
	if e.ID != "" && !validID(e.ID) {
		return Entry{}, fmt.Errorf("invalid entry id")
	}
	name := sanitizeFilename(e.ID)
	if name == "" {
		name = NewID()
		e.ID = name
	} else {
		e.ID = name
	}
	if err := ValidateDownloads(e.DownloadsByPlatform); err != nil {
		return Entry{}, err
	}
	e.Custom = true
	if err := os.MkdirAll(s.UploadsDir(e.ID), 0o755); err != nil {
		return Entry{}, err
	}
	s.attachArtifacts(&e)
	tx, err := s.db.Begin()
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback()
	if err := insertEntry(tx, e, false); err != nil {
		return Entry{}, fmt.Errorf("persist catalog entry: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Entry{}, err
	}
	return e, nil
}

func (s *Store) LogDownload(uuid, id, platform string, size int64) {
	s.registryMu.Lock()
	defer s.registryMu.Unlock()
	if s.registry == nil {
		return // хранилище уже закрыто (shutdown)
	}
	line := fmt.Sprintf("{\"ts\":%d,\"uuid\":%q,\"id\":%q,\"platform\":%q,\"bytes\":%d}\n",
		time.Now().Unix(), uuid, id, platform, size)
	_, _ = s.registry.WriteString(line)
}

// ListCustom — только позиции, добавленные через Студию / админ-API.
func (s *Store) ListCustom() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.list(`SELECT document FROM catalog_entries WHERE custom=1 ORDER BY rowid`)
}

// DeleteCustom убирает позицию из каталога вместе с её загрузками.
// Позиции из seed удалить нельзя — возвращается ErrNotCustom.
func (s *Store) DeleteCustom(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var custom bool
	err := s.db.QueryRow(`SELECT custom FROM catalog_entries WHERE id=?`, id).Scan(&custom)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if !custom {
		return ErrNotCustom
	}
	if _, err := s.db.Exec(`DELETE FROM catalog_entries WHERE id=? AND custom=1`, id); err != nil {
		return err
	}
	return os.RemoveAll(s.UploadsDir(id))
}

var (
	ErrNotFound  = fmt.Errorf("not found")
	ErrNotCustom = fmt.Errorf("позиция из seed, удалить можно только добавленные через Студию")
)

// Query — параметры фильтрации /api/catalog.
type Query struct {
	Q        string // подстрока в имени, разработчике или жанре
	Category string
	Kind     string // app | web
	Sort     string // rating (по умолчанию) | downloads | name | fresh
	Limit    int
}

// DownloadRecord — строка downloads.log.
type DownloadRecord struct {
	TS       int64  `json:"ts"`
	UUID     string `json:"uuid"`
	ID       string `json:"id"`
	Platform string `json:"platform"`
	Bytes    int64  `json:"bytes"`
}

// Stats — агрегат по журналу загрузок.
type Stats struct {
	Total      int              `json:"total"`
	Bytes      int64            `json:"bytes"`
	ByApp      map[string]int   `json:"byApp"`
	ByPlatform map[string]int   `json:"byPlatform"`
	Recent     []DownloadRecord `json:"recent"`
}

// DownloadStats читает downloads.log и считает агрегаты; recent — последние n записей.
func (s *Store) DownloadStats(recent int) (Stats, error) {
	st := Stats{ByApp: map[string]int{}, ByPlatform: map[string]int{}, Recent: []DownloadRecord{}}
	if recent < 0 {
		recent = 0
	}
	if recent > 500 {
		recent = 500
	}
	file, err := os.Open(filepath.Join(filepath.Dir(s.uploads), "downloads.log"))
	if errors.Is(err, os.ErrNotExist) {
		return st, nil
	}
	if err != nil {
		return st, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 64<<10)
	ring := make([]DownloadRecord, 0, recent)
	position := 0
	for scanner.Scan() {
		var rec DownloadRecord
		if json.Unmarshal(scanner.Bytes(), &rec) != nil {
			continue
		}
		st.Total++
		st.Bytes += rec.Bytes
		st.ByApp[rec.ID]++
		st.ByPlatform[rec.Platform]++
		if recent > 0 {
			if len(ring) < recent {
				ring = append(ring, rec)
			} else {
				ring[position] = rec
			}
			position = (position + 1) % recent
		}
	}
	for i := 0; i < len(ring); i++ {
		idx := (position - 1 - i + len(ring)) % len(ring)
		st.Recent = append(st.Recent, ring[idx])
	}
	return st, scanner.Err()
}

// WebGame ищет веб-игру по slug маршрута /games/{slug}.
func (s *Store) WebGame(slug string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.get(`SELECT document FROM catalog_entries WHERE kind=? AND game=? ORDER BY rowid LIMIT 1`, KindWeb, slug)
}

// Counts — размер seed и custom-части каталога.
func (s *Store) Counts() (seed, custom int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM catalog_entries WHERE custom=0`).Scan(&seed); err != nil {
		log.Printf("catalog database count failed: %v", err)
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM catalog_entries WHERE custom=1`).Scan(&custom); err != nil {
		log.Printf("catalog database count failed: %v", err)
	}
	return seed, custom
}

// Close closes the database and download registry. Repeated calls are safe.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.registryMu.Lock()
	defer s.registryMu.Unlock()
	var registryErr error
	if s.registry != nil {
		registryErr = s.registry.Close()
		s.registry = nil
	}
	return errors.Join(registryErr, s.db.Close())
}
