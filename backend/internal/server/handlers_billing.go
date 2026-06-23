package server

import (
	"net/http"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

func (s *Server) handleListInvoices(w http.ResponseWriter, r *http.Request) {
	invoices, err := s.q.ListInvoicesByMerchant(r.Context(), sqlc.ListInvoicesByMerchantParams{
		MerchantID: merchantID(r),
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
		Limit:      200,
		Offset:     0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list transactions")
		return
	}
	writeJSON(w, http.StatusOK, txns)
}
