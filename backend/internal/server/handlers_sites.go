package server

import "net/http"

// handleListSites returns the sites (merchants) the logged-in user can access.
// Today that's their single merchant; the shape is a list so multi-site orgs can
// be added later without changing the client contract.
func (s *Server) handleListSites(w http.ResponseWriter, r *http.Request) {
	m, err := s.q.GetMerchant(r.Context(), merchantID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load site")
		return
	}
	writeJSON(w, http.StatusOK, []map[string]any{
		{"id": m.ID, "name": m.Name, "status": m.Status},
	})
}
