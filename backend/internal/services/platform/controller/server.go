package controller

import (
	"context"
	"net/http"
	"playmarket-backend/internal/services/auth"
	catalog "playmarket-backend/internal/services/catalog/services"
	visitors "playmarket-backend/internal/services/platform/repo"
	scores "playmarket-backend/internal/services/scores/services"
	"time"
)

// Config explicitly supplies adapters with application services and transport credentials.
type Config struct {
	Catalog   *catalog.Service
	Scores    *scores.Service
	Visitors  *visitors.Registry
	Installer []byte
	Auth      *auth.Manager
	TCPKey    string
}

func New(c Config) *server {
	return &server{store: c.Catalog, scores: c.Scores, users: c.Visitors, stub: c.Installer, auth: c.Auth, tcpKey: c.TCPKey, started: time.Now()}
}
func (s *server) Handler(quiet bool) http.Handler                  { return s.routes(quiet) }
func (s *server) ListenTCP(ctx context.Context, addr string) error { return listenTCP(ctx, addr, s) }
