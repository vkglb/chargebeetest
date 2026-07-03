-- +goose Up
-- +goose StatementBegin
ALTER TABLE user_metadata ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE user_metadata DROP COLUMN two_factor_enabled;
-- +goose StatementEnd
