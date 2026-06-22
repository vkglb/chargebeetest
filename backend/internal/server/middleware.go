package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type ctxKey string

const (
	ctxMerchantID ctxKey = "merchant_id"
	ctxUserID     ctxKey = "user_id"
	ctxRole       ctxKey = "role"
)

// requireAuth validates the Bearer JWT and injects merchant/user identity into
// the request context. Every downstream handler is tenant-scoped via this id.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := s.tokens.Verify(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		ctx := context.WithValue(r.Context(), ctxMerchantID, claims.MerchantID)
		ctx = context.WithValue(ctx, ctxUserID, claims.UserID)
		ctx = context.WithValue(ctx, ctxRole, claims.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// merchantID extracts the authenticated merchant id from the request context.
func merchantID(r *http.Request) uuid.UUID {
	if v, ok := r.Context().Value(ctxMerchantID).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}
