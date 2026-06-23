-- +goose Up
-- +goose StatementBegin

-- Test/Live mode: each merchant gets two isolated datasets. Every
-- environment-specific row carries a mode; queries scope by (merchant_id, mode).
-- Account-level tables (merchants, merchant_users, api_keys) are NOT moded.

ALTER TABLE products          ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE prices            ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE coupons           ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE customers         ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE payment_methods   ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE subscriptions     ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE invoices          ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE transactions      ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE dunning_attempts  ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE checkout_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE webhook_endpoints ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE webhook_deliveries ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE gateway_accounts  ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';

-- Uniqueness must now include mode (same email/code/provider can exist in both).
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_merchant_id_email_key;
ALTER TABLE customers ADD CONSTRAINT customers_merchant_mode_email_key UNIQUE (merchant_id, mode, email);

ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_merchant_id_code_key;
ALTER TABLE coupons ADD CONSTRAINT coupons_merchant_mode_code_key UNIQUE (merchant_id, mode, code);

ALTER TABLE gateway_accounts DROP CONSTRAINT IF EXISTS gateway_accounts_merchant_id_provider_key;
ALTER TABLE gateway_accounts ADD CONSTRAINT gateway_accounts_merchant_mode_provider_key UNIQUE (merchant_id, mode, provider);

-- Scheduler index now spans mode.
DROP INDEX IF EXISTS idx_subscriptions_due;
CREATE INDEX idx_subscriptions_due ON subscriptions(next_billing_at)
    WHERE status IN ('active', 'past_due');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE gateway_accounts DROP CONSTRAINT IF EXISTS gateway_accounts_merchant_mode_provider_key;
ALTER TABLE gateway_accounts ADD CONSTRAINT gateway_accounts_merchant_id_provider_key UNIQUE (merchant_id, provider);
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_merchant_mode_code_key;
ALTER TABLE coupons ADD CONSTRAINT coupons_merchant_id_code_key UNIQUE (merchant_id, code);
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_merchant_mode_email_key;
ALTER TABLE customers ADD CONSTRAINT customers_merchant_id_email_key UNIQUE (merchant_id, email);

ALTER TABLE gateway_accounts  DROP COLUMN IF EXISTS mode;
ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS mode;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS mode;
ALTER TABLE checkout_sessions DROP COLUMN IF EXISTS mode;
ALTER TABLE dunning_attempts  DROP COLUMN IF EXISTS mode;
ALTER TABLE transactions      DROP COLUMN IF EXISTS mode;
ALTER TABLE invoices          DROP COLUMN IF EXISTS mode;
ALTER TABLE subscriptions     DROP COLUMN IF EXISTS mode;
ALTER TABLE payment_methods   DROP COLUMN IF EXISTS mode;
ALTER TABLE customers         DROP COLUMN IF EXISTS mode;
ALTER TABLE coupons           DROP COLUMN IF EXISTS mode;
ALTER TABLE prices            DROP COLUMN IF EXISTS mode;
ALTER TABLE products          DROP COLUMN IF EXISTS mode;
-- +goose StatementEnd
