// Package auth handles dashboard sessions (JWT) and merchant API keys.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// APIKey is a freshly generated key. The plaintext is shown to the merchant
// exactly once; only Hash and Prefix are persisted.
type APIKey struct {
	Plaintext string // full key, e.g. "live_ab12cd34..." — return once, never store
	Prefix    string // visible identifier stored for lookup/display
	Hash      string // sha256 hex of the plaintext — stored
}

// GenerateAPIKey creates a new API key for the given environment ("live"|"test").
func GenerateAPIKey(env string) (APIKey, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return APIKey{}, fmt.Errorf("generate api key: %w", err)
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	plaintext := fmt.Sprintf("%s_%s", env, body)

	// Prefix = env + first 4 chars of the body, used for non-secret display/lookup.
	prefix := fmt.Sprintf("%s_%s", env, body[:4])

	return APIKey{
		Plaintext: plaintext,
		Prefix:    prefix,
		Hash:      HashAPIKey(plaintext),
	}, nil
}

// HashAPIKey returns the hex sha256 of a plaintext key for storage/comparison.
func HashAPIKey(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}

// VerifyAPIKey constant-time compares a presented key against a stored hash.
func VerifyAPIKey(presented, storedHash string) bool {
	got := HashAPIKey(strings.TrimSpace(presented))
	return subtle.ConstantTimeCompare([]byte(got), []byte(storedHash)) == 1
}

// PrefixFromKey derives the stored prefix (env + first 4 body chars) from a
// presented plaintext key, so the key can be looked up without storing it.
func PrefixFromKey(presented string) (string, bool) {
	presented = strings.TrimSpace(presented)
	env, body, ok := strings.Cut(presented, "_")
	if !ok || len(body) < 4 {
		return "", false
	}
	return fmt.Sprintf("%s_%s", env, body[:4]), true
}
