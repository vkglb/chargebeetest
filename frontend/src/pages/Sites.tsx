import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setMode, type Site, type Mode } from "../api/client";
import { useAuth } from "../auth/AuthContext";

// Chargebee-style "Select a site" screen shown after login. Each site can be
// entered in Test or Live mode.
export default function Sites() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Site[]>("/v1/sites")
      .then((s) => setSites(s ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function enter(m: Mode) {
    setMode(m);
    navigate("/");
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="sites-wrap">
      <div className="sites-head">
        <div className="brand" style={{ padding: 0 }}>
          ⚡ Billing
        </div>
        <button className="link-btn" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <h1 className="sites-title">Select a site</h1>

      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="sites-list">
          {sites.map((site) => (
            <div className="site-card" key={site.id}>
              <div>
                <div className="site-name">{site.name}</div>
                <div className="site-sub mono">{site.id.slice(0, 12)}…</div>
              </div>
              <div className="site-actions">
                <button className="btn-ghost site-btn" onClick={() => enter("test")}>
                  Test Site ›
                </button>
                <button className="btn site-btn" style={{ margin: 0 }} onClick={() => enter("live")}>
                  Go Live ›
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
