package server

import (
	"net/http"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

func (s *Server) handleListInvoices(w http.ResponseWriter, r *http.Request) {
	invoices, err := s.q.ListInvoicesByMerchant(r.Context(), sqlc.ListInvoicesByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Limit:      200,
		Offset:     0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list invoices")
		return
	}
	writeJSON(w, http.StatusOK, invoices)
}

func (s *Server) handleListTransactions(w http.ResponseWriter, r *http.Request) {
	txns, err := s.q.ListTransactionsByMerchant(r.Context(), sqlc.ListTransactionsByMerchantParams{
		MerchantID: merchantID(r),
		Mode:       mode(r),
		Limit:      200,
		Offset:     0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list transactions")
		return
	}
	writeJSON(w, http.StatusOK, txns)
}

// handleBillNow runs a billing pass for the current merchant + mode on demand,
// so the scheduler logic can be exercised without waiting for the tick.
//
// It forces every active/past_due subscription to be due now, ensures a gateway
// is connected (falling back to the sandbox simulator), then bills them. The
// response summarises what happened; the dashboard refetches to show the new
// invoices, transactions and status changes.
func (s *Server) handleBillNow(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)

	// Ensure charges can resolve a gateway. If the merchant hasn't connected one,
	// connect the built-in sandbox simulator so the run still succeeds.
	if _, err := s.q.GetPrimaryGatewayAccount(ctx, sqlc.GetPrimaryGatewayAccountParams{MerchantID: mid, Mode: md}); err != nil {
		if _, err := s.q.UpsertGatewayAccount(ctx, sqlc.UpsertGatewayAccountParams{
			MerchantID:           mid,
			Mode:                 md,
			Provider:             "sandbox",
			AccountRef:           pgText("sandbox-simulator"),
			EncryptedCredentials: []byte("sandbox"),
		}); err != nil {
			s.logger.Error("bill-now: ensure gateway", "error", err)
		}
	}

	markedDue, err := s.q.MarkSubscriptionsDueNow(ctx, sqlc.MarkSubscriptionsDueNowParams{MerchantID: mid, Mode: md})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not mark subscriptions due")
		return
	}

	sum, err := s.billing.RunForMerchant(ctx, mid, md)
	if err != nil {
		s.logger.Error("bill-now: run", "error", err)
		writeError(w, http.StatusInternalServerError, "billing run failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"marked_due": markedDue,
		"processed":  sum.Processed,
		"succeeded":  sum.Succeeded,
		"failed":     sum.Failed,
		"mode":       md,
	})
}
