package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/auth"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createAPIKeyRequest struct {
	Env string `json:"env"` // "live" | "test"
}

// handleCreateAPIKey generates a key, stores only its hash, and returns the
// plaintext exactly once (like Stripe/Chargebee).
func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var req createAPIKeyRequest
	_ = decodeJSON(r, &req)
	if req.Env != "live" && req.Env != "test" {
		req.Env = "test"
	}

	key, err := auth.GenerateAPIKey(req.Env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate key")
		return
	}

	rec, err := s.q.CreateAPIKey(r.Context(), sqlc.CreateAPIKeyParams{
		MerchantID: merchantID(r),
		Prefix:     key.Prefix,
		KeyHash:    key.Hash,
		Scopes:     []string{"read", "write"},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store key")
		return
	}

	// Return the plaintext ONCE alongside the stored record metadata.
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         rec.ID,
		"prefix":     rec.Prefix,
		"secret":     key.Plaintext, // shown once — never retrievable again
		"scopes":     rec.Scopes,
		"created_at": rec.CreatedAt,
	})
}

func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := s.q.ListAPIKeysByMerchant(r.Context(), merchantID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list keys")
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

func (s *Server) handleRevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.q.RevokeAPIKey(r.Context(), sqlc.RevokeAPIKeyParams{
		ID:         id,
		MerchantID: merchantID(r),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not revoke key")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
