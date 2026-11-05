// PlayMarket — бэкенд каталога и загрузки пакетов.
// HTTP API (:8080), WebSocket download (/ws/download), сырой TCP (:9001),
// API and transport adapters; the gateway owns static frontend delivery.
package platform

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"playmarket-backend/internal/services/auth"
	"playmarket-backend/internal/services/catalog/services"
	"playmarket-backend/internal/services/platform/controller"
	visitors "playmarket-backend/internal/services/platform/repo"
	"playmarket-backend/internal/services/scores/services"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Run() {
	dataDir := getenv("PM_DATA_DIR", "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatalf("data dir: %v", err)
	}
	seedPath := getenv("PM_SEED", filepath.Join("data", "seed.json"))
	addr := getenv("PM_ADDR", "127.0.0.1:8080")
	tcpAddr := os.Getenv("PM_TCP_ADDR")

	store, err := catalog.Open(dataDir, seedPath)
	if err != nil {
		log.Fatalf("catalog: %v", err)
	}
	defer store.Close()
	us, err := visitors.Open(filepath.Join(dataDir, "users.json"))
	if err != nil {
		log.Fatalf("users: %v", err)
	}
	board, err := scores.Open(filepath.Join(dataDir, "scores.json"))
	if err != nil {
		log.Fatalf("scores: %v", err)
	}

	authManager, err := auth.NewFromEnv(dataDir)
	if err != nil {
		log.Fatalf("auth: %v", err)
	}
	srv := controller.New(controller.Config{Catalog: store, Visitors: us, Scores: board, Auth: authManager, TCPKey: os.Getenv("PM_TCP_KEY")})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if tcpAddr != "" {
		go func() {
			if err := srv.ListenTCP(ctx, tcpAddr); err != nil {
				log.Fatalf("tcp: %v", err)
			}
		}()
	}

	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(os.Getenv("PM_LOG_STATIC") == ""),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		// WriteTimeout не ставим: загрузки крупных .apk/.exe идут долго.
	}
	go func() {
		<-ctx.Done()
		log.Printf("остановка…")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	log.Printf("playmarket backend: http %s, tcp %s, data %s", addr, tcpAddr, dataDir)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
