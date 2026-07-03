package server

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// meResponse is the authenticated dashboard user's onboarding state. It backs
// the product tour so "show once" survives a cleared browser localStorage.
type meResponse struct {
	UserID           string `json:"user_id"`
	MerchantID       string `json:"merchant_id"`
	TourCompleted    bool   `json:"tour_completed"`
	TwoFactorEnabled bool   `json:"two_factor_enabled"`
}

// handleGetMe returns the current user plus onboarding flags (e.g. whether the
// product tour has been completed). Persisting this server-side means clearing
// localStorage no longer restarts the tour on next login.
func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)
	resp := meResponse{
		UserID:     uid.String(),
		MerchantID: merchantID(r).String(),
	}

	meta, err := s.q.GetUserMetadata(r.Context(), uid)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "could not load user metadata")
		return
	}
	// No row yet (or a row with a null timestamp) means the tour is unseen.
	resp.TourCompleted = err == nil && meta.TourCompletedAt != nil
	resp.TwoFactorEnabled = err == nil && meta.TwoFactorEnabled

	writeJSON(w, http.StatusOK, resp)
}

// handleCompleteTour records that the user has finished (or dismissed) the
// product tour, so it does not auto-open again on their next login.
func (s *Server) handleCompleteTour(w http.ResponseWriter, r *http.Request) {
	if err := s.q.MarkTourCompleted(r.Context(), userID(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save tour state")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type update2FARequest struct {
	Enabled bool `json:"enabled"`
}

// handleUpdate2FA sets whether Two-Factor Authentication is enabled for the user.
func (s *Server) handleUpdate2FA(w http.ResponseWriter, r *http.Request) {
	var req update2FARequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.q.UpdateTwoFactor(r.Context(), sqlc.UpdateTwoFactorParams{
		UserID:           userID(r),
		TwoFactorEnabled: req.Enabled,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save 2fa state")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
