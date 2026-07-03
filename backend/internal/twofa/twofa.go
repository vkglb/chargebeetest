// Package twofa implements TOTP (RFC 6238) two-factor authentication with no
// external dependencies. Secrets are base32 (unpadded, uppercase) so they can be
// entered into or scanned by standard authenticator apps (Google Authenticator,
// Authy, 1Password, …).
package twofa

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	period = 30 // seconds per code
	digits = 6
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// GenerateSecret returns a new random base32 secret (160 bits, the TOTP norm).
func GenerateSecret() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return b32.EncodeToString(buf), nil
}

// OTPAuthURL builds the otpauth:// URI encoded into the enrollment QR code.
// issuer and account appear in the authenticator app entry.
func OTPAuthURL(secret, account, issuer string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprintf("%d", digits))
	q.Set("period", fmt.Sprintf("%d", period))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// Validate reports whether code is a valid TOTP for secret at the current time,
// allowing ±1 step of clock skew (matching how apps like Google Authenticator
// tolerate drift).
func Validate(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != digits {
		return false
	}
	key, err := b32.DecodeString(strings.ToUpper(strings.ReplaceAll(secret, " ", "")))
	if err != nil {
		return false
	}
	counter := time.Now().Unix() / period
	for _, skew := range []int64{0, -1, 1} {
		if generate(key, counter+skew) == code {
			return true
		}
	}
	return false
}

// generate computes the HMAC-SHA1 TOTP code for a counter (RFC 4226 truncation).
func generate(key []byte, counter int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:])
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	value := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	return fmt.Sprintf("%0*d", digits, value%1_000_000)
}
