package server

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// metricCard is one Chargebee-style dashboard tile: a headline value, its
// prior-period counterpart (for the delta badge) and a daily series for the
// sparkline. Value units depend on Format: "money" = minor units, "int" = a
// raw count, "percent" = hundredths of a percent (343 → 3.43%).
type metricCard struct {
	Key    string     `json:"key"`
	Label  string     `json:"label"`
	Format string     `json:"format"`
	Value  int64      `json:"value"`
	Prev   int64      `json:"prev"`
	Series []pointInt `json:"series"`
}

// planRow is one plan's live subscription count for the "Total Subscriptions"
// breakdown.
type planRow struct {
	Plan  string `json:"plan"`
	Count int64  `json:"count"`
}

// cancelReasonPredicate splits cancellations into involuntary (dunning/fraud,
// i.e. the merchant didn't choose to lose them) vs voluntary (everything else).
// The returned SQL fragment references the subscriptions row as `s`.
func cancelReasonPredicate(involuntary bool) string {
	if involuntary {
		return "s.cancel_reason IN ('payment_failure', 'fraudulent')"
	}
	return "s.cancel_reason NOT IN ('payment_failure', 'fraudulent')"
}

// pctHundredths returns churned/base as hundredths of a percent (so the UI can
// render two decimals without floats crossing the wire). Guards a zero base.
func pctHundredths(churned, base int64) int64 {
	if base <= 0 {
		return 0
	}
	return churned * 10000 / base
}

// scalar runs a single-value aggregate query, returning 0 on any error so one
// missing metric degrades gracefully instead of failing the whole dashboard.
func (s *Server) scalar(ctx context.Context, sql string, args ...any) int64 {
	var v int64
	_ = s.pool.QueryRow(ctx, sql, args...).Scan(&v)
	return v
}

