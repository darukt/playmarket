// pmget downloads packages with a PM2 HMAC challenge over verified TLS.
package main

import (
	"bufio"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	transfer "playmarket-backend/internal/services/transfers/services"
	"strings"
	"time"
)

func run() error {
	addr := flag.String("addr", "127.0.0.1:9001", "TCP server address")
	id := flag.String("id", "", "application id")
	platform := flag.String("platform", "windows", "windows | android")
	out := flag.String("out", "", "destination path")
	plain := flag.Bool("plaintext-local", false, "allow plaintext only to a numeric loopback address")
	flag.Parse()
	key := os.Getenv("PM_TCP_KEY")
	if *id == "" || strings.ContainsAny(*id, " \r\n\t") || (*platform != "windows" && *platform != "android") {
		return fmt.Errorf("provide -id and a valid -platform")
	}
	if len(key) < 32 {
		return fmt.Errorf("set PM_TCP_KEY to the server channel secret (at least 32 bytes)")
	}
	var conn net.Conn
	var err error
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	if *plain {
		host, _, e := net.SplitHostPort(*addr)
		if e != nil {
			return e
		}
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			return fmt.Errorf("plaintext is allowed only on a numeric loopback address")
		}
		conn, err = dialer.Dial("tcp", *addr)
	} else {
		conn, err = tls.DialWithDialer(dialer, "tcp", *addr, &tls.Config{MinVersion: tls.VersionTLS13})
	}
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReaderSize(conn, 1024)
	line, err := reader.ReadString('\n')
	if err != nil {
		return err
	}
	parts := strings.Fields(line)
	if len(parts) != 2 || parts[0] != "PM2-CHALLENGE" || len(parts[1]) != 64 {
		return fmt.Errorf("server did not offer an authenticated PM2 handshake")
	}
	proof := transfer.Proof(key, parts[1], *id, *platform)
	if _, err := fmt.Fprintf(conn, "PM2-GET %s %s %s\n", *id, *platform, proof); err != nil {
		return err
	}
	header, err := reader.ReadString('\n')
	if err != nil {
		return err
	}
	if strings.HasPrefix(header, "PM2-ERR") {
		return fmt.Errorf("server rejected download: %s", strings.TrimSpace(header))
	}
	var size int64
	var filename string
	if _, err := fmt.Sscanf(header, "PM2-OK %d %s", &size, &filename); err != nil || size < 0 || size > 512<<20 {
		return fmt.Errorf("invalid transfer header")
	}
	if filename == "." || filename == ".." || filepath.Base(filename) != filename || strings.ContainsAny(filename, "/\\:\x00") {
		return fmt.Errorf("unsafe transfer filename")
	}
	dest := *out
	if dest == "" {
		dest = filename
	}
	if err := os.MkdirAll(filepath.Dir(filepath.Clean(dest)), 0o755); err != nil {
		return err
	}
	// Never overwrite an existing user file, and delete an interrupted partial download.
	f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	complete := false
	defer func() {
		f.Close()
		if !complete {
			_ = os.Remove(dest)
		}
	}()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Minute))
	written, err := io.CopyN(f, reader, size)
	if err != nil {
		return fmt.Errorf("transfer interrupted at %d bytes: %w", written, err)
	}
	if err := f.Close(); err != nil {
		return err
	}
	complete = true
	fmt.Printf("Downloaded %s (%d bytes)\n", dest, written)
	return nil
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
