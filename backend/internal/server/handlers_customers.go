package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createCustomerRequest struct {
	Email              string `json:"email"`
	Name               string `json:"name"`
	GatewayCustomerRef string `json:"gateway_customer_ref"`
	Country            string `json:"country"`
}

func (s *Server) handleCreateCustomer(w http.ResponseWriter, r *http.Request) {
	var req createCustomerRequest
	if err := decodeJSON(r, &req); err != nil || req.Email == "" {
		writeError(w, http.StatusBadRequest, "email required")
		return
	}
	customer, err := s.q.CreateCustomer(r.Context(), sqlc.CreateCustomerParams{
		MerchantID:         merchantID(r),
		Mode:               mode(r),
		Email:              req.Email,
		Name:               pgText(req.Name),
		GatewayCustomerRef: pgText(req.GatewayCustomerRef),
		Country:            req.Country,
	})
	if err != nil {
		writeError(w, http.StatusConflict, "could not create customer (email may already exist)")
		return
	}
	writeJSON(w, http.StatusCreated, customer)
}

func (s *Server) handleListCustomers(w http.ResponseWriter, r *http.Request) {
	customers, err := s.q.ListCustomersByMerchant(r.Context(), sqlc.ListCustomersByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Limit:      100,
		Offset:     0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list customers")
		return
	}
	writeJSON(w, http.StatusOK, customers)
}

type updateCustomerRequest struct {
	Name               string `json:"name"`
	GatewayCustomerRef string `json:"gateway_customer_ref"`
	Country            string `json:"country"`
}

// handleUpdateCustomer edits a customer's profile (name / country / gateway
// reference). Email is intentionally immutable here to avoid colliding with the
// (merchant, email) unique constraint. Runs as a raw update so no sqlc
// regeneration is needed.
func (s *Server) handleUpdateCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	var req updateCustomerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := s.pool.Exec(r.Context(), `
		UPDATE customers
		SET name = $1, gateway_customer_ref = $2, country = COALESCE(NULLIF($3, ''), country)
		WHERE id = $4 AND merchant_id = $5 AND mode = $6`,
		pgText(req.Name), pgText(req.GatewayCustomerRef), req.Country, id, merchantID(r), mode(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update customer")
		return
	}
	if ct.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleRequestPaymentMethodUpdate emits a
// customer.payment_method_update_requested event — delivered to any subscribed
// webhook endpoints and to the live dashboard feed. This is the hook a merchant
// integration listens on to email the customer a secure "update your card" link.
func (s *Server) handleRequestPaymentMethodUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	var email string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT email FROM customers WHERE id = $1 AND merchant_id = $2 AND mode = $3`,
		id, merchantID(r), mode(r)).Scan(&email); err != nil {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	s.emitter.Emit(merchantID(r), mode(r), "customer.payment_method_update_requested", map[string]any{
		"customer_id": id,
		"email":       email,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "email": email})
}

type autoCollectionRequest struct {
	Enabled bool `json:"enabled"`
}

// handleSetAutoCollection flips a customer's auto-collection preference, stored
// in the customer's metadata JSONB (no schema change). "on" = invoices are
// charged automatically; "off" = collected manually.
func (s *Server) handleSetAutoCollection(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	var req autoCollectionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	val := "off"
	if req.Enabled {
		val = "on"
	}
	ct, err := s.pool.Exec(r.Context(), `
		UPDATE customers
		SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_collection}', to_jsonb($1::text), true)
		WHERE id = $2 AND merchant_id = $3 AND mode = $4`,
		val, id, merchantID(r), mode(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update auto-collection")
		return
	}
	if ct.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "auto_collection": val})
}

// handleDeleteCustomer removes a customer. Subscriptions and payment methods
// cascade away; invoices/checkout sessions do not, so a customer with billing
// history is protected by the foreign key and reported as a 409 rather than a
// hard failure.
func (s *Server) handleDeleteCustomer(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	ct, err := s.pool.Exec(r.Context(), `
		DELETE FROM customers WHERE id = $1 AND merchant_id = $2 AND mode = $3`,
		id, merchantID(r), mode(r))
	if err != nil {
		writeError(w, http.StatusConflict, "cannot delete: this customer has invoices or other billing records")
		return
	}
	if ct.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
