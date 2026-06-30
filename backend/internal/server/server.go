// Package server wires the HTTP router, middleware, and handlers.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/auth"
	"github.com/chargeebee/platform/internal/billing"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/gateway"
	"github.com/chargeebee/platform/internal/realtime"
)

// Emitter publishes a domain event (to webhooks + live dashboards).
type Emitter interface {
	Emit(merchantID uuid.UUID, mode, eventType string, data any)
}

// BillingRunner runs a billing pass for one merchant + mode on demand (the
// manual "run scheduler now" trigger).
type BillingRunner interface {
	RunForMerchant(ctx context.Context, merchantID uuid.UUID, mode string) (billing.RunSummary, error)
}

// WebhookResender re-delivers a past webhook delivery.
type WebhookResender interface {
	Resend(ctx context.Context, merchantID uuid.UUID, deliveryID uuid.UUID) error
}

// Server holds shared dependencies for HTTP handlers.
type Server struct {
	pool            *pgxpool.Pool
	q               *sqlc.Queries
	tokens          *auth.TokenManager
	logger          *slog.Logger
	checkoutBaseURL string
	corsOrigins     string
	emitter         Emitter
	hub             *realtime.Hub
	billing         BillingRunner
	resender        WebhookResender
	gateways        *gateway.Registry
	router          chi.Router
}

// New constructs a Server and registers all routes.
func New(pool *pgxpool.Pool, tokens *auth.TokenManager, checkoutBaseURL, corsOrigins string, emitter Emitter, hub *realtime.Hub, billing BillingRunner, resender WebhookResender, gateways *gateway.Registry, logger *slog.Logger) *Server {
	s := &Server{
		pool:            pool,
		q:               sqlc.New(pool),
		tokens:          tokens,
		logger:          logger,
		checkoutBaseURL: checkoutBaseURL,
		corsOrigins:     corsOrigins,
		emitter:         emitter,
		hub:             hub,
		billing:         billing,
		resender:        resender,
		gateways:        gateways,
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
		r.Get("/signup/check-subdomain", s.handleCheckSubdomain)
		r.Post("/login", s.handleLogin)

		// Live updates (WebSocket). Auth via ?token= query param since browsers
		// can't set headers on a WS handshake.
		r.Get("/realtime", s.handleRealtime)

		// Public hosted-checkout endpoints (the customer is not authenticated).
		r.Get("/checkout/sessions/{id}", s.handleGetCheckoutSession)
		r.Post("/checkout/sessions/{id}/setup-intent", s.handleCheckoutSetupIntent)
		r.Post("/checkout/sessions/{id}/complete", s.handleCompleteCheckoutSession)

		// Create checkout session: usable via dashboard JWT OR merchant API key.
		r.Group(func(r chi.Router) {
			r.Use(s.requireMerchant)
			r.Post("/checkout/sessions", s.handleCreateCheckoutSession)
		})

		// Authenticated dashboard API (JWT).
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)

			r.Get("/me", s.handleGetMe)
			r.Post("/me/tour/complete", s.handleCompleteTour)

			r.Get("/sites", s.handleListSites)
			r.Get("/analytics", s.handleAnalytics)
			r.Get("/analytics/checkout", s.handleCheckoutAnalytics)
			r.Post("/dev/seed", s.handleSeed)
			r.Post("/dev/bill-now", s.handleBillNow)
			r.Get("/billing-runs", s.handleListBillingRuns)

			r.Post("/products", s.handleCreateProduct)
			r.Get("/products", s.handleListProducts)
			r.Post("/prices", s.handleCreatePrice)
			r.Get("/prices", s.handleListPrices)

			r.Post("/customers", s.handleCreateCustomer)
			r.Get("/customers", s.handleListCustomers)

			r.Post("/subscriptions", s.handleCreateSubscription)
			r.Get("/subscriptions", s.handleListSubscriptions)
			r.Post("/subscriptions/{id}/cancel", s.handleCancelSubscription)

			r.Get("/gateways", s.handleListGateways)
			r.Post("/gateways", s.handleConnectGateway)
			r.Delete("/gateways/{provider}", s.handleDisconnectGateway)

			r.Post("/coupons", s.handleCreateCoupon)
			r.Get("/coupons", s.handleListCoupons)
			r.Patch("/coupons/{id}", s.handleUpdateCoupon)
			r.Delete("/coupons/{id}", s.handleDeleteCoupon)

			r.Get("/invoices", s.handleListInvoices)
			r.Get("/transactions", s.handleListTransactions)

			r.Post("/webhooks", s.handleCreateWebhook)
			r.Get("/webhooks", s.handleListWebhooks)
			r.Delete("/webhooks/{id}", s.handleDeleteWebhook)
			r.Get("/webhook-deliveries", s.handleListWebhookDeliveries)
			r.Post("/webhook-deliveries/{id}/resend", s.handleResendWebhook)

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
