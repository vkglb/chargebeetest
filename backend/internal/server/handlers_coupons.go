package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

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
		Mode:           mode(r),
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
	coupons, err := s.q.ListCouponsByMerchant(r.Context(), sqlc.ListCouponsByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list coupons")
		return
	}
	writeJSON(w, http.StatusOK, coupons)
}

type updateCouponRequest struct {
	Status string `json:"status"` // active | archived
	Reason string `json:"reason"` // expired | campaign_over | revoked | manual
}

// handleUpdateCoupon changes a coupon's status (active ⇄ archived). Archived
// coupons are disabled but kept on record with their redemption history, plus
// when and why they were archived.
func (s *Server) handleUpdateCoupon(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req updateCouponRequest
	if err := decodeJSON(r, &req); err != nil || (req.Status != "active" && req.Status != "archived") {
		writeError(w, http.StatusBadRequest, "status must be 'active' or 'archived'")
		return
	}
	if req.Status == "archived" && req.Reason == "" {
		req.Reason = "manual"
	}
	coupon, err := s.q.SetCouponStatus(r.Context(), sqlc.SetCouponStatusParams{
		ID:         id,
		MerchantID: merchantID(r),
		Status:     req.Status,
		Column4:    req.Reason,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "coupon not found")
		return
	}
	writeJSON(w, http.StatusOK, coupon)
}

// handleDeleteCoupon permanently removes a coupon.
func (s *Server) handleDeleteCoupon(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	n, err := s.q.DeleteCoupon(r.Context(), sqlc.DeleteCouponParams{ID: id, MerchantID: merchantID(r)})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete coupon")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "coupon not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": id})
}
