-- +goose Up
-- +goose StatementBegin

-- Coupons can be active or archived (disabled). Archived coupons stay on record
-- (and keep their redemption history) but can no longer be applied.
ALTER TABLE coupons ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE coupons DROP COLUMN IF EXISTS status;

-- +goose StatementEnd
