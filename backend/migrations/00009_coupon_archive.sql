-- +goose Up
-- +goose StatementBegin

-- When and why a coupon was archived (disabled). archive_reason is one of
-- 'expired', 'campaign_over', 'revoked', 'manual'.
ALTER TABLE coupons ADD COLUMN archived_at    TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN archive_reason TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE coupons DROP COLUMN IF EXISTS archive_reason;
ALTER TABLE coupons DROP COLUMN IF EXISTS archived_at;

-- +goose StatementEnd
