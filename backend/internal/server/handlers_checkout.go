package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/billing"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/gateway"
)

// checkoutCountry derives the visitor country (ISO-2) from common CDN/proxy geo
// headers, if present. Empty when unknown (e.g. no geo header on the host).
func checkoutCountry(r *http.Request) string {
	for _, h := range []string{"Cf-Ipcountry", "X-Vercel-Ip-Country", "X-Country"} {
		if v := r.Header.Get(h); v != "" && v != "XX" {
			return strings.ToUpper(v)
		}
	}
	return ""
}

type createCheckoutRequest struct {
	PriceID       string `json:"price_id"`
	Quantity      int32  `json:"quantity"`
	CustomerEmail string `json:"customer_email"`
	SuccessURL    string `json:"success_url"`
	CancelURL     string `json:"cancel_url"`
}

type checkoutSessionResponse struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	Status    string `json:"status"`
	ExpiresAt string `json:"expires_at"`
}

// handleCreateCheckoutSession is the merchant-facing API: create a hosted
// checkout and get back a URL to redirect the customer to. Auth via JWT or key.
func (s *Server) handleCreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	var req createCheckoutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	priceID, err := uuid.Parse(req.PriceID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "valid price_id required")
		return
	}
	if req.SuccessURL == "" {
		writeError(w, http.StatusBadRequest, "success_url required")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	// Validate the price belongs to this merchant.
	if _, err := s.q.GetPrice(r.Context(), sqlc.GetPriceParams{ID: priceID, MerchantID: merchantID(r)}); err != nil {
		writeError(w, http.StatusBadRequest, "price not found for this merchant")
		return
	}

	session, err := s.q.CreateCheckoutSession(r.Context(), sqlc.CreateCheckoutSessionParams{
		MerchantID:    merchantID(r),
		Mode:          mode(r),
		PriceID:       priceID,
		Quantity:      req.Quantity,
		CustomerEmail: pgText(req.CustomerEmail),
		SuccessUrl:    req.SuccessURL,
		CancelUrl:     pgText(req.CancelURL),
		ExpiresAt:     pgTimestamptz(time.Now().Add(24 * time.Hour)),
	})
	if err != nil {
		s.logger.Error("create checkout session", "error", err)
		writeError(w, http.StatusInternalServerError, "could not create checkout session")
		return
	}

	writeJSON(w, http.StatusCreated, checkoutSessionResponse{
		ID:        session.ID.String(),
		URL:       s.checkoutBaseURL + "/checkout/" + session.ID.String(),
		Status:    session.Status,
		ExpiresAt: session.ExpiresAt.Time.Format(time.RFC3339),
	})
}

// handleGetCheckoutSession serves the public display data for the hosted page.
func (s *Server) handleGetCheckoutSession(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := s.q.GetCheckoutSessionDetails(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "checkout session not found")
		return
	}

	// Record the page visit for hosted-checkout analytics (best-effort).
	if sess, err := s.q.GetCheckoutSession(r.Context(), id); err == nil {
		_ = s.q.InsertCheckoutVisit(r.Context(), sqlc.InsertCheckoutVisitParams{
			MerchantID: sess.MerchantID, Mode: sess.Mode, SessionID: pgUUID(id),
			Country: checkoutCountry(r), CreatedAt: pgTimestamptz(time.Now().UTC()),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":             d.ID,
		"status":         d.Status,
		"merchant_name":  d.MerchantName,
		"product_name":   d.ProductName,
		"amount_minor":   d.AmountMinor,
		"currency":       d.Currency,
		"interval_unit":  d.IntervalUnit,
		"interval_count": d.IntervalCount,
		"trial_days":     d.TrialDays,
		"quantity":       d.Quantity,
		"customer_email": d.CustomerEmail.String,
		"success_url":    d.SuccessUrl,
		"cancel_url":     d.CancelUrl.String,
	})
}

// handleCheckoutSetupIntent bootstraps real card vaulting for the hosted page.
// If the session's merchant has a card-vaulting gateway connected (Stripe), it
// creates a gateway customer + an off-session SetupIntent and returns the
// publishable key + client secret the browser confirms the card against. When
// no such gateway is connected it reports simulated=true so the page falls back
// to the demo capture flow.
func (s *Server) handleCheckoutSetupIntent(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	session, err := s.q.GetCheckoutSession(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "checkout session not found")
		return
	}

	acct, err := s.q.GetGatewayAccount(r.Context(), sqlc.GetGatewayAccountParams{
		MerchantID: session.MerchantID,
		Mode:       session.Mode,
		Provider:   "stripe",
	})
	if err != nil || acct.PublishableKey == "" {
		writeJSON(w, http.StatusOK, map[string]any{"simulated": true})
		return
	}
	gw, err := s.gateways.Get(acct.Provider)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"simulated": true})
		return
	}
	vaulter, ok := gw.(gateway.CardVaulting)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"simulated": true})
		return
	}

	creds := gateway.Credentials{
		Provider:   acct.Provider,
		AccountRef: acct.AccountRef.String,
		SecretKey:  string(acct.EncryptedCredentials),
	}
	custRef, err := gw.CreateCustomer(r.Context(), creds, gateway.CustomerParams{
		Email: session.CustomerEmail.String,
	})
	if err != nil {
		s.logger.Error("checkout setup intent: create customer", "error", err)
		writeError(w, http.StatusBadGateway, "could not start payment setup")
		return
	}
	clientSecret, err := vaulter.CreateSetupIntent(r.Context(), creds, custRef)
	if err != nil {
		s.logger.Error("checkout setup intent: create setup intent", "error", err)
		writeError(w, http.StatusBadGateway, "could not start payment setup")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"simulated":            false,
		"publishable_key":      acct.PublishableKey,
		"client_secret":        clientSecret,
		"gateway_customer_ref": custRef,
	})
}

