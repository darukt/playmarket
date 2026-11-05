package controller

import (
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	// Default Gorilla check rejects cross-origin browser requests.
}

type wsMessage struct {
	Type     string `json:"type"`
	Name     string `json:"name,omitempty"`
	Size     int64  `json:"size,omitempty"`
	Platform string `json:"platform,omitempty"`
	Mime     string `json:"mime,omitempty"`
	Bytes    int64  `json:"bytes,omitempty"`
	Message  string `json:"message,omitempty"`
}

const wsChunk = 64 * 1024

// wsDownload: GET /ws/download?id=<id>&platform=windows|android
// Клиент получает JSON-кадр start -> бинарные чанки по 64 КБ -> JSON-кадр done
// (или единственный кадр error). Используется прогресс-баром на странице приложения.
func (s *server) wsDownload(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing id")
		return
	}
	e, ok := s.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	platform := detectPlatform(r)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Minute))

	a, err := s.resolveArtifact(e, platform)
	if err != nil {
		_ = conn.WriteJSON(wsMessage{Type: "error", Message: "artifact unavailable"})
		return
	}
	f, err := a.open()
	if err != nil {
		_ = conn.WriteJSON(wsMessage{Type: "error", Message: "artifact unavailable"})
		return
	}
	defer f.Close()

	if err := conn.WriteJSON(wsMessage{Type: "start", Name: a.name, Size: a.size, Platform: platform, Mime: a.contentType}); err != nil {
		return
	}
	buf := make([]byte, wsChunk)
	var sent int64
	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return // клиент ушёл — загрузку не засчитываем
			}
			sent += int64(n)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			_ = conn.WriteJSON(wsMessage{Type: "error", Message: "read failed"})
			return
		}
	}
	uuid := uuidFrom(r.Context())
	s.users.RecordDownload(uuid, platform)
	s.store.LogDownload(uuid, e.ID, platform, sent)
	_ = conn.WriteJSON(wsMessage{Type: "done", Bytes: sent})
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
}
