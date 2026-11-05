// Package repo owns account persistence. Session credentials never enter this file.
package repo

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"playmarket-backend/internal/storage"
	"sync"
)

var ErrExists = errors.New("account already exists")

type Account struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	PasswordHash  string `json:"passwordHash,omitempty"`
	GoogleSubject string `json:"googleSubject,omitempty"`
}

type Accounts struct {
	mu       sync.RWMutex
	path     string
	byID     map[string]Account
	byEmail  map[string]string
	byGoogle map[string]string
}

func Open(path string) (*Accounts, error) {
	r := &Accounts{path: path, byID: map[string]Account{}, byEmail: map[string]string{}, byGoogle: map[string]string{}}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}
	var all []Account
	if err := json.Unmarshal(b, &all); err != nil {
		return nil, err
	}
	for _, a := range all {
		if a.ID == "" || a.Email == "" || r.byID[a.ID].ID != "" || r.byEmail[a.Email] != "" {
			return nil, errors.New("invalid account database")
		}
		if a.GoogleSubject != "" && r.byGoogle[a.GoogleSubject] != "" {
			return nil, errors.New("duplicate provider identity")
		}
		r.byID[a.ID] = a
		r.byEmail[a.Email] = a.ID
		if a.GoogleSubject != "" {
			r.byGoogle[a.GoogleSubject] = a.ID
		}
	}
	// Restrict existing stores too; don't rely on process umask.
	if err := os.Chmod(path, 0o600); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *Accounts) ByID(id string) (Account, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.byID[id]
	return a, ok
}
func (r *Accounts) ByEmail(email string) (Account, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.byID[r.byEmail[email]]
	return a, ok
}
func (r *Accounts) ByGoogle(sub string) (Account, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.byID[r.byGoogle[sub]]
	return a, ok
}

func (r *Accounts) Create(a Account) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.byEmail[a.Email] != "" || r.byID[a.ID].ID != "" || (a.GoogleSubject != "" && r.byGoogle[a.GoogleSubject] != "") {
		return ErrExists
	}
	r.byID[a.ID] = a
	r.byEmail[a.Email] = a.ID
	if a.GoogleSubject != "" {
		r.byGoogle[a.GoogleSubject] = a.ID
	}
	if err := r.save(); err != nil {
		delete(r.byID, a.ID)
		delete(r.byEmail, a.Email)
		delete(r.byGoogle, a.GoogleSubject)
		return err
	}
	return nil
}

func (r *Accounts) save() error {
	all := make([]Account, 0, len(r.byID))
	for _, a := range r.byID {
		all = append(all, a)
	}
	b, err := json.Marshal(all)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(r.path), 0o700); err != nil {
		return err
	}
	return storage.WriteAtomic(r.path, b, 0o600)
}