// handleAnalyticsMetrics serves the extended Chargebee-style metric tiles plus
// the per-plan subscription breakdown, honouring the same ?period=/?currency=
// filters as the main analytics endpoint.
func (s *Server) handleAnalyticsMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)
	f := parseAnalyticsFilters(r)
	cur := f.currency

	now := time.Now().UTC()
	curStart := now.AddDate(0, 0, -f.days)
	prevStart := now.AddDate(0, 0, -2*f.days)

	cards := []metricCard{
		{
			Key: "payments", Label: "Total Payments", Format: "money",
			Value:  s.revenueBetween(ctx, mid, md, cur, curStart, now),
			Prev:   s.revenueBetween(ctx, mid, md, cur, prevStart, curStart),
			Series: s.revenueByDay(ctx, mid, md, cur, f.days),
		},
		// Refunds aren't modelled in the schema yet, so this is honestly zero
		// until a refunds feature lands (see the dashboard's empty state).
		{Key: "refunds", Label: "Total Refunds", Format: "money", Series: []pointInt{}},
		{
			Key: "mrr", Label: "Total MRR", Format: "money",
			Value:  s.analyticsMRR(ctx, mid, md, cur),
			Prev:   s.mrrAsOf(ctx, mid, md, cur, curStart),
			Series: s.mrrAddedByDay(ctx, mid, md, cur, f.days),
		},
		{
			Key: "cmrr", Label: "Total CMRR", Format: "money",
			Value:  s.committedMRR(ctx, mid, md, cur),
			Prev:   s.committedMRRAsOf(ctx, mid, md, cur, curStart),
			Series: s.committedMRRAddedByDay(ctx, mid, md, cur, f.days),
		},
		{
			Key: "voluntary_cancellation_mrr", Label: "Voluntary Cancellation MRR", Format: "money",
			Value:  s.cancelledMRRBetween(ctx, mid, md, cur, false, curStart, now),
			Prev:   s.cancelledMRRBetween(ctx, mid, md, cur, false, prevStart, curStart),
			Series: s.cancelledMRRSeries(ctx, mid, md, cur, false, f.days),
		},
		{
			Key: "involuntary_cancellation_mrr", Label: "Involuntary Cancellation MRR", Format: "money",
			Value:  s.cancelledMRRBetween(ctx, mid, md, cur, true, curStart, now),
			Prev:   s.cancelledMRRBetween(ctx, mid, md, cur, true, prevStart, curStart),
			Series: s.cancelledMRRSeries(ctx, mid, md, cur, true, f.days),
		},
		{
			Key: "signups", Label: "Total Signups", Format: "int",
			Value:  s.countCustomersBetween(ctx, mid, md, curStart, now),
			Prev:   s.countCustomersBetween(ctx, mid, md, prevStart, curStart),
			Series: s.customersByDay(ctx, mid, md, f.days),
		},
		{
			Key: "activations", Label: "Total Activations", Format: "int",
			Value:  s.countSubscriptionsBetween(ctx, mid, md, cur, curStart, now),
			Prev:   s.countSubscriptionsBetween(ctx, mid, md, cur, prevStart, curStart),
			Series: s.subscriptionsByDayCur(ctx, mid, md, cur, f.days),
		},
	}

	// Churn rate: subscriptions cancelled in the window over the active base at
	// the window's start.
	churnCur := s.cancelCountBetween(ctx, mid, md, cur, curStart, now)
	baseCur := s.activeSubsAsOf(ctx, mid, md, cur, curStart)
	churnPrev := s.cancelCountBetween(ctx, mid, md, cur, prevStart, curStart)
	basePrev := s.activeSubsAsOf(ctx, mid, md, cur, prevStart)
	cards = append(cards,
		metricCard{
			Key: "churn_rate", Label: "Total Subscription Churn Rate", Format: "percent",
			Value:  pctHundredths(churnCur, baseCur),
			Prev:   pctHundredths(churnPrev, basePrev),
			Series: s.cancelCountSeries(ctx, mid, md, cur, f.days),
		},
		// Credit notes aren't modelled yet — zero until the feature exists.
		metricCard{Key: "credit_notes", Label: "Total Credit Notes Amount", Format: "money", Series: []pointInt{}},
	)

	total, plans := s.subscriptionsByPlan(ctx, mid, md, cur)

	writeJSON(w, http.StatusOK, map[string]any{
		"cards":                 cards,
		"subscriptions_by_plan": map[string]any{"total": total, "plans": plans},
		"currency":              cur,
	})
}

// ── Committed MRR (excludes subscriptions set to cancel at period end) ────────

func (s *Server) committedMRR(ctx context.Context, mid uuid.UUID, md, cur string) int64 {
	return s.scalar(ctx, `
		SELECT COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND s.cancel_at_period_end = false
		  AND ($3 = '' OR p.currency = $3)`, mid, md, cur)
}

func (s *Server) committedMRRAsOf(ctx context.Context, mid uuid.UUID, md, cur string, cutoff time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND s.cancel_at_period_end = false
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at <= $4`, mid, md, cur, cutoff)
}

func (s *Server) committedMRRAddedByDay(ctx context.Context, mid uuid.UUID, md, cur string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', s.created_at))::date, 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint AS amount_minor
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND s.cancel_at_period_end = false
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

// ── Cancellation MRR (voluntary vs involuntary) ──────────────────────────────

func (s *Server) cancelledMRRBetween(ctx context.Context, mid uuid.UUID, md, cur string, involuntary bool, start, end time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status = 'cancelled' AND s.cancelled_at IS NOT NULL
		  AND (`+cancelReasonPredicate(involuntary)+`)
		  AND ($3 = '' OR p.currency = $3)
		  AND s.cancelled_at >= $4 AND s.cancelled_at < $5`, mid, md, cur, start, end)
}

