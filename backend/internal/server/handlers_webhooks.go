package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createWebhookRequest struct {
	URL         string   `json:"url"`
	Events      []string `json:"events"`
	Secret      string   `json:"secret"`       // optional; auto-generated when blank
	ContentType string   `json:"content_type"` // application/json | application/x-www-form-urlencoded
	VerifySSL   *bool    `json:"verify_ssl"`   // optional; defaults to true
}

// allowedContentTypes are the payload encodings a merchant may pick, mirroring
// the options on GitHub's webhook form.
var allowedContentTypes = map[string]bool{
	"application/json":                  true,
	"application/x-www-form-urlencoded": true,
}

func (s *Server) handleCreateWebhook(w http.ResponseWriter, r *http.Request) {
	var req createWebhookRequest
	if err := decodeJSON(r, &req); err != nil || req.URL == "" {
		writeError(w, http.StatusBadRequest, "url required")
		return
	}
	req.URL = strings.TrimSpace(req.URL)
	if len(req.Events) == 0 {
		req.Events = []string{"*"}
	}

	// Content type: default to JSON; reject anything unsupported.
	req.ContentType = strings.TrimSpace(req.ContentType)
	if req.ContentType == "" {
		req.ContentType = "application/json"
	}
	if !allowedContentTypes[req.ContentType] {
		writeError(w, http.StatusBadRequest, "content_type must be application/json or application/x-www-form-urlencoded")
		return
	}

	// SSL verification defaults on; a merchant may disable it for endpoints with
	// self-signed certs (not recommended).
	verifySSL := true
	if req.VerifySSL != nil {
		verifySSL = *req.VerifySSL
	}

	// Reject a URL that's already registered for this merchant + mode.
	existing, err := s.q.ListWebhookEndpoints(r.Context(), sqlc.ListWebhookEndpointsParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check existing webhooks")
		return
	}
	for _, ep := range existing {
		if strings.EqualFold(strings.TrimSpace(ep.Url), req.URL) {
			writeError(w, http.StatusConflict, "this URL is already added as a webhook")
			return
		}
	}

	// Use the merchant's own secret when supplied (like GitHub), otherwise mint
	// one. The secret keys the HMAC-SHA256 signature on every delivery.
	secret := strings.TrimSpace(req.Secret)
	if secret == "" {
		secret = "whsec_" + randomHex(24)
	}
	ep, err := s.q.CreateWebhookEndpoint(r.Context(), sqlc.CreateWebhookEndpointParams{
		MerchantID:    merchantID(r),
		Mode:          mode(r),
		Url:           req.URL,
		SigningSecret: secret,
		Events:        req.Events,
		ContentType:   req.ContentType,
		VerifySsl:     verifySSL,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create webhook endpoint")
		return
	}
	writeJSON(w, http.StatusCreated, ep)
}

func (s *Server) handleListWebhooks(w http.ResponseWriter, r *http.Request) {
	eps, err := s.q.ListWebhookEndpoints(r.Context(), sqlc.ListWebhookEndpointsParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list webhook endpoints")
		return
	}
	writeJSON(w, http.StatusOK, eps)
}

func (s *Server) handleDeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.q.DeleteWebhookEndpoint(r.Context(), sqlc.DeleteWebhookEndpointParams{
		ID:         id,
		MerchantID: merchantID(r),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete endpoint")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deliveryResponse exposes the stored payload as raw JSON (the sqlc []byte would
// otherwise marshal to base64).
type deliveryResponse struct {
	ID         uuid.UUID       `json:"id"`
	EndpointID uuid.UUID       `json:"endpoint_id"`
	EventType  string          `json:"event_type"`
	Status     string          `json:"status"`
	Attempts   int32           `json:"attempts"`
	Payload    json.RawMessage `json:"payload"`
	CreatedAt  time.Time       `json:"created_at"`
}

func (s *Server) handleListWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	deliveries, err := s.q.ListWebhookDeliveries(r.Context(), sqlc.ListWebhookDeliveriesParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Limit:      100,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list deliveries")
		return
	}
	out := make([]deliveryResponse, 0, len(deliveries))
	for _, d := range deliveries {
		out = append(out, deliveryResponse{
			ID: d.ID, EndpointID: d.EndpointID, EventType: d.EventType,
			Status: d.Status, Attempts: d.Attempts, Payload: json.RawMessage(d.Payload), CreatedAt: d.CreatedAt.Time,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// handleResendWebhook re-delivers a past webhook delivery to its endpoint.
func (s *Server) handleResendWebhook(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.resender.Resend(r.Context(), merchantID(r), id); err != nil {
		writeError(w, http.StatusNotFound, "delivery not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "resent", "id": id})
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
