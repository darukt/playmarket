// Package catalog applies catalog selection and validation rules independently of HTTP.
package catalog

import (
	"fmt"
	repo "playmarket-backend/internal/services/catalog/repo"
	"sort"
	"strings"
)

type Entry = repo.Entry
type Detail = repo.Detail
type Query = repo.Query
type Stats = repo.Stats

const KindApp = repo.KindApp
const KindWeb = repo.KindWeb

var ErrNotFound = repo.ErrNotFound
var ErrNotCustom = repo.ErrNotCustom

type Service struct{ *repo.Store }

func Open(dir, seed string) (*Service, error) {
	r, err := repo.Open(dir, seed)
	if err != nil {
		return nil, err
	}
	return &Service{r}, nil
}
func NewID() string { return repo.NewID() }
func (s *Service) List() []Entry {
	rows := s.Store.List()
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Rating > rows[j].Rating })
	return rows
}
func (s *Service) AddCustom(e Entry) (Entry, error) {
	if strings.TrimSpace(e.Name) == "" || len(e.Name) > 300 || len(e.Detail.Description) > 100000 {
		return Entry{}, fmt.Errorf("invalid catalog entry")
	}
	if e.Kind == KindWeb && (e.Game == nil || (*e.Game != "snake" && *e.Game != "2048" && *e.Game != "razlom")) {
		return Entry{}, fmt.Errorf("unsupported game")
	}
	return s.Store.AddCustom(e)
}

// Filter применяет Query к полному каталогу.
func (s *Service) Filter(q Query) []Entry {
	all := s.List()
	needle := strings.ToLower(strings.TrimSpace(q.Q))
	out := all[:0:0]
	for _, e := range all {
		kind := e.Kind
		if kind == "" {
			kind = KindApp
		}
		if q.Category != "" && q.Category != "all" && e.Category != q.Category {
			continue
		}
		if q.Kind != "" && q.Kind != kind {
			continue
		}
		if needle != "" &&
			!strings.Contains(strings.ToLower(e.Name), needle) &&
			!strings.Contains(strings.ToLower(e.Developer), needle) &&
			!strings.Contains(strings.ToLower(e.Genre), needle) {
			continue
		}
		out = append(out, e)
	}
	switch q.Sort {
	case "downloads":
		sort.SliceStable(out, func(i, j int) bool { return out[i].DownloadsM > out[j].DownloadsM })
	case "name":
		sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	case "fresh":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Fresh > out[j].Fresh })
	}
	if q.Limit > 0 && q.Limit < len(out) {
		out = out[:q.Limit]
	}
	return out
}
