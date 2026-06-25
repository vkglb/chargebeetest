package server

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/chargeebee/platform/internal/auth"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// Subdomains: 3–40 chars, lowercase letters/digits/hyphens, not at the edges.
var subdomainRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`)

func validSubdomain(s string) bool {
	return subdomainRe.MatchString(s)
}

type signupRequest struct {
	Subdomain string `json:"subdomain"`
	OwnerName string `json:"owner_name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
}

type authResponse struct {
	Token      string `json:"token"`
	MerchantID string `json:"merchant_id"`
	UserID     string `json:"user_id"`
}

// handleCheckSubdomain reports whether a subdomain is valid and unused, for the
// live availability check on the signup form.
func (s *Server) handleCheckSubdomain(w http.ResponseWriter, r *http.Request) {
	sub := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("subdomain")))
	if !validSubdomain(sub) {
		writeJSON(w, http.StatusOK, map[string]any{"subdomain": sub, "available": false, "reason": "invalid"})
		return
	}
	n, err := s.q.CountMerchantsBySubdomain(r.Context(), sub)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check subdomain")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subdomain": sub, "available": n == 0})
}

// handleSignup creates a merchant, its first admin user, and returns a JWT.
func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Subdomain = strings.ToLower(strings.TrimSpace(req.Subdomain))
	req.OwnerName = strings.TrimSpace(req.OwnerName)
	if req.Email == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "email and password (min 8 chars) required")
		return
	}
	if !validSubdomain(req.Subdomain) {
		writeError(w, http.StatusBadRequest, "subdomain must be 3–40 chars: lowercase letters, digits, hyphens")
		return
	}
	if req.OwnerName == "" {
		writeError(w, http.StatusBadRequest, "owner_name required")
		return
	}

	ctx := r.Context()
	taken, err := s.q.CountMerchantsBySubdomain(ctx, req.Subdomain)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not validate subdomain")
		return
	}
	if taken > 0 {
		writeError(w, http.StatusConflict, "that subdomain is already taken")
		return
	}

	merchant, err := s.q.CreateMerchant(ctx, sqlc.CreateMerchantParams{
		Name:      req.Subdomain,
		Subdomain: req.Subdomain,
		OwnerName: req.OwnerName,
	})
	if err != nil {
		s.logger.Error("signup: create merchant", "error", err)
		writeError(w, http.StatusConflict, "could not create merchant (subdomain may be taken)")
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
