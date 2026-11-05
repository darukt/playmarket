// Package storage contains shared durable file replacement primitives.
package storage

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

// WriteAtomic writes a unique temporary file in the destination directory.
// Windows antivirus/indexer handles can briefly block replacement: retry only
// those sharing/access errors, without removing the existing committed file.
func WriteAtomic(path string, data []byte, mode os.FileMode) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".write-*.tmp")
	if err != nil {
		return err
	}
	tmp := file.Name()
	defer os.Remove(tmp)
	if err := file.Chmod(mode); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	for attempt := 0; ; attempt++ {
		err = os.Rename(tmp, path)
		if err == nil {
			return nil
		}
		transient := os.IsPermission(err) || errors.Is(err, syscall.Errno(32))
		if runtime.GOOS != "windows" || !transient || attempt >= 6 {
			return err
		}
		time.Sleep(time.Duration(10<<attempt) * time.Millisecond)
	}
}
