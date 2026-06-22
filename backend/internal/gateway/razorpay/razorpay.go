// Package razorpay implements gateway.PaymentGateway for Razorpay using its
// REST API (basic auth with key_id:key_secret). Recurring off-session charges
// use Razorpay's recurring payments endpoint with a saved token.
package razorpay

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

const apiBase = "https://api.razorpay.com/v1"

// Gateway is the Razorpay implementation.
type Gateway struct{ http *http.Client }

// New constructs a Razorpay gateway.
func New() *Gateway { return &Gateway{http: &http.Client{Timeout: 20 * time.Second}} }

// Name returns the provider identifier.
func (g *Gateway) Name() string { return "razorpay" }

// credentials are "key_id:key_secret" stored as the merchant's secret.
func splitKey(secret string) (keyID, keySecret string) {
	if i := strings.IndexByte(secret, ':'); i >= 0 {
		return secret[:i], secret[i+1:]
	}
	return secret, ""
}

func (g *Gateway) do(ctx context.Context, creds gateway.Credentials, method, path string, body any, out any) error {
	var buf io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, apiBase+path, buf)
	if err != nil {
		return err
	}
	keyID, keySecret := splitKey(creds.SecretKey)
	req.SetBasicAuth(keyID, keySecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("razorpay %s %s: %d %s", method, path, resp.StatusCode, string(data))
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

// CreateCustomer creates a Razorpay customer.
func (g *Gateway) CreateCustomer(ctx context.Context, creds gateway.Credentials, p gateway.CustomerParams) (string, error) {
	var out struct {
		ID string `json:"id"`
	}
	err := g.do(ctx, creds, http.MethodPost, "/customers", map[string]any{
		"name":          p.Name,
		"email":         p.Email,
		"fail_existing": "0",
	}, &out)
	if err != nil {
		return "", err
	}
	return out.ID, nil
}

// Charge performs a recurring (off-session) charge against a saved token.
// GatewayPM holds the Razorpay token id (token_xxx).
func (g *Gateway) Charge(ctx context.Context, creds gateway.Credentials, p gateway.ChargeParams) (gateway.ChargeResult, error) {
	var out struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Error  struct {
			Description string `json:"description"`
		} `json:"error"`
	}
	body := map[string]any{
		"amount":      p.Amount.AmountMinor,
		"currency":    strings.ToUpper(p.Amount.Currency),
		"customer_id": p.GatewayCustomer,
		"token":       p.GatewayPM,
		"recurring":   "1",
		"description": p.Description,
	}
	err := g.do(ctx, creds, http.MethodPost, "/payments/create/recurring", body, &out)
	if err != nil {
		return gateway.ChargeResult{Status: gateway.ChargeFailed, FailureReason: err.Error()}, nil
	}
	return gateway.ChargeResult{GatewayTxnRef: out.ID, Status: mapStatus(out.Status)}, nil
}

// VerifyWebhook validates a Razorpay webhook signature (HMAC-SHA256 of the body
// with the endpoint secret). Returns the event type.
func (g *Gateway) VerifyWebhook(payload []byte, signature, signingSecret string) (string, []byte, error) {
	if !verifyHMAC(payload, signature, signingSecret) {
		return "", nil, fmt.Errorf("razorpay: invalid webhook signature")
	}
	var evt struct {
		Event string `json:"event"`
	}
	if err := json.Unmarshal(payload, &evt); err != nil {
		return "", nil, err
	}
	return evt.Event, payload, nil
}

func mapStatus(s string) gateway.ChargeStatus {
	switch s {
	case "captured", "authorized":
		return gateway.ChargeSucceeded
	case "created", "pending":
		return gateway.ChargePending
	default:
		return gateway.ChargeFailed
	}
}

var _ gateway.PaymentGateway = (*Gateway)(nil)
