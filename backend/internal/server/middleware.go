package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/chargeebee/platform/internal/auth"
)

type ctxKey string

const (
	ctxMerchantID ctxKey = "merchant_id"
	ctxUserID     ctxKey = "user_id"
	ctxRole       ctxKey = "role"
	ctxMode       ctxKey = "mode"
)

// normalizeMode returns "test" or "live" (defaulting to "test").
func normalizeMode(s string) string {
	if s == "live" {
		return "live"
	}
	return "test"
}

// modeFromRequest reads the X-Mode header (dashboard toggle), defaulting to test.
func modeFromRequest(r *http.Request) string {
	return normalizeMode(r.Header.Get("X-Mode"))
}

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
		ctx = context.WithValue(ctx, ctxMode, modeFromRequest(r))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// cors applies permissive-but-configurable CORS so the dashboard static site
// (a different origin in production) can call the API from the browser.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allow := s.corsOrigins
		if allow != "*" && origin != "" {
			// Echo the request origin only if it's in the allow-list.
			for _, o := range strings.Split(allow, ",") {
				if strings.TrimSpace(o) == origin {
					allow = origin
					break
				}
			}
		}
		w.Header().Set("Access-Control-Allow-Origin", allow)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Mode")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// merchantID extracts the authenticated merchant id from the request context.
func merchantID(r *http.Request) uuid.UUID {
	if v, ok := r.Context().Value(ctxMerchantID).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

// requireMerchant authenticates via EITHER a dashboard JWT or a merchant API
// key (Bearer token). This lets both the dashboard and a merchant's server-side
// integration call the same endpoints (e.g. create checkout sessions).
func (s *Server) requireMerchant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token or api key")
			return
		}

		// Try JWT first (dashboard sessions) — mode comes from the X-Mode header.
		if claims, err := s.tokens.Verify(token); err == nil {
			ctx := context.WithValue(r.Context(), ctxMerchantID, claims.MerchantID)
			ctx = context.WithValue(ctx, ctxUserID, claims.UserID)
			ctx = context.WithValue(ctx, ctxMode, modeFromRequest(r))
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Fall back to an API key — the key's env (test_/live_) selects the mode.
		mid, keyMode, err := s.resolveAPIKey(r.Context(), token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token or api key")
			return
		}
		ctx := context.WithValue(r.Context(), ctxMerchantID, mid)
		ctx = context.WithValue(ctx, ctxMode, keyMode)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// resolveAPIKey validates a presented API key and returns its merchant id and
// mode (derived from the key's env prefix, e.g. live_… → "live").
func (s *Server) resolveAPIKey(ctx context.Context, presented string) (uuid.UUID, string, error) {
	prefix, ok := auth.PrefixFromKey(presented)
	if !ok {
		return uuid.Nil, "", errors.New("malformed api key")
	}
	rec, err := s.q.GetAPIKeyByPrefix(ctx, prefix)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, "", errors.New("unknown api key")
		}
		return uuid.Nil, "", err
	}
	if !auth.VerifyAPIKey(presented, rec.KeyHash) {
		return uuid.Nil, "", errors.New("api key mismatch")
	}
	_ = s.q.TouchAPIKey(ctx, rec.ID)

	env, _, _ := strings.Cut(rec.Prefix, "_")
	return rec.MerchantID, normalizeMode(env), nil
}

// mode extracts the active mode ("test"/"live") from the request context.
func mode(r *http.Request) string {
	if v, ok := r.Context().Value(ctxMode).(string); ok && v != "" {
		return v
	}
	return "test"
}
