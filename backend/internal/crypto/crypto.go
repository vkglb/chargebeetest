// Package crypto encrypts small secrets (gateway API keys) at rest with
// AES-256-GCM. The DB stores ciphertext; values are decrypted only when used to
// call a gateway. Without a configured key it runs in passthrough mode so local
// development works without setup — production must set CREDENTIALS_ENC_KEY.
package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// magic marks AES-GCM ciphertext so we can tell it apart from legacy plaintext
// values written before encryption was enabled (smooths the migration).
var magic = []byte("enc1:")

// Cipher seals and opens secrets with AES-256-GCM.
type Cipher struct {
	aead cipher.AEAD // nil => passthrough (no encryption configured)
}

// New builds a Cipher from a base64-encoded 32-byte key. An empty key yields a
// passthrough Cipher (no encryption) for local development.
func New(base64Key string) (*Cipher, error) {
	if base64Key == "" {
		return &Cipher{}, nil
	}
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("decode CREDENTIALS_ENC_KEY: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("CREDENTIALS_ENC_KEY must decode to 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Enabled reports whether encryption is active (a key was configured).
func (c *Cipher) Enabled() bool { return c.aead != nil }

// Encrypt returns magic+nonce+sealed ciphertext, or the raw plaintext bytes in
// passthrough mode.
func (c *Cipher) Encrypt(plaintext string) ([]byte, error) {
	if c.aead == nil {
		return []byte(plaintext), nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	sealed := c.aead.Seal(nil, nonce, []byte(plaintext), nil)
	out := make([]byte, 0, len(magic)+len(nonce)+len(sealed))
	out = append(out, magic...)
	out = append(out, nonce...)
	out = append(out, sealed...)
	return out, nil
}

// Decrypt reverses Encrypt. Values without the magic prefix are treated as
// legacy plaintext and returned unchanged, so rows written before encryption
// keep working until they're next saved.
func (c *Cipher) Decrypt(data []byte) (string, error) {
	if !bytes.HasPrefix(data, magic) {
		return string(data), nil // legacy plaintext
	}
	if c.aead == nil {
		return "", errors.New("encrypted credential present but no CREDENTIALS_ENC_KEY configured")
	}
	body := data[len(magic):]
	ns := c.aead.NonceSize()
	if len(body) < ns {
		return "", errors.New("ciphertext too short")
	}
	nonce, sealed := body[:ns], body[ns:]
	plain, err := c.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt credential: %w", err)
	}
	return string(plain), nil
}
