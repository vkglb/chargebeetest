-- name: CountCustomers :one
SELECT COUNT(*)::bigint AS count
FROM customers WHERE merchant_id = $1 AND mode = $2;

-- name: TotalRevenue :one
SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
FROM transactions WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded';

-- name: AnalyticsMRR :one
SELECT COALESCE(SUM(
  CASE p.interval_unit
    WHEN 'day'   THEN p.amount_minor * 30 / GREATEST(p.interval_count, 1)
    WHEN 'week'  THEN p.amount_minor * 4  / GREATEST(p.interval_count, 1)
    WHEN 'month' THEN p.amount_minor      / GREATEST(p.interval_count, 1)
    WHEN 'year'  THEN p.amount_minor      / (12 * GREATEST(p.interval_count, 1))
    ELSE p.amount_minor
  END * s.quantity), 0)::bigint AS mrr_minor
FROM subscriptions s
JOIN prices p ON p.id = s.price_id
WHERE s.merchant_id = $1 AND s.mode = $2 AND s.status IN ('active', 'trialing');

-- name: RevenueByDay :many
SELECT (date_trunc('day', created_at))::date AS day,
       COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
FROM transactions
WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;

-- name: SubscriptionsByDay :many
SELECT (date_trunc('day', created_at))::date AS day,
       COUNT(*)::bigint AS count
FROM subscriptions
WHERE merchant_id = $1 AND mode = $2
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;

-- name: SubscriptionStatusBreakdown :many
SELECT status, COUNT(*)::bigint AS count
FROM subscriptions
WHERE merchant_id = $1 AND mode = $2
GROUP BY status
ORDER BY count DESC;
