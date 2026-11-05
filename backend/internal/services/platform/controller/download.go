package controller

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"playmarket-backend/internal/services/catalog/services"
)

const platformHeader = "X-Platform"

// maxArtifact — верхняя граница загружаемого через Студию артефакта.
const maxArtifact = 512 << 20

// artifact — то, что отдаётся клиенту: либо файл на диске (загруженный
// через Студию .exe/.apk — стримится, в память не читается), либо байты
// в памяти (демо-установщик / сгенерированный demo-zip).
type artifact struct {
	name        string
	contentType string
	size        int64
	modTime     time.Time
	path        string
	data        []byte
}

type nopReadSeekCloser struct{ *bytes.Reader }

func (nopReadSeekCloser) Close() error { return nil }

func (a *artifact) open() (io.ReadSeekCloser, error) {
	if a.path != "" {
		return os.Open(a.path)
	}
	return nopReadSeekCloser{bytes.NewReader(a.data)}, nil
}

// resolveArtifact выбирает, что отдать для платформы. Windows без
// загруженного .exe получает встроенный демо-установщик; Android без .apk —
// сгенерированный demo-zip (README + тот же .exe). Веб-игры не скачиваются.
func (s *server) resolveArtifact(e catalog.Entry, platform string) (*artifact, error) {
	if e.Kind == catalog.KindWeb {
		return nil, fmt.Errorf("%s — веб-игра, её можно запустить на /games/%s без скачивания", e.Name, valueOrEmpty(e.Game))
	}
	if uploaded, ok := s.store.Artifact(e, platform); ok {
		st, err := os.Stat(uploaded)
		if err != nil {
			return nil, err
		}
		if st.Size() > maxArtifact {
			return nil, fmt.Errorf("артефакт больше %d байт", maxArtifact)
		}
		a := &artifact{
			name:        s.store.FilenameFor(e, platform),
			contentType: "application/x-msdownload",
			size:        st.Size(),
			modTime:     st.ModTime(),
			path:        uploaded,
		}
		if platform == "android" {
			a.name = strings.TrimSuffix(a.name, "-demo.zip") + ".apk"
			a.contentType = "application/vnd.android.package-archive"
		}
		return a, nil
	}

	switch platform {
	case "windows":
		return &artifact{
			name:        s.store.FilenameFor(e, "windows"),
			contentType: "application/x-msdownload",
			size:        int64(len(s.stub)),
			modTime:     s.started,
			data:        s.stub,
		}, nil
	default: // android и всё остальное — честный демо-zip
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		readme, err := zw.Create("КАК-ЭТО-РАБОТАЕТ.txt")
		if err != nil {
			return nil, err
		}
		if _, err := fmt.Fprintf(readme, readmeTemplate, e.Name, e.Developer, e.Version); err != nil {
			return nil, err
		}
		exe, err := zw.Create(s.store.FilenameFor(e, "windows"))
		if err != nil {
			return nil, err
		}
		if _, err := exe.Write(s.stub); err != nil {
			return nil, err
		}
		if err := zw.Close(); err != nil {
			return nil, err
		}
		return &artifact{
			name:        s.store.FilenameFor(e, "android"),
			contentType: "application/zip",
			size:        int64(buf.Len()),
			modTime:     s.started,
			data:        buf.Bytes(),
		}, nil
	}
}

const readmeTemplate = `%s (%s), версия %s

Это демонстрационный пакет Play Market.
Настоящий APK для этого приложения добавляет разработчик через Студию.

Внутри архива — настоящий демонстрационный PlayMarket-Setup.exe
(запускайте его, если вам нужна установка-симуляция для Windows).

Каталог не связан с Google и не распространяет оригинальные APK.
`

func valueOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func contentDisposition(filename string) string {
	fallback := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, filename)
	return fmt.Sprintf("attachment; filename=%q; filename*=UTF-8''%s", fallback, urlQueryEscape(filename))
}

func urlQueryEscape(s string) string {
	var b strings.Builder
	for _, r := range []byte(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_', r == '~':
			b.WriteByte(r)
		default:
			fmt.Fprintf(&b, "%%%02X", r)
		}
	}
	return b.String()
}

func normPlatform(p string) string {
	switch strings.ToLower(strings.TrimSpace(p)) {
	case "windows":
		return "windows"
	case "android":
		return "android"
	}
	return ""
}

// detectPlatform: ?platform= → заголовок X-Platform → User-Agent → android.
func detectPlatform(r *http.Request) string {
	if p := normPlatform(r.URL.Query().Get("platform")); p != "" {
		return p
	}
	if p := normPlatform(r.Header.Get(platformHeader)); p != "" {
		return p
	}
	ua := strings.ToLower(r.UserAgent())
	if strings.Contains(ua, "windows") {
		return "windows"
	}
	// android, iOS и всё неизвестное — demo-zip / apk
	return "android"
}

// GET|HEAD /api/download/{id}?platform=windows|android
// Отдаёт файл через http.ServeContent: Content-Length, Range, If-Modified-Since.
func (s *server) download(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/download/"), "/")
	e, ok := s.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	platform := detectPlatform(r)
	a, err := s.resolveArtifact(e, platform)
	if err != nil {
		writeError(w, http.StatusConflict, "artifact unavailable")
		return
	}
	f, err := a.open()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "artifact unavailable")
		return
	}
	defer f.Close()

	// Журналируем только реальные загрузки целиком, без HEAD и докачек.
	if r.Method == http.MethodGet && r.Header.Get("Range") == "" {
		uuid := uuidFrom(r.Context())
		s.users.RecordDownload(uuid, platform)
		s.store.LogDownload(uuid, e.ID, platform, a.size)
	}

	w.Header().Set("Content-Type", a.contentType)
	w.Header().Set("Content-Disposition", contentDisposition(a.name))
	w.Header().Set("X-Platform", platform)
	http.ServeContent(w, r, a.name, a.modTime, f)
}
