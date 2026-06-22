package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/chargeebee/platform/internal/auth"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type signupRequest struct {
	MerchantName string `json:"merchant_name"`
	Email        string `json:"email"`
	Password     string `json:"password"`
}

type authResponse struct {
	Token      string `json:"token"`
	MerchantID string `json:"merchant_id"`
	UserID     string `json:"user_id"`
}

// handleSignup creates a merchant, its first admin user, and returns a JWT.
func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantName == "" || req.Email == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "merchant_name, email and password (min 8 chars) required")
		return
	}

	ctx := r.Context()
	merchant, err := s.q.CreateMerchant(ctx, req.MerchantName)
	if err != nil {
		s.logger.Error("signup: create merchant", "error", err)
		writeError(w, http.StatusInternalServerError, "could not create merchant")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}

	user, err := s.q.CreateMerchantUser(ctx, sqlc.CreateMerchantUserParams{
		MerchantID:   merchant.ID,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         "admin",
	})
	if err != nil {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}

	token, err := s.tokens.Issue(merchant.ID, user.ID, user.Role, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{
		Token:      token,
		MerchantID: merchant.ID.String(),
		UserID:     user.ID.String(),
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// handleLogin authenticates a merchant user and returns a JWT.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := s.q.GetMerchantUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := s.tokens.Issue(user.MerchantID, user.ID, user.Role, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{
		Token:      token,
		MerchantID: user.MerchantID.String(),
		UserID:     user.ID.String(),
	})
}
