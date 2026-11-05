package visitors

import (
	"encoding/json"
	"os"
	"playmarket-backend/internal/storage"
	"sync"
	"time"
)

type Entry struct {
	FirstSeen    int64  `json:"firstSeen"`
	LastSeen     int64  `json:"lastSeen"`
	Downloads    int    `json:"downloads"`
	LastPlatform string `json:"lastPlatform,omitempty"`
}

type Registry struct {
	mu   sync.Mutex
	path string
	data map[string]*Entry
}

func Open(path string) (*Registry, error) {
	r := &Registry{path: path, data: map[string]*Entry{}}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return r, nil
	}
	if err := json.Unmarshal(b, &r.data); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *Registry) save() error {
	b, err := json.MarshalIndent(r.data, "", "  ")
	if err != nil {
		return err
	}
	return storage.WriteAtomic(r.path, b, 0o600)
}

func (r *Registry) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.data)
}

// get возвращает копию записи посетителя (нулевую, если его нет).
func (r *Registry) Get(uuid string) Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	if u := r.data[uuid]; u != nil {
		return *u
	}
	return Entry{}
}

func (r *Registry) Ensure(uuid string) *Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	u := r.data[uuid]
	if u == nil {
		now := time.Now().Unix()
		u = &Entry{FirstSeen: now, LastSeen: now}
		r.data[uuid] = u
		return u
	}
	u.LastSeen = time.Now().Unix()
	return u
}

func (r *Registry) RecordDownload(uuid, platform string) {
	if uuid == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	u := r.data[uuid]
	if u == nil {
		now := time.Now().Unix()
		u = &Entry{FirstSeen: now, LastSeen: now}
		r.data[uuid] = u
	}
	u.Downloads++
	u.LastSeen = time.Now().Unix()
	u.LastPlatform = platform
	_ = r.save()
}
