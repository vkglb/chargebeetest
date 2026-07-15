package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// analyticsFilters captures the dashboard's period + currency controls.
//
//   - days is the trailing window applied to every time series and to the
//     period-over-period deltas (the current window is [now-days, now); the
//     comparison window is the equally-long span before it).
//   - currency ("" = all currencies) filters the money metrics — revenue and
//     MRR — to a single ISO currency. Head-count metrics (customers, active
//     subscriptions) are currency-agnostic and are never filtered by it.
type analyticsFilters struct {
	days     int
	currency string
	// caption is a human-readable label for the delta badges, e.g. "vs last 3
	// months", so the UI can describe the comparison window it selected.
	caption string
}

// parseAnalyticsFilters reads ?period= and ?currency= off the request, falling
// back to the historical default (last 30 days, all currencies).
func parseAnalyticsFilters(r *http.Request) analyticsFilters {
	f := analyticsFilters{days: 30, caption: "vs last 30d"}
	switch r.URL.Query().Get("period") {
	case "3m":
		f.days, f.caption = 90, "vs last 3 months"
	case "6m":
		f.days, f.caption = 180, "vs last 6 months"
	case "12m":
		f.days, f.caption = 365, "vs last 12 months"
	}
	if c := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("currency"))); c == "USD" || c == "EUR" {
		f.currency = c
	}
	return f
}

// mrrCase is the shared price→monthly-recurring-revenue normalisation, mirroring
// the sqlc query in queries/analytics.sql so filtered MRR matches the unfiltered
// numbers exactly. It references the joined `prices` row as `p` and the
// `subscriptions` row as `s`.
const mrrCase = `CASE p.interval_unit
    WHEN 'day'   THEN p.amount_minor * 30 / GREATEST(p.interval_count, 1)
    WHEN 'week'  THEN p.amount_minor * 4  / GREATEST(p.interval_count, 1)
    WHEN 'month' THEN p.amount_minor      / GREATEST(p.interval_count, 1)
    WHEN 'year'  THEN p.amount_minor      / (12 * GREATEST(p.interval_count, 1))
    ELSE p.amount_minor
  END`

// scanPoints collects (day, value) rows into the pointInt series shape. On any
// error it returns whatever was read so far — the dashboard degrades to a
// partial/empty chart rather than failing the whole request.
func scanPoints(rows pgx.Rows, err error) []pointInt {
	out := []pointInt{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p pointInt
		if err := rows.Scan(&p.Day, &p.Value); err != nil {
			return out
		}
		out = append(out, p)
	}
	return out
}

// revenueTotal is all-time succeeded revenue for the merchant/mode, optionally
// scoped to one currency.
func (s *Server) revenueTotal(ctx context.Context, mid uuid.UUID, md, cur string) int64 {
	var v int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_minor), 0)::bigint
		FROM transactions
		WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
		  AND ($3 = '' OR currency = $3)`, mid, md, cur).Scan(&v)
	return v
}

// revenueBetween is succeeded revenue inside [start, end), optionally one currency.
func (s *Server) revenueBetween(ctx context.Context, mid uuid.UUID, md, cur string, start, end time.Time) int64 {
	var v int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_minor), 0)::bigint
		FROM transactions
		WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
		  AND ($3 = '' OR currency = $3)
		  AND created_at >= $4 AND created_at < $5`, mid, md, cur, start, end).Scan(&v)
	return v
}

// revenueByDay is succeeded revenue per day over the trailing window.
func (s *Server) revenueByDay(ctx context.Context, mid uuid.UUID, md, cur string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', created_at))::date, 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
		FROM transactions
		WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
		  AND ($3 = '' OR currency = $3)
		  AND created_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

// revenueByHour is succeeded revenue per hour-of-day inside [start, end) — for
// the intraday "today vs yesterday" gross-volume chart.
func (s *Server) revenueByHour(ctx context.Context, mid uuid.UUID, md, cur string, start, end time.Time) []map[string]any {
	out := []map[string]any{}
	rows, err := s.pool.Query(ctx, `
		SELECT date_part('hour', created_at)::int AS hour,
		       COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
		FROM transactions
		WHERE merchant_id = $1 AND mode = $2 AND status = 'succeeded'
		  AND ($3 = '' OR currency = $3)
		  AND created_at >= $4 AND created_at < $5
		GROUP BY 1 ORDER BY 1`, mid, md, cur, start, end)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var hour int32
		var value int64
		if err := rows.Scan(&hour, &value); err != nil {
			return out
		}
		out = append(out, map[string]any{"hour": hour, "value": value})
	}
	return out
}

