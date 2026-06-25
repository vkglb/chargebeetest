package server

import (
	"net/http"
	"time"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type pointInt struct {
	Day   string `json:"day"`
	Value int64  `json:"value"`
}

// metricDelta carries a value and its prior-period counterpart so the UI can
// render a +/- percentage with an up/down arrow.
type metricDelta struct {
	Current  int64 `json:"current"`
	Previous int64 `json:"previous"`
}

// handleAnalytics returns summary metrics + 30-day time series for the dashboard
// charts, all scoped to the current merchant + mode.
func (s *Server) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)

	customers, _ := s.q.CountCustomers(ctx, sqlc.CountCustomersParams{MerchantID: mid, Mode: md})
	revenue, _ := s.q.TotalRevenue(ctx, sqlc.TotalRevenueParams{MerchantID: mid, Mode: md})
	mrr, _ := s.q.AnalyticsMRR(ctx, sqlc.AnalyticsMRRParams{MerchantID: mid, Mode: md})

	statusRows, _ := s.q.SubscriptionStatusBreakdown(ctx, sqlc.SubscriptionStatusBreakdownParams{MerchantID: mid, Mode: md})
	statusBreakdown := make([]map[string]any, 0, len(statusRows))
	var totalSubs, activeSubs int64
	for _, row := range statusRows {
		statusBreakdown = append(statusBreakdown, map[string]any{"status": row.Status, "count": row.Count})
		totalSubs += row.Count
		if row.Status == "active" {
			activeSubs = row.Count
		}
	}

	revRows, _ := s.q.RevenueByDay(ctx, sqlc.RevenueByDayParams{MerchantID: mid, Mode: md})
	revenueSeries := make([]pointInt, 0, len(revRows))
	for _, row := range revRows {
		revenueSeries = append(revenueSeries, pointInt{Day: dateStr(row.Day), Value: row.AmountMinor})
	}

	subRows, _ := s.q.SubscriptionsByDay(ctx, sqlc.SubscriptionsByDayParams{MerchantID: mid, Mode: md})
	subSeries := make([]pointInt, 0, len(subRows))
	for _, row := range subRows {
		subSeries = append(subSeries, pointInt{Day: dateStr(row.Day), Value: row.Count})
	}

	// ── Period-over-period deltas ──────────────────────────────
	// Flow metrics (revenue): last 30d vs the 30d before. Stock metrics
	// (MRR, active subs, customers): now vs their value as of 30 days ago.
	now := time.Now().UTC()
	curStart := now.AddDate(0, 0, -30)
	prevStart := now.AddDate(0, 0, -60)

	revCur, _ := s.q.RevenueBetween(ctx, sqlc.RevenueBetweenParams{
		MerchantID: mid, Mode: md, CreatedAt: pgTimestamptz(curStart), CreatedAt_2: pgTimestamptz(now)})
	revPrev, _ := s.q.RevenueBetween(ctx, sqlc.RevenueBetweenParams{
		MerchantID: mid, Mode: md, CreatedAt: pgTimestamptz(prevStart), CreatedAt_2: pgTimestamptz(curStart)})

	cutoff := pgTimestamptz(curStart)
	mrrPrev, _ := s.q.MRRAsOf(ctx, sqlc.MRRAsOfParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})
	custPrev, _ := s.q.CountCustomersAsOf(ctx, sqlc.CountCustomersAsOfParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})
	activePrev, _ := s.q.CountActiveSubscriptionsAsOf(ctx, sqlc.CountActiveSubscriptionsAsOfParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})

	// ── Per-product MRR with growth ────────────────────────────
	prodRows, _ := s.q.ProductMRRBreakdown(ctx, sqlc.ProductMRRBreakdownParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})
	products := make([]map[string]any, 0, len(prodRows))
	for _, row := range prodRows {
		products = append(products, map[string]any{
			"product_id":           row.ProductID,
			"name":                 row.ProductName,
			"active_subscriptions": row.ActiveSubscriptions,
			"mrr_minor":            row.MrrMinor,
			"prev_mrr_minor":       row.PrevMrrMinor,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"summary": map[string]any{
			"customers":            customers,
			"active_subscriptions": activeSubs,
			"total_subscriptions":  totalSubs,
			"total_revenue_minor":  revenue,
			"mrr_minor":            mrr,
		},
		"deltas": map[string]metricDelta{
			"revenue":              {Current: revCur, Previous: revPrev},
			"mrr":                  {Current: mrr, Previous: mrrPrev},
			"customers":            {Current: customers, Previous: custPrev},
			"active_subscriptions": {Current: activeSubs, Previous: activePrev},
		},
		"revenue_by_day":       revenueSeries,
		"subscriptions_by_day": subSeries,
		"status_breakdown":     statusBreakdown,
		"products":             products,
	})
}
