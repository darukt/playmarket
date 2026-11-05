package scores_test

import (
	"errors"
	"fmt"
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

func TestAllPlayableGamesAcceptScoresAndRejectInvalidValues(t *testing.T) {
	games := map[string]int64{
		"snake": 2700, "2048": 4_000_000, "razlom": 10_000_000,
		"memory": 2000, "pong": 1200, "reaction": 2000,
		"minesweeper": 1000, "tic-tac-toe": 1000, "connect-four": 1000,
		"simon": 1_000_000, "whack-a-mole": 1075, "lights-out": 2500,
		"sliding-puzzle": 4000, "sudoku": 1500, "word-scramble": 2400,
	}
	path := filepath.Join(t.TempDir(), "scores.json")
	board, err := scores.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for slug, maximum := range games {
		t.Run(slug, func(t *testing.T) {
			for _, invalid := range []int64{-1, 0, maximum + 1, 1<<63 - 1} {
				if _, _, err := board.Submit(slug, fmt.Sprintf("bad-%d", invalid), "Player", invalid); !errors.Is(err, scores.ErrBadScore) {
					t.Fatalf("accepted score %d: %v", invalid, err)
				}
			}
			if _, _, err := board.Submit(slug, "", "Player", 1); !errors.Is(err, scores.ErrBadName) {
				t.Fatalf("accepted empty identity: %v", err)
			}
			if _, _, err := board.Submit(slug, "bad-name", "<script>", 1); !errors.Is(err, scores.ErrBadName) {
				t.Fatalf("accepted invalid name: %v", err)
			}
			if rank, improved, err := board.Submit(slug, "account", "Player", maximum); err != nil || !improved || rank != 1 {
				t.Fatalf("valid maximum score rejected: rank=%d improved=%t err=%v", rank, improved, err)
			}
		})
	}
	again, err := scores.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for slug, maximum := range games {
		rows := again.Top(slug, 10)
		if len(rows) != 1 || rows[0].Score != maximum {
			t.Errorf("%s: score not persisted: %+v", slug, rows)
		}
	}
}
