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

// handleCheckoutAnalytics returns hosted-checkout visit analytics: traffic over
// time, total visitors, country breakdown and conversion vs completed sessions.
func (s *Server) handleCheckoutAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)

	visits, _ := s.q.CountCheckoutVisits(ctx, sqlc.CountCheckoutVisitsParams{MerchantID: mid, Mode: md})
	completed, _ := s.q.CountCompletedCheckouts(ctx, sqlc.CountCompletedCheckoutsParams{MerchantID: mid, Mode: md})

	dayRows, _ := s.q.CheckoutVisitsByDay(ctx, sqlc.CheckoutVisitsByDayParams{MerchantID: mid, Mode: md})
	byDay := make([]pointInt, 0, len(dayRows))
	for _, row := range dayRows {
		byDay = append(byDay, pointInt{Day: dateStr(row.Day), Value: row.Count})
	}

	countryRows, _ := s.q.CheckoutVisitsByCountry(ctx, sqlc.CheckoutVisitsByCountryParams{MerchantID: mid, Mode: md})
	byCountry := make([]map[string]any, 0, len(countryRows))
	for _, row := range countryRows {
		byCountry = append(byCountry, map[string]any{"country": row.Country, "count": row.Count})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total_visits":  visits,
		"completed":     completed,
		"visits_by_day": byDay,
		"by_country":    byCountry,
	})
}

// metricDelta carries a value and its prior-period counterpart so the UI can
// render a +/- percentage with an up/down arrow.
type metricDelta struct {
	Current  int64 `json:"current"`
	Previous int64 `json:"previous"`
}

// handleAnalytics returns summary metrics + a trailing time series for the
// dashboard charts, all scoped to the current merchant + mode. The window and
// currency are driven by the ?period= / ?currency= dashboard filters (see
// parseAnalyticsFilters); with no params it behaves exactly as before — last 30
// days, all currencies.
func (s *Server) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)
	f := parseAnalyticsFilters(r)
	cur := f.currency

	customers, _ := s.q.CountCustomers(ctx, sqlc.CountCustomersParams{MerchantID: mid, Mode: md})
	revenue := s.revenueTotal(ctx, mid, md, cur)
	mrr := s.analyticsMRR(ctx, mid, md, cur)

	// Status breakdown / head-counts are currency-agnostic (a customer has no
	// currency), so they ignore the currency filter by design.
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

	revenueSeries := s.revenueByDay(ctx, mid, md, cur, f.days)
	subSeries := s.subscriptionsByDay(ctx, mid, md, f.days)
	custSeries := s.customersByDay(ctx, mid, md, f.days)
	mrrSeries := s.mrrAddedByDay(ctx, mid, md, cur, f.days)

	// ── Period-over-period deltas ──────────────────────────────
	// Flow metrics (revenue): the selected window vs the equally-long span
	// before it. Stock metrics (MRR, active subs, customers): now vs their
	// value as of the start of the window.
	now := time.Now().UTC()
	curStart := now.AddDate(0, 0, -f.days)
	prevStart := now.AddDate(0, 0, -2*f.days)

	// Intraday gross volume: today (up to now) and yesterday (full day), per hour.
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	yesterdayStart := todayStart.AddDate(0, 0, -1)
	todayHourly := s.revenueByHour(ctx, mid, md, cur, todayStart, now)
	yestHourly := s.revenueByHour(ctx, mid, md, cur, yesterdayStart, todayStart)

	revCur := s.revenueBetween(ctx, mid, md, cur, curStart, now)
	revPrev := s.revenueBetween(ctx, mid, md, cur, prevStart, curStart)

	cutoff := pgTimestamptz(curStart)
	mrrPrev := s.mrrAsOf(ctx, mid, md, cur, curStart)
	custPrev, _ := s.q.CountCustomersAsOf(ctx, sqlc.CountCustomersAsOfParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})
	activePrev, _ := s.q.CountActiveSubscriptionsAsOf(ctx, sqlc.CountActiveSubscriptionsAsOfParams{MerchantID: mid, Mode: md, CreatedAt: cutoff})

	// ── Per-product MRR with growth ────────────────────────────
	products := s.productMRRBreakdown(ctx, mid, md, cur, curStart)

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
		"customers_by_day":     custSeries,
		"mrr_added_by_day":     mrrSeries,
		"status_breakdown":     statusBreakdown,
		"products":             products,
		"today_hourly":         todayHourly,
		"yesterday_hourly":     yestHourly,
		// Echo the resolved filters so the UI can label the deltas and confirm
		// which window/currency the numbers reflect.
		"period":        f.days,
		"currency":      cur,
		"delta_caption": f.caption,
	})
}
