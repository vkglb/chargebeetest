// Package server wires the HTTP router, middleware, and handlers.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/chargeebee/platform/internal/auth"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/webhooks"
)

// Server holds shared dependencies for HTTP handlers.
type Server struct {
	pool            *pgxpool.Pool
	q               *sqlc.Queries
	tokens          *auth.TokenManager
	logger          *slog.Logger
	checkoutBaseURL string
	corsOrigins     string
	dispatcher      *webhooks.Dispatcher
	router          chi.Router
}

// New constructs a Server and registers all routes.
func New(pool *pgxpool.Pool, tokens *auth.TokenManager, checkoutBaseURL, corsOrigins string, dispatcher *webhooks.Dispatcher, logger *slog.Logger) *Server {
	s := &Server{
		pool:            pool,
		q:               sqlc.New(pool),
		tokens:          tokens,
		logger:          logger,
		checkoutBaseURL: checkoutBaseURL,
		corsOrigins:     corsOrigins,
		dispatcher:      dispatcher,
		router:          chi.NewRouter(),
	}
	s.routes()
	return s
}

// Handler exposes the underlying router for the http.Server.
func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) routes() {
	r := s.router

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(s.cors)

	// Liveness/readiness.
	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)

	r.Route("/v1", func(r chi.Router) {
		r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"message": "pong"})
		})

		// Public: merchant onboarding + login.
		r.Post("/signup", s.handleSignup)
		r.Post("/login", s.handleLogin)

		// Public hosted-checkout endpoints (the customer is not authenticated).
		r.Get("/checkout/sessions/{id}", s.handleGetCheckoutSession)
		r.Post("/checkout/sessions/{id}/complete", s.handleCompleteCheckoutSession)

		// Create checkout session: usable via dashboard JWT OR merchant API key.
		r.Group(func(r chi.Router) {
			r.Use(s.requireMerchant)
			r.Post("/checkout/sessions", s.handleCreateCheckoutSession)
		})

		// Authenticated dashboard API (JWT).
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)

			r.Get("/sites", s.handleListSites)

			r.Post("/products", s.handleCreateProduct)
			r.Get("/products", s.handleListProducts)
			r.Post("/prices", s.handleCreatePrice)
			r.Get("/prices", s.handleListPrices)

			r.Post("/customers", s.handleCreateCustomer)
			r.Get("/customers", s.handleListCustomers)

			r.Post("/subscriptions", s.handleCreateSubscription)
			r.Get("/subscriptions", s.handleListSubscriptions)

			r.Get("/gateways", s.handleListGateways)
			r.Post("/gateways", s.handleConnectGateway)

			r.Post("/coupons", s.handleCreateCoupon)
			r.Get("/coupons", s.handleListCoupons)

			r.Get("/invoices", s.handleListInvoices)
			r.Get("/transactions", s.handleListTransactions)

			r.Post("/webhooks", s.handleCreateWebhook)
			r.Get("/webhooks", s.handleListWebhooks)
			r.Delete("/webhooks/{id}", s.handleDeleteWebhook)
			r.Get("/webhook-deliveries", s.handleListWebhookDeliveries)

			r.Post("/api-keys", s.handleCreateAPIKey)
			r.Get("/api-keys", s.handleListAPIKeys)
			r.Delete("/api-keys/{id}", s.handleRevokeAPIKey)
		})
	})
}

// handleHealth reports process liveness (no dependencies checked).
func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady reports readiness, including database connectivity.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := contextWithTimeout(r, 3*time.Second)
	defer cancel()

	if err := s.pool.Ping(ctx); err != nil {
		s.logger.Error("readiness check failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "db": "down"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "db": "up"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
