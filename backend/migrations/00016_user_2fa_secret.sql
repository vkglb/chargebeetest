-- +goose Up
-- +goose StatementBegin

-- The user's TOTP shared secret (base32). Set during 2FA setup, verified on
-- login. Empty when 2FA has never been enrolled.
ALTER TABLE user_metadata ADD COLUMN two_factor_secret TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE user_metadata DROP COLUMN IF EXISTS two_factor_secret;

-- +goose StatementEnd
