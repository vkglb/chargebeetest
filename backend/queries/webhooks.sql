-- name: CreateWebhookEndpoint :one
INSERT INTO webhook_endpoints (merchant_id, url, signing_secret, events, enabled)
VALUES ($1, $2, $3, $4, true)
RETURNING *;

-- name: ListWebhookEndpoints :many
SELECT * FROM webhook_endpoints
WHERE merchant_id = $1
ORDER BY created_at DESC;

-- name: DeleteWebhookEndpoint :exec
DELETE FROM webhook_endpoints
WHERE id = $1 AND merchant_id = $2;

-- name: ListWebhookDeliveries :many
SELECT * FROM webhook_deliveries
WHERE merchant_id = $1
ORDER BY created_at DESC
LIMIT $2;
