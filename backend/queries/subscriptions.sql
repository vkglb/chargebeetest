-- name: CreateSubscription :one
INSERT INTO subscriptions (
    merchant_id, customer_id, price_id, payment_method_id,
    status, quantity, current_period_start, current_period_end, next_billing_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetSubscription :one
SELECT * FROM subscriptions
WHERE id = $1 AND merchant_id = $2;

-- name: ListSubscriptionsByMerchant :many
SELECT * FROM subscriptions
WHERE merchant_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListDueSubscriptions :many
-- The scheduler cursor: subscriptions due for billing now.
SELECT * FROM subscriptions
WHERE status IN ('active', 'past_due')
  AND next_billing_at IS NOT NULL
  AND next_billing_at <= now()
ORDER BY next_billing_at ASC
LIMIT $1;

-- name: AdvanceSubscriptionPeriod :one
UPDATE subscriptions
SET current_period_start = $2,
    current_period_end = $3,
    next_billing_at = $4,
    status = 'active',
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: SetSubscriptionStatus :one
UPDATE subscriptions
SET status = $2, updated_at = now()
WHERE id = $1 AND merchant_id = $3
RETURNING *;
