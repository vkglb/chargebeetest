package server

import (
	"net/http"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// handleListGateways returns the merchant's connected payment gateways. Secrets
// are never returned — only provider, account ref, and status.
func (s *Server) handleListGateways(w http.ResponseWriter, r *http.Request) {
	accounts, err := s.q.ListGatewayAccountsByMerchant(r.Context(), merchantID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list gateways")
		return
	}
	writeJSON(w, http.StatusOK, accounts)
}

type connectGatewayRequest struct {
	Provider   string `json:"provider"`    // "stripe"
	AccountRef string `json:"account_ref"` // e.g. acct_xxx (optional)
	SecretKey  string `json:"secret_key"`  // merchant's gateway secret / Connect token
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

	account, err := s.q.UpsertGatewayAccount(r.Context(), sqlc.UpsertGatewayAccountParams{
		MerchantID:           merchantID(r),
		Provider:             req.Provider,
		AccountRef:           pgText(req.AccountRef),
		EncryptedCredentials: []byte(req.SecretKey),
	})
	if err != nil {
		s.logger.Error("connect gateway", "error", err)
		writeError(w, http.StatusInternalServerError, "could not connect gateway")
		return
	}
	writeJSON(w, http.StatusOK, account)
}
