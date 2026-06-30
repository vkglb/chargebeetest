package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// handleListGateways returns the merchant's connected payment gateways. Secrets
// are never returned — only provider, account ref, and status.
func (s *Server) handleListGateways(w http.ResponseWriter, r *http.Request) {
	accounts, err := s.q.ListGatewayAccountsByMerchant(r.Context(), sqlc.ListGatewayAccountsByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list gateways")
		return
	}
	writeJSON(w, http.StatusOK, accounts)
}

type connectGatewayRequest struct {
	Provider       string `json:"provider"`        // "stripe"
	AccountRef     string `json:"account_ref"`     // e.g. acct_xxx (optional)
	SecretKey      string `json:"secret_key"`      // merchant's gateway secret / Connect token
	PublishableKey string `json:"publishable_key"` // client-side key (Stripe pk_*), optional
}

// handleConnectGateway stores (or updates) a merchant's gateway credentials.
//
// NOTE: In production this should be the Stripe Connect OAuth callback, and the
// secret must be encrypted with a KMS key before storage. For v1 the secret is
// stored in encrypted_credentials as-is (dev PlaintextResolver reads it back).
func (s *Server) handleConnectGateway(w http.ResponseWriter, r *http.Request) {
	var req connectGatewayRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Provider == "" {
		req.Provider = "stripe"
	}
	if req.SecretKey == "" {
		writeError(w, http.StatusBadRequest, "secret_key required")
		return
	}

	// Encrypt the secret at rest (publishable key is client-side, stored as-is).
	encSecret, err := s.enc.Encrypt(req.SecretKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not secure credentials")
		return
	}

	account, err := s.q.UpsertGatewayAccount(r.Context(), sqlc.UpsertGatewayAccountParams{
		MerchantID:           merchantID(r),
		Mode:                 mode(r),
		Provider:             req.Provider,
		AccountRef:           pgText(req.AccountRef),
		EncryptedCredentials: encSecret,
		PublishableKey:       req.PublishableKey,
	})
	if err != nil {
		s.logger.Error("connect gateway", "error", err)
		writeError(w, http.StatusInternalServerError, "could not connect gateway")
		return
	}
	writeJSON(w, http.StatusOK, account)
}

// handleDisconnectGateway removes a merchant's stored credentials for a provider
// in the current mode. Test and Live disconnections are independent.
func (s *Server) handleDisconnectGateway(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if provider == "" {
		writeError(w, http.StatusBadRequest, "provider required")
		return
	}
	n, err := s.q.DeleteGatewayAccount(r.Context(), sqlc.DeleteGatewayAccountParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Provider:   provider,
	})
	if err != nil {
		s.logger.Error("disconnect gateway", "error", err)
		writeError(w, http.StatusInternalServerError, "could not disconnect gateway")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "gateway not connected")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "disconnected", "provider": provider})
}
