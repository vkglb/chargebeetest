-- name: CreateProduct :one
INSERT INTO products (merchant_id, mode, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListProductsByMerchant :many
SELECT * FROM products
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC;

-- name: CreatePrice :one
INSERT INTO prices (
    merchant_id, mode, product_id, nickname, amount_minor, currency,
    interval_unit, interval_count, trial_days
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetPrice :one
SELECT * FROM prices
WHERE id = $1 AND merchant_id = $2;

-- name: ListPricesByMerchant :many
SELECT * FROM prices
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC;
