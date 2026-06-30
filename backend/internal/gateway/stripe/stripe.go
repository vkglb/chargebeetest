// Package stripe implements the gateway.PaymentGateway interface using Stripe.
//
// Multi-tenancy: each merchant connects their own Stripe account via Connect
// (OAuth, "standard" accounts). The OAuth access token acts as that merchant's
// secret key, so we instantiate a Stripe client per request with the merchant's
// resolved credentials — exactly how Chargebee calls Stripe "as the merchant".
package stripe

import (
	"context"
	"errors"
	"strings"

	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/client"
	"github.com/stripe/stripe-go/v82/webhook"

	"github.com/chargeebee/platform/internal/gateway"
)

// Gateway is the Stripe implementation of gateway.PaymentGateway.
type Gateway struct{}

// New constructs a Stripe gateway.
func New() *Gateway { return &Gateway{} }

// Name returns the provider identifier.
func (g *Gateway) Name() string { return "stripe" }

// clientFor builds a Stripe API client authenticated as the given merchant.
func (g *Gateway) clientFor(creds gateway.Credentials) *client.API {
	sc := &client.API{}
	sc.Init(creds.SecretKey, nil)
	return sc
}

// CreateCustomer creates a Stripe Customer in the merchant's account.
func (g *Gateway) CreateCustomer(ctx context.Context, creds gateway.Credentials, p gateway.CustomerParams) (string, error) {
	sc := g.clientFor(creds)
	params := &stripe.CustomerParams{
		Email: stripe.String(p.Email),
		Name:  stripe.String(p.Name),
	}
	params.Context = ctx
	cust, err := sc.Customers.New(params)
	if err != nil {
		return "", err
	}
	return cust.ID, nil
}

// Charge performs an off-session, merchant-initiated recurring charge. This is
// the exact call Chargebee makes each billing cycle: PaymentIntent with
// off_session + confirm against the saved payment method.
func (g *Gateway) Charge(ctx context.Context, creds gateway.Credentials, p gateway.ChargeParams) (gateway.ChargeResult, error) {
	sc := g.clientFor(creds)

	params := &stripe.PaymentIntentParams{
		Amount:        stripe.Int64(p.Amount.AmountMinor),
		Currency:      stripe.String(strings.ToLower(p.Amount.Currency)),
		Customer:      stripe.String(p.GatewayCustomer),
		PaymentMethod: stripe.String(p.GatewayPM),
		OffSession:    stripe.Bool(true),
		Confirm:       stripe.Bool(true),
	}
	if p.Description != "" {
		params.Description = stripe.String(p.Description)
	}
	params.Context = ctx
	if p.IdempotencyKey != "" {
		params.SetIdempotencyKey(p.IdempotencyKey)
	}

	pi, err := sc.PaymentIntents.New(params)
	if err != nil {
		// Off-session charges that require authentication surface as a Stripe
		// error (e.g. authentication_required) rather than a returned object.
		var se *stripe.Error
		if errors.As(err, &se) {
			res := gateway.ChargeResult{
				Status:        gateway.ChargeFailed,
				FailureReason: string(se.Code),
			}
			if se.PaymentIntent != nil {
				res.GatewayTxnRef = se.PaymentIntent.ID
			}
			if se.Code == stripe.ErrorCodeAuthenticationRequired {
				res.Status = gateway.ChargeRequiresAuth
			}
			return res, nil
		}
		return gateway.ChargeResult{}, err
	}

	return gateway.ChargeResult{
		GatewayTxnRef: pi.ID,
		Status:        mapStatus(pi.Status),
	}, nil
}

// CreateSetupIntent starts an off-session card-vaulting flow: it returns a
// SetupIntent client secret the hosted checkout confirms client-side with the
// card. usage=off_session means the saved card can later be charged by the
// merchant without the customer present — exactly what recurring billing +
// dunning need. SCA, if required, is handled during this confirmation.
func (g *Gateway) CreateSetupIntent(ctx context.Context, creds gateway.Credentials, gatewayCustomer string) (string, error) {
	sc := g.clientFor(creds)
	params := &stripe.SetupIntentParams{
		Customer:           stripe.String(gatewayCustomer),
		Usage:              stripe.String("off_session"),
		PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
	}
	params.Context = ctx
	si, err := sc.SetupIntents.New(params)
	if err != nil {
		return "", err
	}
	return si.ClientSecret, nil
}

// VerifyWebhook validates a Stripe webhook signature and returns the event type.
func (g *Gateway) VerifyWebhook(payload []byte, signature, signingSecret string) (string, []byte, error) {
	event, err := webhook.ConstructEvent(payload, signature, signingSecret)
	if err != nil {
		return "", nil, err
	}
	return string(event.Type), event.Data.Raw, nil
}

func mapStatus(s stripe.PaymentIntentStatus) gateway.ChargeStatus {
	switch s {
	case stripe.PaymentIntentStatusSucceeded:
		return gateway.ChargeSucceeded
	case stripe.PaymentIntentStatusRequiresAction, stripe.PaymentIntentStatusRequiresConfirmation:
		return gateway.ChargeRequiresAuth
	case stripe.PaymentIntentStatusProcessing:
		return gateway.ChargePending
	default:
		return gateway.ChargeFailed
	}
}

// Ensure Gateway satisfies the interfaces.
var (
	_ gateway.PaymentGateway = (*Gateway)(nil)
	_ gateway.CardVaulting   = (*Gateway)(nil)
)
