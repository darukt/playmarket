package transfers_test

import (
	transfers "playmarket-backend/internal/services/transfers/services"
	"strings"
	"testing"
)

func TestProofBindsChallengeAndResource(t *testing.T) {
	key := strings.Repeat("k", 32)
	nonce := strings.Repeat("a", 64)
	proof := transfers.Proof(key, nonce, "app", "windows")
	if !transfers.Verify(key, nonce, "app", "windows", proof) {
		t.Fatal("valid proof rejected")
	}
	if transfers.Verify(key, strings.Repeat("b", 64), "app", "windows", proof) {
		t.Fatal("replay accepted")
	}
	if transfers.Verify(key, nonce, "other", "windows", proof) {
		t.Fatal("proof accepted for another resource")
	}
	if transfers.Verify(key, nonce, "app", "android", proof) {
		t.Fatal("proof accepted for another platform")
	}
	if transfers.Verify("", nonce, "app", "windows", proof) {
		t.Fatal("missing key accepted")
	}
}
