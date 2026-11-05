package scores

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestCleanName(t *testing.T) {
	cases := map[string]string{
		"  Аня  ":                    "Аня",
		"Player  One":                "Player One",
		"x_y-z.1":                    "x_y-z.1",
		"":                           "",
		"<b>":                        "",
		"0123456789abcdefghijklmnop": "", // 26 > 24
	}
	for in, want := range cases {
		if got := CleanName(in); got != want {
			t.Errorf("CleanName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSubmitOrderingAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "scores.json")
	b, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Unix(1_800_000_000, 0)
	b.now = func() time.Time { return clock }

	mustSubmit := func(uuid, name string, score int64) int {
		t.Helper()
		rank, _, err := b.Submit("2048", uuid, name, score)
		if err != nil {
			t.Fatalf("submit %s %d: %v", name, score, err)
		}
		clock = clock.Add(MinInterval)
		return rank
	}
	mustSubmit("a", "A", 100)
	mustSubmit("b", "B", 300)
	if r := mustSubmit("c", "C", 200); r != 2 {
		t.Fatalf("C rank = %d, want 2", r)
	}
	// худший результат не затирает личный рекорд
	if _, improved, _ := b.Submit("2048", "b", "B2", 10); improved {
		t.Fatal("lower score must not improve")
	}
	clock = clock.Add(MinInterval)

	top := b.Top("2048", 10)
	if len(top) != 3 || top[0].Score != 300 || top[0].Name != "B2" || top[2].Score != 100 {
		t.Fatalf("top: %+v", top)
	}

	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := again.Top("2048", 1); len(got) != 1 || got[0].Score != 300 || got[0].UUID != "b" {
		t.Fatalf("reloaded: %+v", got)
	}
	if _, rank := again.Mine("2048", "c"); rank != 2 {
		t.Fatalf("Mine rank = %d", rank)
	}
}

func TestSubmitValidation(t *testing.T) {
	b, _ := Open(filepath.Join(t.TempDir(), "s.json"))
	if _, _, err := b.Submit("unknown", "u", "ok", 5); !errors.Is(err, ErrUnknownGame) {
		t.Fatalf("unknown game: %v", err)
	}
	if _, _, err := b.Submit("snake", "u", "ok", 2701); !errors.Is(err, ErrBadScore) {
		t.Fatalf("snake cap: %v", err)
	}
	if _, _, err := b.Submit("snake", "u", "ok", 0); !errors.Is(err, ErrBadScore) {
		t.Fatalf("zero: %v", err)
	}
	if _, _, err := b.Submit("snake", "u", "!!", 5); !errors.Is(err, ErrBadName) {
		t.Fatalf("name: %v", err)
	}
	if _, _, err := b.Submit("snake", "u", "ok", 5); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Submit("snake", "u", "ok", 6); !errors.Is(err, ErrTooFrequent) {
		t.Fatalf("rate: %v", err)
	}
}

func TestLimit(t *testing.T) {
	b, _ := Open(filepath.Join(t.TempDir(), "s.json"))
	for i := 0; i < Limit+5; i++ {
		uuid := string(rune('A'+i%26)) + string(rune('a'+i/26))
		if _, _, err := b.Submit("razlom", uuid, "p", int64(i+1)); err != nil {
			t.Fatal(err)
		}
	}
	top := b.Top("razlom", 0)
	if len(top) != Limit || top[0].Score != int64(Limit+5) {
		t.Fatalf("len=%d first=%d", len(top), top[0].Score)
	}
	if rank, _, _ := b.Submit("razlom", "zz-new", "p", 1); rank != 0 {
		t.Fatalf("score below table must get rank 0, got %d", rank)
	}
}

func TestSnakeBonusPointsCanExceedCellCount(t *testing.T) {
	b, err := Open(filepath.Join(t.TempDir(), "scores.json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Submit("snake", "bonus-player", "Player", 901); err != nil {
		t.Fatalf("valid bonus score rejected: %v", err)
	}
}
