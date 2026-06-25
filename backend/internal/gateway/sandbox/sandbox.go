// Package sandbox is a built-in simulator gateway. It implements the
// PaymentGateway interface without talking to any external provider, so the
// billing engine and scheduler can be exercised end-to-end in Test mode without
// real cards or credentials.
//
// Charges succeed by default. To simulate a failure (to watch dunning), use a
// saved payment method whose gateway ref is "pm_fail" — the charge then returns
// a declined result.
package sandbox

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/gateway"
)

// Gateway is the simulator implementation of gateway.PaymentGateway.
type Gateway struct{}

// New constructs a sandbox gateway.
func New() *Gateway { return &Gateway{} }

// Name returns the provider identifier.
func (g *Gateway) Name() string { return "sandbox" }

// CreateCustomer returns a fake but stable-looking customer reference.
func (g *Gateway) CreateCustomer(_ context.Context, _ gateway.Credentials, _ gateway.CustomerParams) (string, error) {
	return "cus_sbx_" + uuid.NewString()[:12], nil
}

// Charge simulates an off-session charge. It always succeeds unless the saved
// payment method ref signals a forced failure ("pm_fail" / contains "fail").
func (g *Gateway) Charge(_ context.Context, _ gateway.Credentials, p gateway.ChargeParams) (gateway.ChargeResult, error) {
	if strings.Contains(strings.ToLower(p.GatewayPM), "fail") {
		return gateway.ChargeResult{
			GatewayTxnRef: "pi_sbx_" + uuid.NewString()[:12],
			Status:        gateway.ChargeFailed,
			FailureReason: "card_declined",
		}, nil
	}
	return gateway.ChargeResult{
		GatewayTxnRef: "pi_sbx_" + uuid.NewString()[:12],
		Status:        gateway.ChargeSucceeded,
	}, nil
}

// VerifyWebhook is a no-op for the simulator (it never sends inbound webhooks).
func (g *Gateway) VerifyWebhook(payload []byte, _ string, _ string) (string, []byte, error) {
	return "sandbox.event", payload, nil
}

// Ensure Gateway satisfies the interface.
var _ gateway.PaymentGateway = (*Gateway)(nil)
