package server

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

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
	if len(req.Events) == 0 {
		req.Events = []string{"*"}
	}

	secret := "whsec_" + randomHex(24)
	ep, err := s.q.CreateWebhookEndpoint(r.Context(), sqlc.CreateWebhookEndpointParams{
		MerchantID:    merchantID(r),
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
	eps, err := s.q.ListWebhookEndpoints(r.Context(), merchantID(r))
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

func (s *Server) handleListWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	deliveries, err := s.q.ListWebhookDeliveries(r.Context(), sqlc.ListWebhookDeliveriesParams{
		MerchantID: merchantID(r),
		Limit:      100,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list deliveries")
		return
	}
	writeJSON(w, http.StatusOK, deliveries)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
