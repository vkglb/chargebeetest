# Architecture — Multi-Tenant Billing Platform (Chargebee-style)

> The product: a **standalone SaaS billing platform any business can sign up for** —
> same model as Chargebee. Each business connects THEIR Stripe, builds THEIR plans, and
> WE bill THEIR customers on schedule (subscriptions, invoices, dunning, analytics).
>
> Companion to the migration/research notes in this folder. This is the BUILD spec.

---

## 1. Locked tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React + TypeScript (Vite)** | Merchant dashboard, end-customer portal, hosted checkout |
| Backend / APIs | **Go 1.23** | All backend services |
| Database | **PostgreSQL 15** | System of record; money + audit |
| HTTP router | **chi** | Lightweight, stdlib-compatible |
| DB access | **pgx + sqlc** | SQL-first, type-safe generated Go (no ORM) |
| Migrations | **goose** | Versioned SQL migrations |
| Jobs / scheduler | **River** | Postgres-backed job queue (no Redis) — runs billing scheduler |
| Money | **int64 minor units** + `shopspring/decimal` for calc | Never floats |
| Payments | **stripe-go** + **Stripe Connect** | Multi-tenant: each merchant connects own Stripe |
| Email | **SendGrid** | Dunning + lifecycle emails |
| Tax | **Stripe Tax / Quaderno** | Integrate, don't build |
| Auth | **JWT** (dashboard) + **hashed API keys** (merchant API) | |
| Logging | **slog** (stdlib) | Structured logs |

---

## 2. Three user audiences (like Chargebee)

1. **Platform (us)** — super admin over all merchants, platform health, our billing of them.
2. **Merchant / tenant (our customers)** — sign up, connect Stripe, build catalog, manage subscriptions, see MRR.
3. **End-customer (merchant's customers)** — hosted checkout + self-service portal; the ones actually charged.

---

## 3. Multi-tenancy model

- **Row-level isolation:** every domain table has `merchant_id` (FK → merchants).
- Every sqlc query is **scoped by `merchant_id`** — a missing scope = cross-tenant leak (the #1 security risk).
- Optionally enforce with **Postgres Row-Level Security (RLS)** as defense-in-depth.
- Each merchant's **Stripe Connect** credentials stored encrypted; gateway layer resolves the right merchant per request.

```
Merchant A ─connects Stripe─┐
Merchant B ─connects Stripe─┤─> PLATFORM (Go) ─Connect token─> each merchant's Stripe
Merchant C ─connects Stripe─┘     billing brain (multi-tenant)
```

---

## 4. Core domain (v1 schema)

| Table | Holds | Key columns |
|---|---|---|
| `merchants` | A business/tenant | id, name, status, created_at |
| `merchant_users` | Dashboard logins for a merchant | id, merchant_id, email, password_hash, role |
| `gateway_accounts` | Merchant's connected Stripe (Connect) | id, merchant_id, provider, encrypted_credentials, account_ref |
| `api_keys` | Per-merchant API keys | id, merchant_id, key_hash, prefix, scopes |
| `products` | A sellable thing | id, merchant_id, name |
| `plans` / `prices` | Pricing (interval, amount_minor, currency, model) | id, merchant_id, product_id, interval, amount_minor, currency |
| `coupons` | Discounts | id, merchant_id, code, type, value, redemptions |
| `customers` | Merchant's end-customer | id, merchant_id, email, gateway_customer_ref (cus_xxx) |
| `payment_methods` | Tokenized cards | id, merchant_id, customer_id, gateway_pm_ref (pm_xxx), brand, last4, exp |
| `subscriptions` | The recurring state machine | id, merchant_id, customer_id, price_id, status, current_period_end, next_billing_at |
| `invoices` | Generated bills | id, merchant_id, subscription_id, status, total_minor, currency, period |
| `invoice_line_items` | Line items | id, invoice_id, description, amount_minor, qty |
| `transactions` | Charge records | id, merchant_id, invoice_id, gateway_txn_ref (pi_xxx), status, amount_minor |
| `dunning_attempts` | Retry tracking | id, merchant_id, invoice_id, attempt_no, scheduled_at, result |
| `webhook_endpoints` | Where we POST events for a merchant | id, merchant_id, url, signing_secret, events |
| `webhook_deliveries` | Outbound event log | id, merchant_id, endpoint_id, event_type, payload, status, attempts |
| `events` / `audit_log` | Replayable event log | id, merchant_id, type, payload, created_at |

Subscription state machine: `trial → active → past_due → (cancelled | paused)`.

Money: all amounts as `BIGINT` minor units + a `currency` char(3). Proration/tax via decimal.

---

## 5. The billing engine (the "brain")

1. **Scheduler** (River periodic job, daily + frequent tick): find subscriptions where
   `next_billing_at <= now`, enqueue one charge job each.
2. **Charge job:** build invoice (price + proration + coupon + tax) → call Stripe
   `PaymentIntent` (off_session, confirm) via the merchant's Connect token → record
   transaction → on success advance `next_billing_at`; on failure → dunning.
3. **Dunning:** schedule retries (configurable, e.g. days 1/3/5) → re-attempt → emails
   via SendGrid → escalate → cancel at end of period.
4. **Idempotency:** every charge keyed (`sub_{id}_cycle_{n}`) so retries never double-charge.
5. **Inbound webhooks:** receive Stripe events per merchant → sync async outcomes.
6. **Outbound webhooks:** emit signed events to each merchant's endpoints.

---

## 6. Repo layout (monorepo)

```
d:\chargeebee\
  research/                  # all the notes (existing)
  backend/                   # Go API + engine
    cmd/api/main.go          # entrypoint
    internal/
      config/                # env config
      server/                # chi router, middleware, handlers
      db/                    # pgx pool + sqlc-generated code
      domain/                # merchant, plan, subscription, invoice, ...
      gateway/               # PaymentGateway interface + stripe impl
      billing/               # scheduler, charge, proration, dunning
      auth/                  # jwt + api keys
    migrations/              # goose SQL migrations
    queries/                 # sqlc .sql query files
    sqlc.yaml
    go.mod
  frontend/                  # React + TS (added after backend foundation)
  docker-compose.yml         # Postgres (+ later services)
  Makefile                   # dev workflow
```

---

## 7. v1 scope (build first) vs later

**v1 (the core loop, end-to-end for ONE business):**
- Merchant signup + dashboard auth
- Connect Stripe (Connect)
- Create products/plans/prices
- Create customer + save card (hosted checkout, Stripe Elements)
- Create subscription → first charge
- Billing scheduler → recurring charge
- Basic dunning + SendGrid emails
- Inbound Stripe webhooks
- Single gateway (Stripe), single currency

**Later (v2+):** coupons, proration edge cases, multi-currency, multi-gateway,
tax engine, outbound webhooks + public API hardening, MRR/churn analytics,
customer self-service portal, RLS, audit/event-sourcing depth.

---

*Naming/domain TBD — module path is a placeholder (`github.com/chargeebee/platform`), trivially renamable.*
