# Billing Platform — Backend (Go)

Multi-tenant subscription billing platform (Chargebee-style). Go API + Postgres,
Stripe via Connect, in-process billing scheduler. See
[../research/architecture.md](../research/architecture.md) for the full design.

## Stack
Go 1.25 · PostgreSQL 15 · chi · pgx + sqlc · goose · stripe-go · JWT/bcrypt

## Layout
```
cmd/api/            entrypoint (HTTP server + scheduler)
internal/config/    env config
internal/db/        pgx pool + sqlc-generated code (db/sqlc)
internal/domain/    Money value type
internal/gateway/   PaymentGateway interface + stripe/ impl
internal/auth/      JWT, API keys, password hashing
internal/billing/   period math, proration, dunning, engine, scheduler
internal/server/    chi router, middleware, handlers
migrations/         goose SQL migrations
queries/            sqlc source queries
```

## Prerequisites
```bash
make tools          # installs goose + sqlc
# Postgres: either `make db-up` (Docker) or a local Postgres with a chargeebee DB
```

## Run
```bash
cp .env.example .env          # fill secrets as needed
make migrate-up               # apply schema
make run                      # starts API on :8080 + billing scheduler
```

## Smoke test
```bash
curl localhost:8080/healthz
curl localhost:8080/readyz

# Onboard a merchant (returns a JWT)
curl -s -X POST localhost:8080/v1/signup \
  -H 'Content-Type: application/json' \
  -d '{"merchant_name":"Acme","email":"a@acme.com","password":"supersecret"}'

# Use the token for authenticated calls
TOKEN=...   # from signup/login
curl -s -X POST localhost:8080/v1/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Pro"}'
```

## API (v1)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/signup` | – | Create merchant + admin, return JWT |
| POST | `/v1/login` | – | Authenticate, return JWT |
| POST | `/v1/products` | JWT | Create product |
| GET  | `/v1/products` | JWT | List products |
| POST | `/v1/prices` | JWT | Create price (interval, amount, currency) |
| POST | `/v1/customers` | JWT | Create customer |
| GET  | `/v1/customers` | JWT | List customers |
| POST | `/v1/subscriptions` | JWT | Create subscription |
| GET  | `/v1/subscriptions` | JWT | List subscriptions |

## How billing runs
The scheduler ticks every minute, calls `ListDueSubscriptions`, and for each:
builds an invoice → charges Stripe off-session (idempotency-keyed) → on success
advances the period; on failure sets `past_due` and schedules dunning (days 1/3/5).

## Regenerate DB code after editing SQL
```bash
make sqlc           # regenerate internal/db/sqlc from queries/ + migrations/
```

## Not yet wired (next)
Stripe Connect onboarding + card-save (SetupIntent), coupons/proration on
invoices, inbound Stripe webhooks, outbound merchant webhooks, SendGrid emails,
customer portal, React frontend, credential encryption (replace PlaintextResolver).
