-- name: CreateSubscription :one
INSERT INTO subscriptions (
    merchant_id, mode, customer_id, price_id, payment_method_id,
    status, quantity, current_period_start, current_period_end, next_billing_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetSubscription :one
SELECT * FROM subscriptions
WHERE id = $1 AND merchant_id = $2;

-- name: ListSubscriptionsByMerchant :many
SELECT * FROM subscriptions
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: ListDueSubscriptions :many
-- The scheduler cursor: subscriptions due for billing now (across all modes).
SELECT * FROM subscriptions
WHERE status IN ('active', 'past_due')
  AND next_billing_at IS NOT NULL
  AND next_billing_at <= now()
ORDER BY next_billing_at ASC
LIMIT $1;

-- name: ListDueSubscriptionsForMerchant :many
-- Due subscriptions for one merchant + mode (used by the manual "run now" tool).
SELECT * FROM subscriptions
WHERE merchant_id = $1 AND mode = $2
  AND status IN ('active', 'past_due')
  AND next_billing_at IS NOT NULL
  AND next_billing_at <= now()
ORDER BY next_billing_at ASC
LIMIT $3;

-- name: MarkSubscriptionsDueNow :execrows
-- Force every active/past_due subscription for a merchant + mode to be due now,
-- so a manual billing run (or the next scheduler tick) will charge them.
UPDATE subscriptions
SET next_billing_at = now(), updated_at = now()
WHERE merchant_id = $1 AND mode = $2 AND status IN ('active', 'past_due');

-- name: InsertBillingRun :one
-- Record the outcome of a billing pass for the run-history chart.
INSERT INTO billing_runs (merchant_id, mode, source, processed, succeeded, failed)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListBillingRuns :many
-- Recent billing passes for a merchant + mode (newest first).
SELECT * FROM billing_runs
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3;

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
