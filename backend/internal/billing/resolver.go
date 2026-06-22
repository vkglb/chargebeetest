package billing

import (
	"context"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/gateway"
)

// PlaintextResolver treats stored encrypted_credentials as the raw secret key.
// FOR DEVELOPMENT ONLY — production must decrypt via a KMS-managed key.
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