// analyticsMRR is current MRR from active/trialing subscriptions, optionally
// scoped to one price currency.
func (s *Server) analyticsMRR(ctx context.Context, mid uuid.UUID, md, cur string) int64 {
	var v int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND ($3 = '' OR p.currency = $3)`, mid, md, cur).Scan(&v)
	return v
}

// mrrAsOf is MRR from subscriptions that already existed at `cutoff` — the
// "previous" side of the MRR delta.
func (s *Server) mrrAsOf(ctx context.Context, mid uuid.UUID, md, cur string, cutoff time.Time) int64 {
	var v int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at <= $4`, mid, md, cur, cutoff).Scan(&v)
	return v
}

// mrrAddedByDay is MRR added per day by new active/trialing subscriptions over
// the trailing window (for the MRR sparkline).
func (s *Server) mrrAddedByDay(ctx context.Context, mid uuid.UUID, md, cur string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', s.created_at))::date, 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint AS amount_minor
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

// subscriptionsByDay is new subscriptions per day over the trailing window.
func (s *Server) subscriptionsByDay(ctx context.Context, mid uuid.UUID, md string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', created_at))::date, 'YYYY-MM-DD') AS day,
		       COUNT(*)::bigint AS count
		FROM subscriptions
		WHERE merchant_id = $1 AND mode = $2
		  AND created_at >= now() - make_interval(days => $3::int)
		GROUP BY 1 ORDER BY 1`, mid, md, days)
	return scanPoints(rows, err)
}

// customersByDay is new customers per day over the trailing window.
func (s *Server) customersByDay(ctx context.Context, mid uuid.UUID, md string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', created_at))::date, 'YYYY-MM-DD') AS day,
		       COUNT(*)::bigint AS count
		FROM customers
		WHERE merchant_id = $1 AND mode = $2
		  AND created_at >= now() - make_interval(days => $3::int)
		GROUP BY 1 ORDER BY 1`, mid, md, days)
	return scanPoints(rows, err)
}

// productMRRBreakdown is per-product current MRR vs MRR as of `cutoff` (for the
// growth arrows), optionally scoped to one price currency.
func (s *Server) productMRRBreakdown(ctx context.Context, mid uuid.UUID, md, cur string, cutoff time.Time) []map[string]any {
	out := []map[string]any{}
	rows, err := s.pool.Query(ctx, `
		SELECT pr.id AS product_id, pr.name AS product_name,
		       COUNT(*) FILTER (WHERE s.status IN ('active', 'trialing'))::bigint AS active_subscriptions,
		       COALESCE(SUM(CASE WHEN s.status IN ('active', 'trialing')
		         THEN `+mrrCase+` * s.quantity ELSE 0 END), 0)::bigint AS mrr_minor,
		       COALESCE(SUM(CASE WHEN s.status IN ('active', 'trialing') AND s.created_at <= $4
		         THEN `+mrrCase+` * s.quantity ELSE 0 END), 0)::bigint AS prev_mrr_minor
		FROM products pr
		JOIN prices p ON p.product_id = pr.id
		JOIN subscriptions s ON s.price_id = p.id
		WHERE pr.merchant_id = $1 AND pr.mode = $2
		  AND ($3 = '' OR p.currency = $3)
		GROUP BY pr.id, pr.name
		ORDER BY mrr_minor DESC`, mid, md, cur, cutoff)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var name string
		var active, mrr, prev int64
		if err := rows.Scan(&id, &name, &active, &mrr, &prev); err != nil {
			return out
		}
		out = append(out, map[string]any{
			"product_id":           id,
			"name":                 name,
			"active_subscriptions": active,
			"mrr_minor":            mrr,
			"prev_mrr_minor":       prev,
		})
	}
	return out
}
