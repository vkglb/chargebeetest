-- +goose Up
-- +goose StatementBegin

-- A merchant's unique subdomain (e.g. "acme" → acme.billing.app) and the
-- account owner's name (used as the default sender for customer emails).
ALTER TABLE merchants ADD COLUMN subdomain  TEXT NOT NULL DEFAULT '';
ALTER TABLE merchants ADD COLUMN owner_name TEXT NOT NULL DEFAULT '';

-- Subdomains are unique when set; existing rows keep an empty subdomain.
CREATE UNIQUE INDEX merchants_subdomain_key ON merchants (subdomain) WHERE subdomain <> '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS merchants_subdomain_key;
ALTER TABLE merchants DROP COLUMN IF EXISTS owner_name;
ALTER TABLE merchants DROP COLUMN IF EXISTS subdomain;

-- +goose StatementEnd
