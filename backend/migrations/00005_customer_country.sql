-- +goose Up
-- +goose StatementBegin

-- Customer billing country (ISO 3166-1 alpha-2, e.g. "US"). Optional; blank
-- until set. Used for tax/region reporting and display.
ALTER TABLE customers ADD COLUMN country TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE customers DROP COLUMN IF EXISTS country;

-- +goose StatementEnd
