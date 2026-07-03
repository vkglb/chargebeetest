-- name: CreateMerchantUser :one
INSERT INTO merchant_users (merchant_id, email, password_hash, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetMerchantUserByEmail :one
SELECT * FROM merchant_users
WHERE email = $1;

-- name: GetMerchantUserByID :one
SELECT * FROM merchant_users
WHERE id = $1;

-- name: CreateAPIKey :one
INSERT INTO api_keys (merchant_id, prefix, key_hash, scopes)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetAPIKeyByPrefix :one
SELECT * FROM api_keys
WHERE prefix = $1 AND revoked_at IS NULL;

-- name: TouchAPIKey :exec
UPDATE api_keys
SET last_used_at = now()
WHERE id = $1;

-- name: ListAPIKeysByMerchant :many
SELECT id, merchant_id, prefix, scopes, last_used_at, revoked_at, created_at
FROM api_keys
WHERE merchant_id = $1
ORDER BY created_at DESC;

-- name: RevokeAPIKey :exec
UPDATE api_keys
SET revoked_at = now()
WHERE id = $1 AND merchant_id = $2;

-- name: CreateGatewayAccount :one
INSERT INTO gateway_accounts (merchant_id, provider, account_ref, encrypted_credentials)
VALUES ($1, $2, $3, $4)
RETURNING *;
