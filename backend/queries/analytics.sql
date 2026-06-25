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

-- ── Period-over-period comparison helpers ──────────────────────────

-- name: RevenueBetween :one
-- Succeeded revenue inside a [start, end) window (a flow metric).
SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total
FROM transactions
WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
  AND created_at >= $3 AND created_at < $4;

-- name: RevenueByHourBetween :many
-- Succeeded revenue per hour-of-day inside a [start, end) window — for the
-- intraday "today vs yesterday" gross-volume chart.
SELECT date_part('hour', created_at)::int AS hour,
       COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
FROM transactions
WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
  AND created_at >= $3 AND created_at < $4
GROUP BY 1
ORDER BY 1;

-- name: CountCustomersAsOf :one
-- Total customers that existed at a point in time (a stock metric).
SELECT COUNT(*)::bigint AS count
FROM customers
WHERE merchant_id = $1 AND mode = $2 AND created_at <= $3;

-- name: CountActiveSubscriptionsAsOf :one
-- Active/trialing subscriptions that existed at a point in time.
SELECT COUNT(*)::bigint AS count
FROM subscriptions
WHERE merchant_id = $1 AND mode = $2
  AND status IN ('active', 'trialing') AND created_at <= $3;

-- name: MRRAsOf :one
-- Recurring revenue from active/trialing subscriptions that existed at a cutoff.
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
WHERE s.merchant_id = $1 AND s.mode = $2
  AND s.status IN ('active', 'trialing') AND s.created_at <= $3;

-- name: ProductMRRBreakdown :many
-- Per-product current MRR vs MRR as of `cutoff` ($3), for growth arrows.
SELECT pr.id   AS product_id,
       pr.name AS product_name,
       COUNT(*) FILTER (WHERE s.status IN ('active', 'trialing'))::bigint AS active_subscriptions,
       COALESCE(SUM(
         CASE WHEN s.status IN ('active', 'trialing') THEN
           CASE p.interval_unit
             WHEN 'day'   THEN p.amount_minor * 30 / GREATEST(p.interval_count, 1)
             WHEN 'week'  THEN p.amount_minor * 4  / GREATEST(p.interval_count, 1)
             WHEN 'month' THEN p.amount_minor      / GREATEST(p.interval_count, 1)
             WHEN 'year'  THEN p.amount_minor      / (12 * GREATEST(p.interval_count, 1))
             ELSE p.amount_minor
           END * s.quantity
         ELSE 0 END), 0)::bigint AS mrr_minor,
       COALESCE(SUM(
         CASE WHEN s.status IN ('active', 'trialing') AND s.created_at <= $3 THEN
           CASE p.interval_unit
             WHEN 'day'   THEN p.amount_minor * 30 / GREATEST(p.interval_count, 1)
             WHEN 'week'  THEN p.amount_minor * 4  / GREATEST(p.interval_count, 1)
             WHEN 'month' THEN p.amount_minor      / GREATEST(p.interval_count, 1)
             WHEN 'year'  THEN p.amount_minor      / (12 * GREATEST(p.interval_count, 1))
             ELSE p.amount_minor
           END * s.quantity
         ELSE 0 END), 0)::bigint AS prev_mrr_minor
FROM products pr
JOIN prices p ON p.product_id = pr.id
JOIN subscriptions s ON s.price_id = p.id
WHERE pr.merchant_id = $1 AND pr.mode = $2
GROUP BY pr.id, pr.name
ORDER BY mrr_minor DESC;
