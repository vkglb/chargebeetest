package server

import (
	"net/http"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type pointInt struct {
	Day   string `json:"day"`
	Value int64  `json:"value"`
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

	writeJSON(w, http.StatusOK, map[string]any{
		"summary": map[string]any{
			"customers":            customers,
			"active_subscriptions": activeSubs,
			"total_subscriptions":  totalSubs,
			"total_revenue_minor":  revenue,
			"mrr_minor":            mrr,
		},
		"revenue_by_day":       revenueSeries,
		"subscriptions_by_day": subSeries,
		"status_breakdown":     statusBreakdown,
	})
}
