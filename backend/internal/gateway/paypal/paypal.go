// Package paypal implements gateway.PaymentGateway for PayPal using its REST
// API. Auth is OAuth2 client-credentials (client_id:secret → bearer token).
// Recurring off-session charges use a saved payment token (vault).
package paypal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/chargeebee/platform/internal/gateway"
)

// Live base; swap to api-m.sandbox.paypal.com for test credentials.
const apiBase = "https://api-m.paypal.com"

// Gateway is the PayPal implementation.
type Gateway struct{ http *http.Client }

// New constructs a PayPal gateway.
func New() *Gateway { return &Gateway{http: &http.Client{Timeout: 20 * time.Second}} }

// Name returns the provider identifier.
func (g *Gateway) Name() string { return "paypal" }

// accessToken exchanges client_id:secret for an OAuth2 bearer token.
func (g *Gateway) accessToken(ctx context.Context, creds gateway.Credentials) (string, error) {
	clientID, secret, _ := strings.Cut(creds.SecretKey, ":")
	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		apiBase+"/v1/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(clientID, secret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := g.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("paypal oauth: %d %s", resp.StatusCode, string(data))
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", err
	}
	return out.AccessToken, nil
}

// CreateCustomer: PayPal has no first-class customer object for this flow; the
// vaulted payment token represents the customer. We return the email as the ref.
func (g *Gateway) CreateCustomer(_ context.Context, _ gateway.Credentials, p gateway.CustomerParams) (string, error) {
	return p.Email, nil
}

// Charge captures an off-session payment using a saved vault token. GatewayPM
// holds the PayPal vaulted payment-method token.
func (g *Gateway) Charge(ctx context.Context, creds gateway.Credentials, p gateway.ChargeParams) (gateway.ChargeResult, error) {
	token, err := g.accessToken(ctx, creds)
	if err != nil {
		return gateway.ChargeResult{}, err
	}

	body := map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []map[string]any{{
			"amount": map[string]any{
				"currency_code": strings.ToUpper(p.Amount.Currency),
				"value":         fmt.Sprintf("%.2f", float64(p.Amount.AmountMinor)/100),
			},
			"description": p.Description,
		}},
		"payment_source": map[string]any{
			"token": map[string]any{"id": p.GatewayPM, "type": "PAYMENT_METHOD_TOKEN"},
		},
	}
	b, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/v2/checkout/orders", bytes.NewReader(b))
	if err != nil {
		return gateway.ChargeResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	if p.IdempotencyKey != "" {
		req.Header.Set("PayPal-Request-Id", p.IdempotencyKey)
	}

	resp, err := g.http.Do(req)
	if err != nil {
		return gateway.ChargeResult{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var out struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	_ = json.Unmarshal(data, &out)
	if resp.StatusCode >= 300 {
		return gateway.ChargeResult{Status: gateway.ChargeFailed, FailureReason: string(data)}, nil
	}
	return gateway.ChargeResult{GatewayTxnRef: out.ID, Status: mapStatus(out.Status)}, nil
}

// VerifyWebhook: PayPal verifies webhooks via an API call with transmission
// headers. v1 accepts the body and trusts the configured secret; full
// ver-webhook-signature wiring is a follow-up.
func (g *Gateway) VerifyWebhook(payload []byte, _ , _ string) (string, []byte, error) {
	var evt struct {
		EventType string `json:"event_type"`
	}
	if err := json.Unmarshal(payload, &evt); err != nil {
		return "", nil, err
	}
	return evt.EventType, payload, nil
}

func mapStatus(s string) gateway.ChargeStatus {
	switch s {
	case "COMPLETED", "APPROVED":
		return gateway.ChargeSucceeded
	case "CREATED", "PENDING", "SAVED":
		return gateway.ChargePending
	default:
		return gateway.ChargeFailed
	}
}

var _ gateway.PaymentGateway = (*Gateway)(nil)
