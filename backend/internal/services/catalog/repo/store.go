// Package catalog holds the app catalog (seed + admin additions) and
// knows how to produce download artifacts for each platform.
package catalog

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"playmarket-backend/internal/storage"

	"strings"
	"sync"
	"time"
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

type Entry struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Developer  string  `json:"developer"`
	Genre      string  `json:"genre"`
	Category   string  `json:"category"`
	Rating     float64 `json:"rating"`
	Ratings    string  `json:"ratings"`
	Downloads  string  `json:"downloads"`
	DownloadsM float64 `json:"downloadsM"`
	Mb         float64 `json:"mb"`
	Version    string  `json:"version"`
	Updated    string  `json:"updated"`
	Fresh      string  `json:"fresh"`
	Color      string  `json:"color"`
	Ink        string  `json:"ink"`
	Tag        *string `json:"tag"`
	Kind       string  `json:"kind"`
	Game       *string `json:"game"`
	Custom     bool    `json:"custom"`
	Icon       string  `json:"icon,omitempty"`
	Detail     Detail  `json:"detail"`

	artifactWindows string
	artifactAndroid string
}

type Store struct {
	mu         sync.RWMutex
	registryMu sync.Mutex
	index      map[string]Entry
	seed       []Entry
	custom     []Entry
	dataDir    string
	uploads    string
	registry   *os.File
}

func Open(dataDir, seedPath string) (*Store, error) {
	s := &Store{dataDir: dataDir, uploads: filepath.Join(dataDir, "uploads"), index: map[string]Entry{}}
	var seed []Entry
	if err := readJSON(seedPath, &seed); err != nil {
		return nil, fmt.Errorf("load seed: %w", err)
	}
	for _, e := range seed {
		if !validID(e.ID) {
			return nil, fmt.Errorf("invalid seed entry id")
		}
		if _, ok := s.index[e.ID]; ok {
			return nil, fmt.Errorf("duplicate seed id")
		}
		s.index[e.ID] = e
	}
	s.seed = seed
	if err := os.MkdirAll(s.uploads, 0o755); err != nil {
		return nil, err
	}
	var custom []Entry
	if err := readJSON(filepath.Join(dataDir, "catalog.json"), &custom); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("load custom catalog: %w", err)
	}
	s.custom = custom
	for i := range s.custom {
		if !validID(s.custom[i].ID) {
			return nil, fmt.Errorf("invalid custom entry id")
		}
		if _, exists := s.index[s.custom[i].ID]; exists {
			return nil, fmt.Errorf("duplicate catalog id")
		}
		s.attachArtifacts(&s.custom[i])
		s.index[s.custom[i].ID] = s.custom[i]
	}
	reg, err := os.OpenFile(filepath.Join(dataDir, "downloads.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	s.registry = reg
	return s, nil
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
	out := make([]Entry, 0, len(s.seed)+len(s.custom))
	out = append(out, s.seed...)
	out = append(out, s.custom...)
	return out
}

func (s *Store) Get(id string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.index[id]
	return e, ok
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
		return name + "-demo.zip"
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
	if _, exists := s.index[e.ID]; exists {
		return Entry{}, fmt.Errorf("entry already exists")
	}
	e.Custom = true
	if err := os.MkdirAll(s.UploadsDir(e.ID), 0o755); err != nil {
		return Entry{}, err
	}
	s.attachArtifacts(&e)
	s.custom = append(s.custom, e)
	if err := s.persistCustom(); err != nil {
		s.custom = s.custom[:len(s.custom)-1]
		return Entry{}, err
	}
	s.index[e.ID] = e
	return e, nil
}

func (s *Store) persistCustom() error {
	b, err := json.MarshalIndent(s.custom, "", "  ")
	if err != nil {
		return err
	}
	return storage.WriteAtomic(filepath.Join(s.dataDir, "catalog.json"), b, 0o600)
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
	out := make([]Entry, len(s.custom))
	copy(out, s.custom)
	return out
}

// DeleteCustom убирает позицию из каталога вместе с её загрузками.
// Позиции из seed удалить нельзя — возвращается ErrNotCustom.
func (s *Store) DeleteCustom(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.custom {
		if s.custom[i].ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		for i := range s.seed {
			if s.seed[i].ID == id {
				return ErrNotCustom
			}
		}
		return ErrNotFound
	}
	previous := append([]Entry(nil), s.custom...)
	s.custom = append(s.custom[:idx], s.custom[idx+1:]...)
	if err := s.persistCustom(); err != nil {
		s.custom = previous
		return err
	}
	delete(s.index, id)
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
	file, err := os.Open(filepath.Join(s.dataDir, "downloads.log"))
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
	for _, list := range [][]Entry{s.seed, s.custom} {
		for i := range list {
			if list[i].Kind == KindWeb && list[i].Game != nil && *list[i].Game == slug {
				return list[i], true
			}
		}
	}
	return Entry{}, false
}

// Counts — размер seed и custom-части каталога.
func (s *Store) Counts() (seed, custom int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.seed), len(s.custom)
}

// Close закрывает журнал загрузок.
func (s *Store) Close() error {
	s.registryMu.Lock()
	defer s.registryMu.Unlock()
	if s.registry == nil {
		return nil
	}
	err := s.registry.Close()
	s.registry = nil
	return err
}
