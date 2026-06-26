package server

import (
	"net/http"
	"time"
)

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

// handleEmitTest emits a sample event to the current merchant + mode so the user
// can confirm the live-activity stream is working from the dashboard.
func (s *Server) handleEmitTest(w http.ResponseWriter, r *http.Request) {
	s.emitter.Emit(merchantID(r), mode(r), "test.ping", map[string]any{
		"message": "Test event",
		"at":      time.Now().UTC(),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "emitted"})
}
