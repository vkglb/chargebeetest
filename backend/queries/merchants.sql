-- name: CreateMerchant :one
INSERT INTO merchants (name, subdomain, owner_name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CountMerchantsBySubdomain :one
SELECT COUNT(*)::bigint AS count
FROM merchants WHERE subdomain = $1;

-- name: GetMerchant :one
SELECT * FROM merchants
WHERE id = $1;

-- name: ListMerchants :many
SELECT * FROM merchants
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: UpdateMerchantStatus :one
UPDATE merchants
SET status = $2, updated_at = now()
WHERE id = $1
RETURNING *;
