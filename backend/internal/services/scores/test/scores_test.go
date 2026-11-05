package scores_test

import (
	"errors"
	"path/filepath"
	scores "playmarket-backend/internal/services/scores/services"
	"testing"
)

func TestSubmissionPolicy(t *testing.T) {
	board, err := scores.Open(filepath.Join(t.TempDir(), "scores.json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := board.Submit("unknown", "account", "Player", 42); !errors.Is(err, scores.ErrUnknownGame) {
		t.Fatal("unknown game accepted")
	}
	if _, _, err := board.Submit("snake", "", "Player", 42); err == nil {
		t.Fatal("empty identity accepted")
	}
	if _, _, err := board.Submit("snake", "account", "Player", 2701); !errors.Is(err, scores.ErrBadScore) {
		t.Fatal("impossible snake score accepted")
	}
}
