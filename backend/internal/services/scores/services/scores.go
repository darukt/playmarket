// Package scores enforces score submission policy before repository mutation.
package scores

import repo "playmarket-backend/internal/services/scores/repo"

type Entry = repo.Entry

const Limit = repo.Limit

var ErrBadName = repo.ErrBadName
var ErrBadScore = repo.ErrBadScore
var ErrTooFrequent = repo.ErrTooFrequent
var ErrUnknownGame = repo.ErrUnknownGame

type Service struct{ *repo.Board }

func Open(path string) (*Service, error) {
	r, err := repo.Open(path)
	if err != nil {
		return nil, err
	}
	return &Service{r}, nil
}
func (s *Service) Submit(slug, id, name string, score int64) (int, bool, error) {
	if id == "" {
		return 0, false, ErrBadName
	}
	return s.Board.Submit(slug, id, name, score)
}
