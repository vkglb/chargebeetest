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
	URL    string   `json:"url"`
	Events []string `json:"events"`
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

	secret := "whsec_" + randomHex(24)
	ep, err := s.q.CreateWebhookEndpoint(r.Context(), sqlc.CreateWebhookEndpointParams{
		MerchantID:    merchantID(r),
		Mode:          mode(r),
		Url:           req.URL,
		SigningSecret: secret,
		Events:        req.Events,
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
