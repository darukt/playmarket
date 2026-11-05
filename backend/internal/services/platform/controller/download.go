package controller

import (
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

// Uploaded packages are streamed from disk. Official packages are redirected
// to their publisher without proxying or buffering third-party executables.
type artifact struct {
	name        string
	contentType string
	size        int64
	modTime     time.Time
	path        string
}

func (a *artifact) open() (io.ReadSeekCloser, error) {
	f, err := os.Open(a.path)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() || st.Size() <= 0 || st.Size() > maxArtifact {
		f.Close()
		return nil, fmt.Errorf("artifact unavailable")
	}
	a.size, a.modTime = st.Size(), st.ModTime()
	return f, nil
}

// resolveArtifact only returns genuine uploaded artifacts, never a demo fallback.
func (s *server) resolveArtifact(e catalog.Entry, platform string) (*artifact, error) {
	if e.Kind == catalog.KindWeb {
		return nil, fmt.Errorf("%s — веб-игра, её можно запустить на /games/%s без скачивания", e.Name, valueOrEmpty(e.Game))
	}
	if uploaded, ok := s.store.Artifact(e, platform); ok {
		st, err := os.Stat(uploaded)
		if err != nil {
			return nil, err
		}
		if !st.Mode().IsRegular() || st.Size() <= 0 || st.Size() > maxArtifact {
			return nil, fmt.Errorf("artifact unavailable")
		}
		a := &artifact{
			name:        s.store.FilenameFor(e, platform),
			contentType: "application/x-msdownload",
			size:        st.Size(),
			modTime:     st.ModTime(),
			path:        uploaded,
		}
		if platform == "android" {
			a.contentType = "application/vnd.android.package-archive"
		}
		return a, nil
	}

	return nil, fmt.Errorf("artifact unavailable")
}

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
	// Android is the default package platform.
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
	if e.Kind == catalog.KindWeb {
		writeError(w, http.StatusConflict, "web games run in the browser")
		return
	}
	source, external := e.DownloadsByPlatform[platform]
	_, uploaded := s.store.Artifact(e, platform)
	if !uploaded && !external && platform != "android" {
		platform = "android"
		source, external = e.DownloadsByPlatform[platform]
		_, uploaded = s.store.Artifact(e, platform)
	}
	if !uploaded && !external {
		writeError(w, http.StatusNotFound, "official package unavailable for this platform")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Platform", platform)
	if external && !uploaded {
		if err := catalog.ValidateDownloads(map[string]catalog.DownloadSource{platform: source}); err != nil {
			writeError(w, http.StatusConflict, "invalid download source")
			return
		}
		if r.URL.Query().Get("resolve") == "1" {
			writeJSON(w, http.StatusOK, map[string]string{"kind": source.Kind, "platform": platform, "url": source.URL, "filename": source.Filename})
			return
		}
		// A redirect requests a publisher download; it cannot prove completion.
		http.Redirect(w, r, source.URL, http.StatusFound)
		return
	}
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
	if r.URL.Query().Get("resolve") == "1" {
		writeJSON(w, http.StatusOK, map[string]string{"kind": "file", "platform": platform, "url": "/api/download/" + e.ID + "?platform=" + platform, "filename": a.name})
		return
	}

	w.Header().Set("Content-Type", a.contentType)
	w.Header().Set("Content-Disposition", contentDisposition(a.name))
	response := &statusRecorder{ResponseWriter: w}
	http.ServeContent(response, r, a.name, a.modTime, f)
	// Count complete HTTP responses only. Metadata, HEAD, 304, partial ranges,
	// and interrupted transfers do not establish that a full package was served.
	if r.Method == http.MethodGet && r.Header.Get("Range") == "" && response.status == http.StatusOK && response.bytes == a.size {
		uuid := uuidFrom(r.Context())
		s.users.RecordDownload(uuid, platform)
		s.store.LogDownload(uuid, e.ID, platform, a.size)
	}
}
