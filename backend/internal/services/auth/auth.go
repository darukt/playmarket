// Package auth composes authentication repository, policy and HTTP controller.
package auth

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"playmarket-backend/internal/services/auth/controller"
	"playmarket-backend/internal/services/auth/services"
)

type Config = services.Config
type Manager struct{ *services.Manager }

func New(c Config) (*Manager, error) {
	m, err := services.New(c)
	if err != nil {
		return nil, err
	}
	return &Manager{m}, nil
}
func NewFromEnv(dataDir string) (*Manager, error) {
	return New(Config{AccountsPath: filepath.Join(dataDir, "accounts.json"), PublicURL: os.Getenv("PM_PUBLIC_URL"), AllowedOrigins: strings.Split(os.Getenv("PM_ALLOWED_ORIGINS"), ","), GoogleClientID: os.Getenv("PM_GOOGLE_CLIENT_ID"), GoogleClientSecret: os.Getenv("PM_GOOGLE_CLIENT_SECRET"), AdminUserIDs: strings.Split(os.Getenv("PM_ADMIN_USER_IDS"), ","), AdminGoogleEmails: strings.Split(os.Getenv("PM_ADMIN_GOOGLE_EMAILS"), ","), AdminDeviceKey: os.Getenv("PM_ADMIN_DEVICE_KEY"), TrustProxy: os.Getenv("PM_TRUST_PROXY") == "true"})
}
func (m *Manager) RegisterRoutes(mux *http.ServeMux) {
	controller.Controller{Manager: m.Manager}.RegisterRoutes(mux)
}
