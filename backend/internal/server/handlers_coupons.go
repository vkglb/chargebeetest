package server

import (
	"net/http"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

type createCouponRequest struct {
	Code           string `json:"code"`
	DiscountType   string `json:"discount_type"` // percentage | fixed
	Value          int64  `json:"value"`         // percent (0-100) or minor units
	MaxRedemptions int32  `json:"max_redemptions"`
}

func (s *Server) handleCreateCoupon(w http.ResponseWriter, r *http.Request) {
	var req createCouponRequest
	if err := decodeJSON(r, &req); err != nil || req.Code == "" {
		writeError(w, http.StatusBadRequest, "code required")
		return
	}
	if req.DiscountType != "percentage" && req.DiscountType != "fixed" {
		writeError(w, http.StatusBadRequest, "discount_type must be 'percentage' or 'fixed'")
		return
	}
	coupon, err := s.q.CreateCoupon(r.Context(), sqlc.CreateCouponParams{
		MerchantID:     merchantID(r),
		Code:           req.Code,
		DiscountType:   req.DiscountType,
		Value:          req.Value,
		MaxRedemptions: pgInt4(req.MaxRedemptions, req.MaxRedemptions > 0),
		ExpiresAt:      nil,
	})
	if err != nil {
		writeError(w, http.StatusConflict, "could not create coupon (code may already exist)")
		return
	}
	writeJSON(w, http.StatusCreated, coupon)
}

func (s *Server) handleListCoupons(w http.ResponseWriter, r *http.Request) {
	coupons, err := s.q.ListCouponsByMerchant(r.Context(), merchantID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list coupons")
		return
	}
	writeJSON(w, http.StatusOK, coupons)
}
