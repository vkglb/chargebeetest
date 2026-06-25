package server

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/billing"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createSubscriptionRequest struct {
	CustomerID      string `json:"customer_id"`
	PriceID         string `json:"price_id"`
	PaymentMethodID string `json:"payment_method_id"`
	Quantity        int32  `json:"quantity"`
}

func (s *Server) handleCreateSubscription(w http.ResponseWriter, r *http.Request) {
	var req createSubscriptionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	mid := merchantID(r)

	customerID, err := uuid.Parse(req.CustomerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer_id")
		return
	}
	priceID, err := uuid.Parse(req.PriceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid price_id")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	price, err := s.q.GetPrice(r.Context(), sqlc.GetPriceParams{ID: priceID, MerchantID: mid})
	if err != nil {
		writeError(w, http.StatusBadRequest, "price not found")
		return
	}

	now := time.Now().UTC()
	status := "active"
	nextBilling := now // due immediately; scheduler charges on next tick

	// Honour a trial: defer first charge to the end of the trial window.
	if price.TrialDays > 0 {
		status = "trialing"
		nextBilling = now.AddDate(0, 0, int(price.TrialDays))
	}

	periodStart, periodEnd, err := billing.PeriodBounds(now, price.IntervalUnit, int(price.IntervalCount))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid price interval")
		return
	}

	var pmID = pgUUID(uuid.Nil)
	if req.PaymentMethodID != "" {
		parsed, err := uuid.Parse(req.PaymentMethodID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid payment_method_id")
			return
		}
		pmID = pgUUID(parsed)
	}

	sub, err := s.q.CreateSubscription(r.Context(), sqlc.CreateSubscriptionParams{
		MerchantID:         mid,
		Mode:               mode(r),
		CustomerID:         customerID,
		PriceID:            priceID,
		PaymentMethodID:    pmID,
		Status:             status,
		Quantity:           req.Quantity,
		CurrentPeriodStart: timePtr(periodStart),
		CurrentPeriodEnd:   timePtr(periodEnd),
		NextBillingAt:      timePtr(nextBilling),
	})
	if err != nil {
		s.logger.Error("create subscription", "error", err)
		writeError(w, http.StatusInternalServerError, "could not create subscription")
		return
	}

	s.emitter.Emit(mid, mode(r), "subscription.created", map[string]any{
		"subscription_id": sub.ID, "customer_id": sub.CustomerID, "price_id": sub.PriceID, "status": sub.Status,
	})
	writeJSON(w, http.StatusCreated, sub)
}

func (s *Server) handleListSubscriptions(w http.ResponseWriter, r *http.Request) {
	subs, err := s.q.ListSubscriptionsByMerchant(r.Context(), sqlc.ListSubscriptionsByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Limit:      100,
		Offset:     0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list subscriptions")
		return
	}
	writeJSON(w, http.StatusOK, subs)
}
