-- name: CreateCheckoutSession :one
INSERT INTO checkout_sessions (
    merchant_id, mode, price_id, quantity, customer_email, success_url, cancel_url, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetCheckoutSession :one
SELECT * FROM checkout_sessions
WHERE id = $1;

-- name: GetCheckoutSessionDetails :one
-- Joined view for the public hosted page: session + plan + merchant + product.
SELECT
    cs.id, cs.status, cs.quantity, cs.customer_email, cs.success_url, cs.cancel_url, cs.expires_at,
    m.name AS merchant_name,
    p.id AS price_id, p.amount_minor, p.currency, p.interval_unit, p.interval_count, p.trial_days,
    pr.name AS product_name
FROM checkout_sessions cs
JOIN merchants m ON m.id = cs.merchant_id
JOIN prices p ON p.id = cs.price_id
JOIN products pr ON pr.id = p.product_id
WHERE cs.id = $1;

-- name: CompleteCheckoutSession :one
UPDATE checkout_sessions
SET status = 'completed',
    customer_id = $2,
    subscription_id = $3,
    completed_at = now()
WHERE id = $1
RETURNING *;
