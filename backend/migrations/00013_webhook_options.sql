-- +goose Up
-- +goose StatementBegin

-- GitHub-style delivery options per webhook endpoint:
--  content_type — how the payload is encoded on the wire
--  verify_ssl   — whether we validate the endpoint's TLS certificate
ALTER TABLE webhook_endpoints
    ADD COLUMN content_type TEXT    NOT NULL DEFAULT 'application/json';
ALTER TABLE webhook_endpoints
    ADD COLUMN verify_ssl   BOOLEAN NOT NULL DEFAULT true;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS verify_ssl;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS content_type;

-- +goose StatementEnd
