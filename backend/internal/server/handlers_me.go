package server

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/twofa"
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

// handle2FASetup starts TOTP enrollment: it mints a fresh secret, stores it as
// pending (not yet enabled), and returns the secret plus an otpauth:// URL the
// dashboard renders as a QR code for the user's authenticator app.
func (s *Server) handle2FASetup(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)
	secret, err := twofa.GenerateSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate secret")
		return
	}
	if err := s.q.SetTwoFactorSecret(r.Context(), sqlc.SetTwoFactorSecretParams{
		UserID:          uid,
		TwoFactorSecret: secret,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start 2fa setup")
		return
	}

	account := uid.String()
	if user, err := s.q.GetMerchantUserByID(r.Context(), uid); err == nil {
		account = user.Email
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"secret":      secret,
		"otpauth_url": twofa.OTPAuthURL(secret, account, "Chargeebee Billing"),
	})
}

type twoFACodeRequest struct {
	Code string `json:"code"`
}

// handle2FAEnable confirms enrollment: it verifies a code against the pending
// secret and, on success, turns 2FA on.
func (s *Server) handle2FAEnable(w http.ResponseWriter, r *http.Request) {
	var req twoFACodeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	meta, err := s.q.GetUserMetadata(r.Context(), userID(r))
	if err != nil || meta.TwoFactorSecret == "" {
		writeError(w, http.StatusBadRequest, "start 2fa setup first")
		return
	}
	if !twofa.Validate(meta.TwoFactorSecret, req.Code) {
		writeError(w, http.StatusBadRequest, "that code is not valid — check your authenticator app")
		return
	}
	if err := s.q.EnableTwoFactor(r.Context(), userID(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not enable 2fa")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true})
}

// handle2FAVerify checks a login-time code against the user's enabled secret.
func (s *Server) handle2FAVerify(w http.ResponseWriter, r *http.Request) {
	var req twoFACodeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	meta, err := s.q.GetUserMetadata(r.Context(), userID(r))
	if err != nil || !meta.TwoFactorEnabled || meta.TwoFactorSecret == "" {
		writeError(w, http.StatusBadRequest, "2fa is not enabled")
		return
	}
	if !twofa.Validate(meta.TwoFactorSecret, req.Code) {
		writeError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"verified": true})
}

// handle2FADisable turns 2FA off and clears the stored secret.
func (s *Server) handle2FADisable(w http.ResponseWriter, r *http.Request) {
	if err := s.q.DisableTwoFactor(r.Context(), userID(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not disable 2fa")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
