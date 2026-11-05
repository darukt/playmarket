// Package controller adapts game score policy to the public HTTP API.
package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"playmarket-backend/internal/httpx"
	"playmarket-backend/internal/services/auth"
	catalog "playmarket-backend/internal/services/catalog/services"
	scores "playmarket-backend/internal/services/scores/services"
)

type Row struct {
	Rank  int    `json:"rank"`
	Name  string `json:"name"`
	Score int64  `json:"score"`
	TS    int64  `json:"ts"`
	Mine  bool   `json:"mine,omitempty"`
}
type Response struct {
	Game string `json:"game"`
	Top  []Row  `json:"top"`
	Me   *Row   `json:"me"`
}
type GameCatalog interface {
	WebGame(string) (catalog.Entry, bool)
}
type Controller struct {
	Scores  *scores.Service
	Catalog GameCatalog
	Auth    *auth.Manager
}

func (c Controller) Payload(slug, identity string, limit int) Response {
	top := c.Scores.Top(slug, limit)
	rows := make([]Row, 0, len(top))
	for i, e := range top {
		rows = append(rows, Row{Rank: i + 1, Name: e.Name, Score: e.Score, TS: e.TS, Mine: e.UUID == identity})
	}
	response := Response{Game: slug, Top: rows}
	if mine, rank := c.Scores.Mine(slug, identity); rank > 0 {
		response.Me = &Row{Rank: rank, Name: mine.Name, Score: mine.Score, TS: mine.TS, Mine: true}
	}
	return response
}

// Handler serves /api/games/{slug}/scores. Account ownership always comes
// from the authenticated session; private account IDs never enter responses.
func (c Controller) Handler(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/games/")
	slug, tail, _ := strings.Cut(rest, "/")
	if slug == "" || tail != "scores" {
		httpx.WriteError(w, http.StatusNotFound, "expected /api/games/{slug}/scores")
		return
	}
	if _, ok := c.Catalog.WebGame(slug); !ok {
		httpx.WriteError(w, http.StatusNotFound, "unknown game")
		return
	}
	identity := c.Auth.UserID(r)
	// The payload includes the current user's own best result.
	w.Header().Set("Cache-Control", "private, no-store")
	switch r.Method {
	case http.MethodGet:
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > scores.Limit {
			limit = 10
		}
		httpx.WriteJSON(w, http.StatusOK, c.Payload(slug, identity, limit))
	case http.MethodPost:
		if c.Auth.View(r).User == nil {
			httpx.WriteError(w, http.StatusUnauthorized, "sign in to submit scores")
			return
		}
		if !c.Auth.CheckCSRF(r) {
			httpx.WriteError(w, http.StatusForbidden, "invalid CSRF token")
			return
		}
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			httpx.WriteError(w, http.StatusUnsupportedMediaType, "application/json required")
			return
		}
		var body struct {
			Name  string `json:"name"`
			Score int64  `json:"score"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid score request")
			return
		}
		var extra any
		if !errors.Is(decoder.Decode(&extra), io.EOF) {
			httpx.WriteError(w, http.StatusBadRequest, "invalid score request")
			return
		}
		rank, improved, err := c.Scores.Submit(slug, identity, body.Name, body.Score)
		switch {
		case errors.Is(err, scores.ErrUnknownGame):
			httpx.WriteError(w, http.StatusNotFound, "unknown game")
			return
		case errors.Is(err, scores.ErrBadName), errors.Is(err, scores.ErrBadScore):
			httpx.WriteError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, scores.ErrTooFrequent):
			w.Header().Set("Retry-After", "2")
			httpx.WriteError(w, http.StatusTooManyRequests, err.Error())
			return
		case err != nil:
			httpx.WriteError(w, http.StatusInternalServerError, "unable to save score")
			return
		}
		response := c.Payload(slug, identity, 10)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"rank": rank, "improved": improved, "game": response.Game, "top": response.Top, "me": response.Me})
	default:
		httpx.AllowMethods(w, r, http.MethodGet, http.MethodPost)
	}
}
