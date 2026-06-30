-- +goose Up
-- +goose StatementBegin

-- The gateway's publishable (client-side) key, e.g. Stripe pk_test_/pk_live_.
-- Unlike the secret it is safe to expose to the browser, so the hosted checkout
-- page can load Stripe.js and tokenize cards directly with the gateway.
ALTER TABLE gateway_accounts ADD COLUMN publishable_key TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE gateway_accounts DROP COLUMN IF EXISTS publishable_key;

-- +goose StatementEnd
