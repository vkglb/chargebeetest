-- name: CreateMerchant :one
INSERT INTO merchants (name)
VALUES ($1)
RETURNING *;

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
