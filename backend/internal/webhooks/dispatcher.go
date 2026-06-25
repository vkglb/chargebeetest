// Package webhooks delivers signed outbound events to merchants' endpoints and
// records every delivery attempt in the database.
package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// Event is the envelope POSTed to subscriber endpoints.
type Event struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Mode      string `json:"mode"`
	CreatedAt string `json:"created_at"`
	Data      any    `json:"data"`
}

// Dispatcher fans an event out to all matching endpoints for a merchant+mode.
type Dispatcher struct {
	q      *sqlc.Queries
	http   *http.Client
	logger *slog.Logger
}

// New constructs a Dispatcher.
func New(q *sqlc.Queries, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{
		q:      q,
		http:   &http.Client{Timeout: 15 * time.Second},
		logger: logger,
	}
}

// Emit delivers an event asynchronously: it never blocks the caller and never
// fails the originating request. Matching endpoints are those that are enabled
// and subscribed to the event type (or "*").
func (d *Dispatcher) Emit(merchantID uuid.UUID, mode, eventType string, data any) {
	go d.deliver(merchantID, mode, eventType, data)
}

// Resend re-delivers a past delivery's stored payload to its endpoint and
// records a new delivery row, so the resend shows up in the log. It runs
// synchronously and returns an error if the delivery or endpoint is missing.
func (d *Dispatcher) Resend(ctx context.Context, merchantID uuid.UUID, deliveryID uuid.UUID) error {
	prev, err := d.q.GetWebhookDelivery(ctx, sqlc.GetWebhookDeliveryParams{ID: deliveryID, MerchantID: merchantID})
	if err != nil {
		return err
	}
	ep, err := d.q.GetWebhookEndpoint(ctx, sqlc.GetWebhookEndpointParams{ID: prev.EndpointID, MerchantID: merchantID})
	if err != nil {
		return err
	}
	// Reuse the original envelope body so the stored signature still verifies.
	event := Event{ID: "evt_" + uuid.NewString(), Type: prev.EventType}
	d.send(ctx, ep, event, prev.Payload)
	return nil
}

func (d *Dispatcher) deliver(merchantID uuid.UUID, mode, eventType string, data any) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	endpoints, err := d.q.ListEnabledWebhookEndpoints(ctx, sqlc.ListEnabledWebhookEndpointsParams{
		MerchantID: merchantID,
		Mode:       mode,
	})
	if err != nil {
		d.logger.Error("webhook: list endpoints", "error", err)
		return
	}

	event := Event{
		ID:        "evt_" + uuid.NewString(),
		Type:      eventType,
		Mode:      mode,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}
	body, err := json.Marshal(event)
	if err != nil {
		d.logger.Error("webhook: marshal event", "error", err)
		return
	}

	for _, ep := range endpoints {
		if !subscribes(ep.Events, eventType) {
			continue
		}
		d.send(ctx, ep, event, body)
	}
}

// send creates a delivery record, attempts the POST with retries, and records
// the final outcome (status + attempt count).
func (d *Dispatcher) send(ctx context.Context, ep sqlc.WebhookEndpoint, event Event, body []byte) {
	delivery, err := d.q.CreateWebhookDelivery(ctx, sqlc.CreateWebhookDeliveryParams{
		MerchantID: ep.MerchantID,
		Mode:       ep.Mode,
		EndpointID: ep.ID,
		EventType:  event.Type,
		Payload:    body,
		Status:     "pending",
		Attempts:   0,
	})
	if err != nil {
		d.logger.Error("webhook: create delivery", "error", err)
		return
	}

	signature := sign(body, ep.SigningSecret)
	const maxAttempts = 3
	var used int32
	delivered := false

	for used = 1; used <= maxAttempts; used++ {
		if d.post(ctx, ep.Url, body, event, signature) {
			delivered = true
			break
		}
		if used < maxAttempts {
			time.Sleep(time.Duration(used) * time.Second) // simple backoff
		}
	}
	if used > maxAttempts {
		used = maxAttempts
	}

	status := "failed"
	if delivered {
		status = "delivered"
	}
	if _, err := d.q.UpdateWebhookDeliveryResult(ctx, sqlc.UpdateWebhookDeliveryResultParams{
		ID:       delivery.ID,
		Status:   status,
		Attempts: used,
	}); err != nil {
		d.logger.Error("webhook: update delivery", "error", err)
	}
	d.logger.Info("webhook delivered",
		"endpoint", ep.Url, "event", event.Type, "status", status, "attempts", used)
}

func (d *Dispatcher) post(ctx context.Context, url string, body []byte, event Event, signature string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Id", event.ID)
	req.Header.Set("X-Webhook-Event", event.Type)
	req.Header.Set("X-Webhook-Signature", signature)

	resp, err := d.http.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

// sign returns the HMAC-SHA256 hex signature of body using the endpoint secret.
func sign(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// subscribes reports whether the endpoint's event list covers eventType.
func subscribes(events []string, eventType string) bool {
	for _, e := range events {
		if e == "*" || e == eventType {
			return true
		}
	}
	return false
}
