// Command api is the entrypoint for the billing platform HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/chargeebee/platform/internal/auth"
	"github.com/chargeebee/platform/internal/billing"
	"github.com/chargeebee/platform/internal/config"
	"github.com/chargeebee/platform/internal/db"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/gateway"
	"github.com/chargeebee/platform/internal/gateway/braintree"
	"github.com/chargeebee/platform/internal/gateway/paypal"
	"github.com/chargeebee/platform/internal/gateway/razorpay"
	"github.com/chargeebee/platform/internal/gateway/sandbox"
	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/gateway/stripe"
	"github.com/chargeebee/platform/internal/realtime"
	"github.com/chargeebee/platform/internal/server"
	"github.com/chargeebee/platform/internal/webhooks"
)

// publisher fans a domain event out to both webhook subscribers and live
// dashboards, satisfying billing.Emitter and server.Emitter.
type publisher struct {
	dispatcher *webhooks.Dispatcher
	hub        *realtime.Hub
}

func (p *publisher) Emit(merchantID uuid.UUID, mode, eventType string, data any) {
	p.dispatcher.Emit(merchantID, mode, eventType, data)
	p.hub.Broadcast(merchantID, mode, eventType, data)
}

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger.Info("configuration loaded", "env", cfg.Env, "addr", cfg.HTTPAddr)

	// Root context cancelled on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Optionally apply migrations before serving (handy on Render/PaaS).
	if cfg.AutoMigrate {
		logger.Info("running migrations on startup")
		if err := db.MigrateUp(cfg.DatabaseURL); err != nil {
			return err
		}
		logger.Info("migrations applied")
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	logger.Info("connected to database")

	// Shared dependencies.
	queries := sqlc.New(pool)
	tokens := auth.NewTokenManager(cfg.JWTSecret, 24*time.Hour)

	// Multi-gateway registry — the engine charges through whichever gateway a
	// given merchant has connected.
	gateways := gateway.NewRegistry(
		stripe.New(),
		razorpay.New(),
		braintree.New(),
		paypal.New(),
		sandbox.New(),
	)
	logger.Info("payment gateways registered", "providers", gateways.Providers())

	// Outbound webhook dispatcher + live-update hub, combined into one publisher.
	dispatcher := webhooks.New(queries, logger)
	hub := realtime.NewHub(logger)
	pub := &publisher{dispatcher: dispatcher, hub: hub}

	// Billing engine + scheduler (the platform "clock").
	engine := billing.NewEngine(queries, gateways, billing.PlaintextResolver{}, pub, logger)
	scheduler := billing.NewScheduler(engine, time.Minute)
	go scheduler.Run(ctx)
	logger.Info("billing scheduler started", "interval", "1m")

	srv := server.New(pool, tokens, cfg.CheckoutBaseURL, cfg.CORSOrigins, pub, hub, engine, logger)
	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Run the HTTP server until shutdown is signalled.
	errCh := make(chan error, 1)
	go func() {
		logger.Info("http server listening", "addr", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}
	logger.Info("server stopped cleanly")
	return nil
}
