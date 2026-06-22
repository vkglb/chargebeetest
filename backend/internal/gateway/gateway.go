// Package gateway defines the payment-gateway abstraction. Stripe is the only
// implementation in v1, but every concrete gateway (Razorpay, Braintree, ...)
// satisfies this interface so billing logic never depends on a specific provider.
package gateway

import (
	"context"

	"github.com/chargeebee/platform/internal/domain"
)

// Credentials carries a single merchant's resolved gateway access. For Stripe
// Connect this wraps the merchant's connected account id / access token.
type Credentials struct {
	Provider   string // "stripe"
	AccountRef string // e.g. Stripe Connect acct_xxx
	SecretKey  string // decrypted secret used to authenticate calls as the merchant
}

// CustomerParams describes a customer to create in the gateway.
type CustomerParams struct {
	Email string
	Name  string
}

// ChargeParams describes an off-session (merchant-initiated) recurring charge.
type ChargeParams struct {
	Amount          domain.Money
	GatewayCustomer string // cus_xxx
	GatewayPM       string // pm_xxx
	IdempotencyKey  string // prevents double-charge on retries
	Description     string
}

// ChargeStatus is the normalised outcome of a charge across gateways.
type ChargeStatus string

const (
	ChargeSucceeded    ChargeStatus = "succeeded"
	ChargeFailed       ChargeStatus = "failed"
	ChargeRequiresAuth ChargeStatus = "requires_action" // 3DS/SCA needed
	ChargePending      ChargeStatus = "pending"
)

// ChargeResult is the normalised result of a charge attempt.
type ChargeResult struct {
	GatewayTxnRef string // pi_xxx
	Status        ChargeStatus
	FailureReason string
}

// SetupResult is returned after saving a card for off-session reuse.
type SetupResult struct {
	GatewayCustomer string // cus_xxx
	GatewayPM       string // pm_xxx
}

// PaymentGateway is the provider-agnostic contract used by the billing engine.
type PaymentGateway interface {
	// Name returns the provider identifier, e.g. "stripe".
	Name() string

	// CreateCustomer creates a customer in the gateway and returns its reference.
	CreateCustomer(ctx context.Context, creds Credentials, p CustomerParams) (string, error)

	// Charge performs an off-session recurring charge against a saved method.
	Charge(ctx context.Context, creds Credentials, p ChargeParams) (ChargeResult, error)

	// VerifyWebhook validates an inbound gateway webhook signature and returns
	// the parsed event type and raw payload.
	VerifyWebhook(payload []byte, signature, signingSecret string) (eventType string, data []byte, err error)
}
