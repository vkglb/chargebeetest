-- +goose Up
-- +goose StatementBegin

-- Richer delivery diagnostics for the log's detail view:
--  response_code — HTTP status the endpoint returned (null if no response, e.g.
--                  a network/TLS error before any status was received)
--  error         — failure reason when a delivery did not succeed
ALTER TABLE webhook_deliveries ADD COLUMN response_code INT;
ALTER TABLE webhook_deliveries ADD COLUMN error         TEXT;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS error;
ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS response_code;

-- +goose StatementEnd
