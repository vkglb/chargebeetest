-- +goose Up
-- +goose StatementBegin

-- Why a subscription was cancelled: customer_request | payment_failure |
-- expired | fraudulent | other. Blank while the subscription is live.
ALTER TABLE subscriptions ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_reason;

-- +goose StatementEnd
