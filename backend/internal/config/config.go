// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration for the platform.
type Config struct {
	Env             string        // "development" | "production"
	HTTPAddr        string        // address the API server listens on, e.g. ":8080"
	DatabaseURL     string        // Postgres connection string (pgx format)
	ShutdownTimeout time.Duration // graceful shutdown grace period

	// Stripe platform credentials (Connect). Per-merchant tokens live in the DB.
	StripeSecretKey     string
	StripeWebhookSecret string

	// SendGrid for transactional/dunning email.
	SendGridAPIKey string

	// JWTSecret signs dashboard session tokens.
	JWTSecret string

	// CredentialsEncKey is a base64-encoded 32-byte key used to encrypt stored
	// gateway secrets at rest (AES-256-GCM). Empty disables encryption (dev only).
	CredentialsEncKey string

	// CheckoutBaseURL is where hosted checkout pages are served (the frontend).
	CheckoutBaseURL string

	// CORSOrigins is the comma-separated list of allowed browser origins
	// ("*" allows any). The dashboard static site's origin goes here in prod.
	CORSOrigins string

	// AutoMigrate runs pending migrations on startup when true (handy on PaaS
	// like Render where there's no separate migration step).
	AutoMigrate bool
}

// Load reads configuration from the environment, applying sensible defaults for
// local development. It returns an error only when a value is present but invalid.
func Load() (*Config, error) {
	cfg := &Config{
		Env:                 getEnv("APP_ENV", "development"),
		HTTPAddr:            getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://chargeebee:chargeebee@localhost:5432/chargeebee?sslmode=disable"),
		StripeSecretKey:     getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
		SendGridAPIKey:      getEnv("SENDGRID_API_KEY", ""),
		JWTSecret:           getEnv("JWT_SECRET", "dev-insecure-secret-change-me"),
		CredentialsEncKey:   getEnv("CREDENTIALS_ENC_KEY", ""),
		CheckoutBaseURL:     getEnv("CHECKOUT_BASE_URL", "http://localhost:5173"),
		CORSOrigins:         getEnv("CORS_ORIGINS", "*"),
		AutoMigrate:         getEnv("AUTO_MIGRATE", "false") == "true",
	}

	// Render (and most PaaS) inject PORT; bind to it when present.
	if port := os.Getenv("PORT"); port != "" {
		cfg.HTTPAddr = ":" + port
	}

	timeoutSecs, err := strconv.Atoi(getEnv("SHUTDOWN_TIMEOUT_SECONDS", "15"))
	if err != nil {
		return nil, fmt.Errorf("invalid SHUTDOWN_TIMEOUT_SECONDS: %w", err)
	}
	cfg.ShutdownTimeout = time.Duration(timeoutSecs) * time.Second

	return cfg, nil
}

// IsProduction reports whether the platform is running in production mode.
func (c *Config) IsProduction() bool { return c.Env == "production" }

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
