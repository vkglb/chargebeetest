-- +goose Up
-- +goose StatementBegin

-- A record of each billing pass (manual "run now" or a scheduler tick) so the
-- dashboard can chart when billing ran and how many charges passed / failed.
CREATE TABLE billing_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual', -- manual | scheduler
    processed   INT  NOT NULL DEFAULT 0,
    succeeded   INT  NOT NULL DEFAULT 0,
    failed      INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_runs_merchant_mode_idx ON billing_runs (merchant_id, mode, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS billing_runs;

-- +goose StatementEnd
