-- +goose Up
-- +goose StatementBegin

-- Core multi-tenant billing schema (v1).
-- Every domain table carries merchant_id and is scoped per tenant at the query layer.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE merchants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active', -- active | suspended | closed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard logins for a merchant.
CREATE TABLE merchant_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin', -- admin | member
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, email)
);

-- Each merchant's connected gateway (Stripe via Connect). Credentials encrypted at rest.
CREATE TABLE gateway_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id           UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider              TEXT NOT NULL DEFAULT 'stripe', -- stripe | razorpay | ...
    account_ref           TEXT,           -- e.g. Stripe acct_xxx (Connect account id)
    encrypted_credentials BYTEA,          -- encrypted Connect token / secret
    status                TEXT NOT NULL DEFAULT 'connected',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, provider)
);

-- Per-merchant API keys (we store only the hash).
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    prefix      TEXT NOT NULL,            -- visible identifier, e.g. "live_ab12"
    key_hash    TEXT NOT NULL,
    scopes      TEXT[] NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prefix)
);

-- ── Catalog ─────────────────────────────────────────────────────────────────
CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A price is a billable interval for a product (flat model in v1).
CREATE TABLE prices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    nickname      TEXT,
    amount_minor  BIGINT NOT NULL,        -- minor units (e.g. cents)
    currency      CHAR(3) NOT NULL,       -- ISO 4217
    interval_unit TEXT NOT NULL,          -- day | week | month | year
    interval_count INT NOT NULL DEFAULT 1,
    trial_days    INT NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coupons (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    discount_type TEXT NOT NULL,          -- percentage | fixed
    value        BIGINT NOT NULL,         -- percent (0-100) or minor units
    max_redemptions INT,
    redemptions  INT NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, code)
);

-- ── Customers & payment methods ─────────────────────────────────────────────
CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    name                TEXT,
    gateway_customer_ref TEXT,            -- Stripe cus_xxx
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, email)
);

CREATE TABLE payment_methods (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id    UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    gateway_pm_ref TEXT NOT NULL,         -- Stripe pm_xxx
    brand          TEXT,
    last4          TEXT,
    exp_month      INT,
    exp_year       INT,
    is_default     BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE subscriptions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id        UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    price_id           UUID NOT NULL REFERENCES prices(id),
    payment_method_id  UUID REFERENCES payment_methods(id),
    status             TEXT NOT NULL DEFAULT 'trialing', -- trialing|active|past_due|paused|cancelled
    quantity           INT NOT NULL DEFAULT 1,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    next_billing_at    TIMESTAMPTZ,       -- the scheduler cursor
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    cancelled_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Invoices, line items, transactions ──────────────────────────────────────
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id),
    subscription_id UUID REFERENCES subscriptions(id),
    status          TEXT NOT NULL DEFAULT 'draft', -- draft|open|paid|void|uncollectible
    currency        CHAR(3) NOT NULL,
    subtotal_minor  BIGINT NOT NULL DEFAULT 0,
    discount_minor  BIGINT NOT NULL DEFAULT 0,
    tax_minor       BIGINT NOT NULL DEFAULT 0,
    total_minor     BIGINT NOT NULL DEFAULT 0,
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    issued_at       TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_line_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    quantity     INT NOT NULL DEFAULT 1,
    unit_amount_minor BIGINT NOT NULL,
    amount_minor BIGINT NOT NULL
);

CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    invoice_id      UUID REFERENCES invoices(id),
    gateway_txn_ref TEXT,                 -- Stripe pi_xxx
    status          TEXT NOT NULL,        -- succeeded|failed|pending
    amount_minor    BIGINT NOT NULL,
    currency        CHAR(3) NOT NULL,
    failure_reason  TEXT,
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);

-- ── Dunning ─────────────────────────────────────────────────────────────────
CREATE TABLE dunning_attempts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    attempt_no   INT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    attempted_at TIMESTAMPTZ,
    result       TEXT,                    -- succeeded|failed|skipped
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Outbound webhooks & audit ───────────────────────────────────────────────
CREATE TABLE webhook_endpoints (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id    UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    events         TEXT[] NOT NULL DEFAULT '{}',
    enabled        BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    endpoint_id  UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    payload      JSONB NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending|delivered|failed
    attempts     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes for tenant-scoped access & the scheduler ────────────────────────
CREATE INDEX idx_merchant_users_merchant ON merchant_users(merchant_id);
CREATE INDEX idx_products_merchant ON products(merchant_id);
CREATE INDEX idx_prices_merchant ON prices(merchant_id);
CREATE INDEX idx_customers_merchant ON customers(merchant_id);
CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id);
CREATE INDEX idx_subscriptions_merchant ON subscriptions(merchant_id);
CREATE INDEX idx_subscriptions_due ON subscriptions(next_billing_at)
    WHERE status IN ('active', 'past_due');
CREATE INDEX idx_invoices_merchant ON invoices(merchant_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_dunning_invoice ON dunning_attempts(invoice_id);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
DROP TABLE IF EXISTS dunning_attempts;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS invoice_line_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS prices;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS gateway_accounts;
DROP TABLE IF EXISTS merchant_users;
DROP TABLE IF EXISTS merchants;
-- +goose StatementEnd
