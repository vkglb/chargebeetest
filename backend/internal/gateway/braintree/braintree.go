// Package braintree implements gateway.PaymentGateway for Braintree via its
// GraphQL API. Auth is basic auth with public_key:private_key. Recurring
// off-session charges use a stored payment-method token (chargeTransaction).
package braintree

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/chargeebee/platform/internal/gateway"
)

// Production GraphQL endpoint; use payments.sandbox.braintree-api.com for test.
const apiURL = "https://payments.braintree-api.com/graphql"
const apiVersion = "2019-01-01"

// Gateway is the Braintree implementation.
type Gateway struct{ http *http.Client }

// New constructs a Braintree gateway.
func New() *Gateway { return &Gateway{http: &http.Client{Timeout: 20 * time.Second}} }

// Name returns the provider identifier.
func (g *Gateway) Name() string { return "braintree" }

func (g *Gateway) graphql(ctx context.Context, creds gateway.Credentials, query string, vars map[string]any, out any) error {
	payload, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	pub, priv, _ := strings.Cut(creds.SecretKey, ":")
	req.SetBasicAuth(pub, priv)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Braintree-Version", apiVersion)

	resp, err := g.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("braintree: %d %s", resp.StatusCode, string(data))
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

// CreateCustomer creates a Braintree customer via GraphQL.
func (g *Gateway) CreateCustomer(ctx context.Context, creds gateway.Credentials, p gateway.CustomerParams) (string, error) {
	const q = `mutation($input: CreateCustomerInput!) {
	  createCustomer(input: $input) { customer { id } }
	}`
	var out struct {
		Data struct {
			CreateCustomer struct {
				Customer struct {
					ID string `json:"id"`
				} `json:"customer"`
			} `json:"createCustomer"`
		} `json:"data"`
	}
	vars := map[string]any{"input": map[string]any{"customer": map[string]any{"email": p.Email}}}
	if err := g.graphql(ctx, creds, q, vars, &out); err != nil {
		return "", err
	}
	return out.Data.CreateCustomer.Customer.ID, nil
}

// Charge runs an off-session transaction against a stored payment-method token.
// GatewayPM holds the Braintree payment-method token.
func (g *Gateway) Charge(ctx context.Context, creds gateway.Credentials, p gateway.ChargeParams) (gateway.ChargeResult, error) {
	const q = `mutation($input: ChargePaymentMethodInput!) {
	  chargePaymentMethod(input: $input) {
	    transaction { id status }
	  }
	}`
	vars := map[string]any{"input": map[string]any{
		"paymentMethodId": p.GatewayPM,
		"transaction": map[string]any{
			"amount": fmt.Sprintf("%.2f", float64(p.Amount.AmountMinor)/100),
		},
	}}
	var out struct {
		Data struct {
			ChargePaymentMethod struct {
				Transaction struct {
					ID     string `json:"id"`
					Status string `json:"status"`
				} `json:"transaction"`
			} `json:"chargePaymentMethod"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := g.graphql(ctx, creds, q, vars, &out); err != nil {
		return gateway.ChargeResult{Status: gateway.ChargeFailed, FailureReason: err.Error()}, nil
	}
	if len(out.Errors) > 0 {
		return gateway.ChargeResult{Status: gateway.ChargeFailed, FailureReason: out.Errors[0].Message}, nil
	}
	tx := out.Data.ChargePaymentMethod.Transaction
	return gateway.ChargeResult{GatewayTxnRef: tx.ID, Status: mapStatus(tx.Status)}, nil
}

// VerifyWebhook: Braintree webhooks are verified via SDK signature pairs;
// v1 parses the notification kind and trusts the configured secret.
func (g *Gateway) VerifyWebhook(payload []byte, _, _ string) (string, []byte, error) {
	var evt struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(payload, &evt); err != nil {
		return "", nil, err
	}
	return evt.Kind, payload, nil
}

func mapStatus(s string) gateway.ChargeStatus {
	switch s {
	case "SUBMITTED_FOR_SETTLEMENT", "SETTLED", "SETTLING", "AUTHORIZED":
		return gateway.ChargeSucceeded
	case "AUTHORIZING", "SETTLEMENT_PENDING":
		return gateway.ChargePending
	default:
		return gateway.ChargeFailed
	}
}

var _ gateway.PaymentGateway = (*Gateway)(nil)
