-- name: CreateCoupon :one
INSERT INTO coupons (merchant_id, code, discount_type, value, max_redemptions, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListCouponsByMerchant :many
SELECT * FROM coupons
WHERE merchant_id = $1
ORDER BY created_at DESC;

-- name: GetCouponByCode :one
SELECT * FROM coupons
WHERE merchant_id = $1 AND code = $2;
