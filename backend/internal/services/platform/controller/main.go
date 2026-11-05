package controller

import (
	"net/http"
	catalogcontroller "playmarket-backend/internal/services/catalog/controller"
	scorescontroller "playmarket-backend/internal/services/scores/controller"
)

// routes собирает таблицу маршрутов и цепочку middleware.
func (s *server) routes(quietStatic bool) http.Handler {
	mux := http.NewServeMux()
	s.auth.RegisterRoutes(mux)
	mux.HandleFunc("/api/healthz", s.healthz)
	mux.HandleFunc("/api/me", s.me)
	catalogHTTP := &catalogcontroller.Controller{Catalog: s.store}
	mux.HandleFunc("/api/catalog", catalogHTTP.List)
	mux.HandleFunc("/api/apps/", catalogHTTP.One) // GET /api/apps/{id}
	mux.HandleFunc("/api/download/", s.download)  // GET /api/download/{id}?platform=windows
	scoresHTTP := &scorescontroller.Controller{Scores: s.scores, Catalog: s.store, Auth: s.auth}
	mux.HandleFunc("/api/games/", scoresHTTP.Handler)   // GET|POST /api/games/{slug}/scores
	mux.HandleFunc("/ws/download", s.wsDownload)        // WebSocket
	mux.HandleFunc("/api/admin/games", s.adminGames)    // GET список, POST multipart (admin session)
	mux.HandleFunc("/api/admin/games/", s.adminGames)   // DELETE /api/admin/games/{id}
	mux.HandleFunc("/api/admin/stats", s.adminStats)    // GET статистика
	mux.HandleFunc("/api/admin/scores/", s.adminScores) // DELETE /api/admin/scores/{slug}
	mux.HandleFunc("/uploads/", s.uploads)              // отдача загруженных артефактов/иконок
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "unknown api route")
	})

	// Static assets and SPA routing belong exclusively to nginx.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })

	return recoverMiddleware(securityMiddleware(logMiddleware(s.auth.Middleware(s.visitorMiddleware(mux)), quietStatic)))
}
