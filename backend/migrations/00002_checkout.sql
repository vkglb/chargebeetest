-- +goose Up
-- +goose StatementBegin

-- Hosted checkout sessions. A merchant creates one via API, redirects their
-- customer to the hosted page, and we create the customer + subscription when
-- the customer completes payment.
CREATE TABLE checkout_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    price_id        UUID NOT NULL REFERENCES prices(id),
    quantity        INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'open', -- open | completed | expired
    customer_email  TEXT,
    success_url     TEXT NOT NULL,
    cancel_url      TEXT,
    customer_id     UUID REFERENCES customers(id),
    subscription_id UUID REFERENCES subscriptions(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkout_sessions_merchant ON checkout_sessions(merchant_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS checkout_sessions;
-- +goose StatementEnd
