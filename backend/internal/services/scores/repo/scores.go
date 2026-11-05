// Package scores хранит таблицы рекордов мгновенных веб-игр.
//
// На каждую игру (slug) держится не более Limit лучших результатов, причём
// от одного аккаунта (identity из серверной сессии) — только его лучший. Данные
// живут в одном JSON-файле, запись атомарная (tmp + rename).
package scores

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"playmarket-backend/internal/storage"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

// Limit — сколько результатов хранится в таблице одной игры.
const Limit = 50

// MinInterval — минимальная пауза между отправками от одного uuid в одну игру.
const MinInterval = 2 * time.Second

var (
	ErrBadName     = errors.New("имя: 1–24 символа, буквы, цифры, пробел, - _ .")
	ErrBadScore    = errors.New("счёт вне допустимого диапазона")
	ErrTooFrequent = errors.New("слишком часто: подождите пару секунд")
	ErrUnknownGame = errors.New("неизвестная игра")
)

// MaxScore is the common game allowlist and score ceiling. Finite games use
// their scoring formula's upper bound; Simon has an operational safety cap.
var MaxScore = map[string]int64{
	"snake":          30 * 30 * 3, // bonus apples award three points per occupied cell
	"2048":           4_000_000,   // theoretical maximum approximately 3.9 million
	"razlom":         10_000_000,  // levels continue indefinitely
	"memory":         2_000,       // 2400 minus at least eight moves of 50
	"pong":           1_200,       // seven points of 100 plus a 500-point win bonus
	"reaction":       2_000,       // 2000 minus twice the average response time
	"minesweeper":    1_000,       // clearing all 71 safe cells wins 1000
	"tic-tac-toe":    1_000,       // win 1000, draw 300, loss 0
	"connect-four":   1_000,       // win 1000, draw 300, loss 0
	"simon":          1_000_000,   // 100 per completed level, no final level
	"whack-a-mole":   1_075,       // at most ceil(30 / 0.7) targets, 25 points each
	"lights-out":     2_500,       // 2500 minus 30 per move
	"sliding-puzzle": 4_000,       // 4000 minus 10 per move
	"sudoku":         1_500,       // 1500 minus 10 per entry
	"word-scramble":  2_400,       // 2400 minus 100 per mistake
}

type Entry struct {
	Name  string `json:"name"`
	Score int64  `json:"score"`
	TS    int64  `json:"ts"`
	UUID  string `json:"-"`
}

// persisted — форма на диске: uuid сохраняется, но наружу через API не уходит.
type persisted struct {
	Name  string `json:"name"`
	Score int64  `json:"score"`
	TS    int64  `json:"ts"`
	UUID  string `json:"uuid"`
}

type Board struct {
	mu       sync.Mutex
	path     string
	games    map[string][]Entry
	lastPost map[string]time.Time // uuid|slug -> время последней отправки
	now      func() time.Time
}

func Open(path string) (*Board, error) {
	b := &Board{
		path:     path,
		games:    map[string][]Entry{},
		lastPost: map[string]time.Time{},
		now:      time.Now,
	}
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) || (err == nil && len(raw) == 0) {
		return b, nil
	}
	if err != nil {
		return nil, err
	}
	var disk map[string][]persisted
	if err := json.Unmarshal(raw, &disk); err != nil {
		return nil, err
	}
	for slug, list := range disk {
		for _, p := range list {
			b.games[slug] = append(b.games[slug], Entry{Name: p.Name, Score: p.Score, TS: p.TS, UUID: p.UUID})
		}
		sortEntries(b.games[slug])
	}
	return b, nil
}

func sortEntries(list []Entry) {
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].Score != list[j].Score {
			return list[i].Score > list[j].Score
		}
		return list[i].TS < list[j].TS // при равенстве выше тот, кто раньше
	})
}

// CleanName нормализует имя игрока; пустая строка — имя недопустимо.
func CleanName(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if s == "" || utf8.RuneCountInString(s) > 24 {
		return ""
	}
	for _, r := range s {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '-' || r == '_' || r == '.') {
			return ""
		}
	}
	return s
}

// Top возвращает первые n результатов игры (копию).
func (b *Board) Top(slug string, n int) []Entry {
	b.mu.Lock()
	defer b.mu.Unlock()
	list := b.games[slug]
	if n <= 0 || n > len(list) {
		n = len(list)
	}
	out := make([]Entry, n)
	copy(out, list[:n])
	return out
}

// Mine — лучший результат посетителя и его место (1-based); rank 0 — нет результата.
func (b *Board) Mine(slug, uuid string) (Entry, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, e := range b.games[slug] {
		if e.UUID == uuid {
			return e, i + 1
		}
	}
	return Entry{}, 0
}

// Submit записывает результат. Возвращает место результата посетителя в
// таблице после записи (0 — не попал в Limit) и признак нового личного рекорда.
func (b *Board) Submit(slug, uuid, name string, score int64) (rank int, improved bool, err error) {
	name = CleanName(name)
	if name == "" {
		return 0, false, ErrBadName
	}
	max, ok := MaxScore[slug]
	if !ok {
		return 0, false, ErrUnknownGame
	}
	if score <= 0 || score > max {
		return 0, false, ErrBadScore
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	now := b.now()
	key := uuid + "|" + slug
	if last, ok := b.lastPost[key]; ok && now.Sub(last) < MinInterval {
		return 0, false, ErrTooFrequent
	}
	previousPost, hadPreviousPost := b.lastPost[key]
	b.lastPost[key] = now

	previous := b.games[slug]
	list := append([]Entry(nil), previous...)
	idx := -1
	for i := range list {
		if list[i].UUID == uuid {
			idx = i
			break
		}
	}
	switch {
	case idx == -1:
		list = append(list, Entry{Name: name, Score: score, TS: now.Unix(), UUID: uuid})
		improved = true
	case score > list[idx].Score:
		list[idx] = Entry{Name: name, Score: score, TS: now.Unix(), UUID: uuid}
		improved = true
	default:
		list[idx].Name = name // имя можно поменять и без нового рекорда
	}
	sortEntries(list)
	if len(list) > Limit {
		list = list[:Limit]
	}
	b.games[slug] = list

	for i := range list {
		if list[i].UUID == uuid {
			rank = i + 1
			break
		}
	}
	if err := b.persistLocked(); err != nil {
		b.games[slug] = previous
		if hadPreviousPost {
			b.lastPost[key] = previousPost
		} else {
			delete(b.lastPost, key)
		}
		return 0, false, err
	}
	return rank, improved, nil
}

// Reset удаляет таблицу игры целиком (админка).
func (b *Board) Reset(slug string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	previous, hadPrevious := b.games[slug]
	delete(b.games, slug)
	if err := b.persistLocked(); err != nil {
		if hadPrevious {
			b.games[slug] = previous
		}
		return err
	}
	return nil
}

// Counts — сколько результатов в каждой таблице.
func (b *Board) Counts() map[string]int {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make(map[string]int, len(b.games))
	for slug, list := range b.games {
		out[slug] = len(list)
	}
	return out
}

func (b *Board) persistLocked() error {
	disk := make(map[string][]persisted, len(b.games))
	for slug, list := range b.games {
		for _, e := range list {
			disk[slug] = append(disk[slug], persisted{Name: e.Name, Score: e.Score, TS: e.TS, UUID: e.UUID})
		}
	}
	raw, err := json.MarshalIndent(disk, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(b.path), 0o700); err != nil {
		return err
	}
	return storage.WriteAtomic(b.path, raw, 0o600)
}
