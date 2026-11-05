package controller

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	transfer "playmarket-backend/internal/services/transfers/services"
	"strings"
	"time"
)

// TCP is opt-in. Non-loopback listeners must present a TLS certificate.
func listenTCP(ctx context.Context, addr string, s *server) error {
	if len(s.tcpKey) < 32 {
		return errors.New("PM_TCP_KEY must contain at least 32 bytes")
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	loopback := ip != nil && ip.IsLoopback()
	certPath, keyPath := os.Getenv("PM_TCP_TLS_CERT"), os.Getenv("PM_TCP_TLS_KEY")
	var ln net.Listener
	if certPath != "" && keyPath != "" {
		cert, e := tls.LoadX509KeyPair(certPath, keyPath)
		if e != nil {
			return e
		}
		ln, err = tls.Listen("tcp", addr, &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS13})
	} else {
		if !loopback {
			return errors.New("public TCP requires PM_TCP_TLS_CERT and PM_TCP_TLS_KEY")
		}
		ln, err = net.Listen("tcp", addr)
	}
	if err != nil {
		return err
	}
	defer ln.Close()
	go func() { <-ctx.Done(); _ = ln.Close() }()
	slots := make(chan struct{}, 64)
	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil
			}
			log.Printf("tcp accept: %v", err)
			continue
		}
		select {
		case slots <- struct{}{}:
			go func() { defer func() { <-slots }(); handleTCPConn(conn, s) }()
		default:
			_ = conn.Close()
		}
	}
}

// Random challenges bind request proofs to one connection; captured proofs cannot be replayed.
func handleTCPConn(conn net.Conn, s *server) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	if len(s.tcpKey) < 32 {
		writeErr(conn, "channel disabled")
		return
	}
	var nonce [32]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return
	}
	challenge := hex.EncodeToString(nonce[:])
	if _, err := fmt.Fprintf(conn, "PM2-CHALLENGE %s\n", challenge); err != nil {
		return
	}
	reader := bufio.NewReader(io.LimitReader(conn, 1024))
	line, err := reader.ReadString('\n')
	if err != nil {
		writeErr(conn, "invalid request")
		return
	}
	parts := strings.Fields(line)
	if len(parts) != 4 || parts[0] != "PM2-GET" || !transfer.Verify(s.tcpKey, challenge, parts[1], parts[2], parts[3]) {
		writeErr(conn, "authentication failed")
		return
	}
	id, platform := parts[1], parts[2]
	if normPlatform(platform) == "" {
		writeErr(conn, "invalid platform")
		return
	}
	e, ok := s.store.Get(id)
	if !ok {
		writeErr(conn, "not found")
		return
	}
	a, err := s.resolveArtifact(e, platform)
	if err != nil {
		writeErr(conn, "artifact unavailable")
		return
	}
	f, err := a.open()
	if err != nil {
		writeErr(conn, "artifact unavailable")
		return
	}
	defer f.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Minute))
	name := strings.ReplaceAll(a.name, " ", "_")
	if _, err := fmt.Fprintf(conn, "PM2-OK %d %s\n", a.size, name); err != nil {
		return
	}
	n, err := io.Copy(conn, f)
	if err == nil {
		s.store.LogDownload("tcp", e.ID, platform, n)
	}
}
func writeErr(conn net.Conn, msg string) {
	fmt.Fprintf(conn, "PM2-ERR %s\n", strings.ReplaceAll(msg, "\n", " "))
}