type completeCheckoutRequest struct {
	Email              string `json:"email"`
	Name               string `json:"name"`
	PaymentMethodID    string `json:"payment_method_ref"`   // gateway pm token (pm_…) from client-side vaulting
	GatewayCustomerRef string `json:"gateway_customer_ref"` // gateway customer (cus_…) the card was vaulted on
}

// handleCompleteCheckoutSession is called by the hosted page when the customer
// submits payment. It creates the customer + saved card + subscription, then
// marks the session complete and returns the redirect URL.
func (s *Server) handleCompleteCheckoutSession(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req completeCheckoutRequest
	if err := decodeJSON(r, &req); err != nil || req.Email == "" {
		writeError(w, http.StatusBadRequest, "email required")
		return
	}

	session, err := s.q.GetCheckoutSession(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "checkout session not found")
		return
	}
	if session.Status != "open" {
		writeError(w, http.StatusConflict, "checkout session already "+session.Status)
		return
	}

	ctx := r.Context()
	price, err := s.q.GetPrice(ctx, sqlc.GetPriceParams{ID: session.PriceID, MerchantID: session.MerchantID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "price lookup failed")
		return
	}

	// Create (or reuse) the customer (in the session's mode). When the card was
	// vaulted via a real gateway, gateway_customer_ref is the gateway's customer
	// id (cus_…) so off-session dunning charges resolve to the right account.
	customer, err := s.q.CreateCustomer(ctx, sqlc.CreateCustomerParams{
		MerchantID:         session.MerchantID,
		Mode:               session.Mode,
		Email:              req.Email,
		Name:               pgText(req.Name),
		GatewayCustomerRef: pgText(req.GatewayCustomerRef),
	})
	if err != nil {
		writeError(w, http.StatusConflict, "could not create customer")
		return
	}

	// Save the tokenized payment method (card stays in the gateway vault).
	var pmID = pgUUID(uuid.Nil)
	if req.PaymentMethodID != "" {
		pm, err := s.q.CreatePaymentMethod(ctx, sqlc.CreatePaymentMethodParams{
			MerchantID:   session.MerchantID,
			Mode:         session.Mode,
			CustomerID:   customer.ID,
			GatewayPmRef: req.PaymentMethodID,
			Brand:        pgText("card"),
			Last4:        pgText(""),
			ExpMonth:     pgInt4(0, false),
			ExpYear:      pgInt4(0, false),
			IsDefault:    true,
		})
		if err == nil {
			pmID = pgUUID(pm.ID)
		}
	}

	now := time.Now().UTC()
	status := "active"
	nextBilling := now
	if price.TrialDays > 0 {
		status = "trialing"
		nextBilling = now.AddDate(0, 0, int(price.TrialDays))
	}
	periodStart, periodEnd, err := billing.PeriodBounds(now, price.IntervalUnit, int(price.IntervalCount))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid price interval")
		return
	}

	sub, err := s.q.CreateSubscription(ctx, sqlc.CreateSubscriptionParams{
		MerchantID:         session.MerchantID,
		Mode:               session.Mode,
		CustomerID:         customer.ID,
		PriceID:            session.PriceID,
		PaymentMethodID:    pmID,
		Status:             status,
		Quantity:           session.Quantity,
		CurrentPeriodStart: timePtr(periodStart),
		CurrentPeriodEnd:   timePtr(periodEnd),
		NextBillingAt:      timePtr(nextBilling),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create subscription")
		return
	}

	if _, err := s.q.CompleteCheckoutSession(ctx, sqlc.CompleteCheckoutSessionParams{
		ID:             id,
		CustomerID:     pgUUID(customer.ID),
		SubscriptionID: pgUUID(sub.ID),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not finalize session")
		return
	}

	s.emitter.Emit(session.MerchantID, session.Mode, "subscription.created", map[string]any{
		"subscription_id": sub.ID, "customer_id": customer.ID, "price_id": session.PriceID, "via": "checkout",
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "completed",
		"subscription_id": sub.ID,
		"redirect_url":    session.SuccessUrl,
	})
}
