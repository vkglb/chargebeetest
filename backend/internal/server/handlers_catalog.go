package server

import (
	"net/http"

	"github.com/google/uuid"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createProductRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req createProductRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	product, err := s.q.CreateProduct(r.Context(), sqlc.CreateProductParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Name:       req.Name,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create product")
		return
	}
	writeJSON(w, http.StatusCreated, product)
}

func (s *Server) handleListProducts(w http.ResponseWriter, r *http.Request) {
	products, err := s.q.ListProductsByMerchant(r.Context(), sqlc.ListProductsByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list products")
		return
	}
	writeJSON(w, http.StatusOK, products)
}

type createPriceRequest struct {
	ProductID     string `json:"product_id"`
	Nickname      string `json:"nickname"`
	AmountMinor   int64  `json:"amount_minor"`
	Currency      string `json:"currency"`
	IntervalUnit  string `json:"interval_unit"`
	IntervalCount int32  `json:"interval_count"`
	TrialDays     int32  `json:"trial_days"`
}

func (s *Server) handleCreatePrice(w http.ResponseWriter, r *http.Request) {
	var req createPriceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	productID, err := uuid.Parse(req.ProductID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product_id")
		return
	}
	if req.AmountMinor <= 0 || len(req.Currency) != 3 || req.IntervalUnit == "" {
		writeError(w, http.StatusBadRequest, "amount_minor, currency (3-letter) and interval_unit required")
		return
	}
	if req.IntervalCount <= 0 {
		req.IntervalCount = 1
	}

	price, err := s.q.CreatePrice(r.Context(), sqlc.CreatePriceParams{
		MerchantID:    merchantID(r),
		Mode:          mode(r),
		ProductID:     productID,
		Nickname:      pgText(req.Nickname),
		AmountMinor:   req.AmountMinor,
		Currency:      req.Currency,
		IntervalUnit:  req.IntervalUnit,
		IntervalCount: req.IntervalCount,
		TrialDays:     req.TrialDays,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create price")
		return
	}
	writeJSON(w, http.StatusCreated, price)
}

func (s *Server) handleListPrices(w http.ResponseWriter, r *http.Request) {
	prices, err := s.q.ListPricesByMerchant(r.Context(), sqlc.ListPricesByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list prices")
		return
	}
	writeJSON(w, http.StatusOK, prices)
}