func (s *Server) cancelledMRRSeries(ctx context.Context, mid uuid.UUID, md, cur string, involuntary bool, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', s.cancelled_at))::date, 'YYYY-MM-DD') AS day,
		       COALESCE(SUM(`+mrrCase+` * s.quantity), 0)::bigint AS amount_minor
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status = 'cancelled' AND s.cancelled_at IS NOT NULL
		  AND (`+cancelReasonPredicate(involuntary)+`)
		  AND ($3 = '' OR p.currency = $3)
		  AND s.cancelled_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

// ── Signups / activations / churn counts ─────────────────────────────────────

func (s *Server) countCustomersBetween(ctx context.Context, mid uuid.UUID, md string, start, end time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COUNT(*)::bigint
		FROM customers
		WHERE merchant_id = $1 AND mode = $2
		  AND created_at >= $3 AND created_at < $4`, mid, md, start, end)
}

func (s *Server) countSubscriptionsBetween(ctx context.Context, mid uuid.UUID, md, cur string, start, end time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COUNT(*)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at >= $4 AND s.created_at < $5`, mid, md, cur, start, end)
}

func (s *Server) subscriptionsByDayCur(ctx context.Context, mid uuid.UUID, md, cur string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', s.created_at))::date, 'YYYY-MM-DD') AS day,
		       COUNT(*)::bigint AS count
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

func (s *Server) cancelCountBetween(ctx context.Context, mid uuid.UUID, md, cur string, start, end time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COUNT(*)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status = 'cancelled' AND s.cancelled_at IS NOT NULL
		  AND ($3 = '' OR p.currency = $3)
		  AND s.cancelled_at >= $4 AND s.cancelled_at < $5`, mid, md, cur, start, end)
}

func (s *Server) cancelCountSeries(ctx context.Context, mid uuid.UUID, md, cur string, days int) []pointInt {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char((date_trunc('day', s.cancelled_at))::date, 'YYYY-MM-DD') AS day,
		       COUNT(*)::bigint AS count
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status = 'cancelled' AND s.cancelled_at IS NOT NULL
		  AND ($3 = '' OR p.currency = $3)
		  AND s.cancelled_at >= now() - make_interval(days => $4::int)
		GROUP BY 1 ORDER BY 1`, mid, md, cur, days)
	return scanPoints(rows, err)
}

// activeSubsAsOf approximates the active/trialing base that existed at `cutoff`
// (same approximation the main analytics deltas use), scoped to one currency.
func (s *Server) activeSubsAsOf(ctx context.Context, mid uuid.UUID, md, cur string, cutoff time.Time) int64 {
	return s.scalar(ctx, `
		SELECT COUNT(*)::bigint
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND s.status IN ('active', 'trialing')
		  AND ($3 = '' OR p.currency = $3)
		  AND s.created_at <= $4`, mid, md, cur, cutoff)
}

// ── Subscriptions by plan (product · price) ──────────────────────────────────

func (s *Server) subscriptionsByPlan(ctx context.Context, mid uuid.UUID, md, cur string) (int64, []planRow) {
	plans := []planRow{}
	var total int64
	rows, err := s.pool.Query(ctx, `
		SELECT pr.name
		         || CASE WHEN COALESCE(p.nickname, '') <> '' THEN ' · ' || p.nickname ELSE '' END AS plan,
		       COUNT(*)::bigint AS count
		FROM subscriptions s
		JOIN prices p ON p.id = s.price_id
		JOIN products pr ON pr.id = p.product_id
		WHERE s.merchant_id = $1 AND s.mode = $2
		  AND ($3 = '' OR p.currency = $3)
		GROUP BY plan
		ORDER BY count DESC`, mid, md, cur)
	if err != nil {
		return 0, plans
	}
	defer rows.Close()
	for rows.Next() {
		var pr planRow
		if err := rows.Scan(&pr.Plan, &pr.Count); err != nil {
			return total, plans
		}
		plans = append(plans, pr)
		total += pr.Count
	}
	return total, plans
}
