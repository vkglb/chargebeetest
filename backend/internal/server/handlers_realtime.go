package server

import "net/http"

// handleRealtime upgrades to a WebSocket that streams live events for the
// authenticated merchant + mode. Auth + mode come from query params because the
// browser WebSocket API can't set request headers.
//
//	GET /v1/realtime?token=<jwt>&mode=test|live
func (s *Server) handleRealtime(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, "token required")
		return
	}
	claims, err := s.tokens.Verify(token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid token")
		return
	}
	md := normalizeMode(r.URL.Query().Get("mode"))
	s.hub.Serve(w, r, claims.MerchantID, md)
}
