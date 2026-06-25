package server

import (
	"net/http"

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
