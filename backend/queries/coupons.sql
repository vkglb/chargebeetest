-- name: CreateCoupon :one
INSERT INTO coupons (merchant_id, mode, code, discount_type, value, max_redemptions, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListCouponsByMerchant :many
SELECT * FROM coupons
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC;

-- name: GetCouponByCode :one
SELECT * FROM coupons
WHERE merchant_id = $1 AND mode = $2 AND code = $3;

-- name: SetCouponStatus :one
-- Archive (disable) or re-activate a coupon, recording when/why on archive.
UPDATE coupons
SET status = $3,
    archived_at = CASE WHEN $3 = 'archived' THEN now() ELSE NULL END,
    archive_reason = CASE WHEN $3 = 'archived' THEN $4::text ELSE '' END
WHERE id = $1 AND merchant_id = $2
RETURNING *;

-- name: DeleteCoupon :execrows
-- Permanently remove a coupon.
DELETE FROM coupons
WHERE id = $1 AND merchant_id = $2;
