package billing

import (
	"context"

	"github.com/chargeebee/platform/internal/crypto"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/gateway"
)

// PlaintextResolver treats stored encrypted_credentials as the raw secret key.
// FOR DEVELOPMENT/TESTS ONLY — prefer CipherResolver.
type PlaintextResolver struct{}

// Resolve returns credentials built directly from the stored account row.
func (PlaintextResolver) Resolve(_ context.Context, account sqlc.GatewayAccount) (gateway.Credentials, error) {
	return gateway.Credentials{
		Provider:   account.Provider,
		AccountRef: account.AccountRef.String,
		SecretKey:  string(account.EncryptedCredentials),
	}, nil
}

var _ CredentialResolver = PlaintextResolver{}

// CipherResolver decrypts the stored gateway secret before each use, so the
// secret key only exists in plaintext in memory at charge time.
type CipherResolver struct {
	Cipher *crypto.Cipher
}

// Resolve decrypts encrypted_credentials into usable gateway credentials.
func (r CipherResolver) Resolve(_ context.Context, account sqlc.GatewayAccount) (gateway.Credentials, error) {
	secret, err := r.Cipher.Decrypt(account.EncryptedCredentials)
	if err != nil {
		return gateway.Credentials{}, err
	}
	return gateway.Credentials{
		Provider:   account.Provider,
		AccountRef: account.AccountRef.String,
		SecretKey:  secret,
	}, nil
}

var _ CredentialResolver = CipherResolver{}
