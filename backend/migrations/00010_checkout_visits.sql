-- +goose Up
-- +goose StatementBegin

-- A row per hosted-checkout page load, for visit analytics (traffic over time,
-- visitor count, country breakdown, conversion vs completed sessions).
CREATE TABLE checkout_visits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,
    session_id  UUID,
    country     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkout_visits_merchant_mode_idx ON checkout_visits (merchant_id, mode, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS checkout_visits;

-- +goose StatementEnd
