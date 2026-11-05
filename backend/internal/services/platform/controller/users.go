package controller

import (
	"net/http"
	visitors "playmarket-backend/internal/services/platform/repo"
	"strings"
)

type usersRegistry = visitors.Registry

var openUsers = visitors.Open

// isStaticPath — запросы за статикой не создают посетителей: иначе первый
// заход без cookie (десятки параллельных запросов за ассетами) плодит uuid.
func isStaticPath(p string) bool {
	for _, prefix := range []string{"/assets/", "/media/", "/uploads/"} {
		if strings.HasPrefix(p, prefix) {
			return true
		}
	}
	switch p {
	case "/favicon.svg", "/favicon.ico", "/robots.txt", "/sitemap.xml":
		return true
	}
	return false
}

func (s *server) visitorMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := s.auth.UserID(r)
		if id != "" && (r.URL.Path == "/api/me" || strings.HasPrefix(r.URL.Path, "/api/games/") || strings.HasPrefix(r.URL.Path, "/api/download/") || strings.HasPrefix(r.URL.Path, "/ws/")) {
			s.users.Ensure(id)
		}
		next.ServeHTTP(w, r.WithContext(withUUID(r.Context(), id)))
	})
}
