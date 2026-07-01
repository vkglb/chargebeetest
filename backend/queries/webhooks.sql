-- name: CreateWebhookEndpoint :one
INSERT INTO webhook_endpoints (merchant_id, mode, url, signing_secret, events, enabled, content_type, verify_ssl)
VALUES ($1, $2, $3, $4, $5, true, $6, $7)
RETURNING *;

-- name: ListWebhookEndpoints :many
SELECT * FROM webhook_endpoints
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC;

-- name: DeleteWebhookEndpoint :exec
DELETE FROM webhook_endpoints
WHERE id = $1 AND merchant_id = $2;

-- name: ListWebhookDeliveries :many
SELECT * FROM webhook_deliveries
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3;

-- name: ListEnabledWebhookEndpoints :many
SELECT * FROM webhook_endpoints
WHERE merchant_id = $1 AND mode = $2 AND enabled = true;

-- name: GetWebhookDelivery :one
SELECT * FROM webhook_deliveries
WHERE id = $1 AND merchant_id = $2;

-- name: GetWebhookEndpoint :one
SELECT * FROM webhook_endpoints
WHERE id = $1 AND merchant_id = $2;

-- name: CreateWebhookDelivery :one
INSERT INTO webhook_deliveries (merchant_id, mode, endpoint_id, event_type, payload, status, attempts)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateWebhookDeliveryResult :one
UPDATE webhook_deliveries
SET status = $2, attempts = $3
WHERE id = $1
RETURNING *;
