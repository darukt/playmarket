// Package transfers implements the authenticated PM2 download handshake.
package transfers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func Proof(key, challenge, id, platform string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("PM2\n" + challenge + "\n" + id + "\n" + platform))
	return hex.EncodeToString(mac.Sum(nil))
}
func Verify(key, challenge, id, platform, proof string) bool {
	if len(key) < 32 || len(challenge) != 64 || len(proof) != 64 || strings.ContainsAny(id+platform, "\r\n\t ") {
		return false
	}
	got, err := hex.DecodeString(proof)
	if err != nil {
		return false
	}
	want, _ := hex.DecodeString(Proof(key, challenge, id, platform))
	return hmac.Equal(got, want)
}
