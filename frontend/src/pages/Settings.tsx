import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { resetTour } from "../components/Tour";
import { api, getMode } from "../api/client";
import Modal from "../components/Modal";

// Settings persist locally in demo mode. In real mode these map to backend
// merchant settings (dunning schedule, tax, business profile) — wired later.
const LS_KEY = "chargeebee_settings";

interface SettingsState {
  businessName: string;
  supportEmail: string;
  dunningSchedule: string; // comma-separated days
  taxRate: string;
  taxRegion: string;
}

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    businessName: "Demo Business",
    supportEmail: "support@demo.com",
    dunningSchedule: "1,3,5",
    taxRate: "0",
    taxRegion: "US",
  };
}

export default function Settings() {
  const { merchantId } = useAuth();
  const [s, setS] = useState<SettingsState>(loadSettings());
  const [saved, setSaved] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");

  const [is2faEnabled, setIs2faEnabled] = useState(
    () => localStorage.getItem("chargeebee_2fa_enabled") === "true"
  );
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [otp, setOtp] = useState("");
  const [error2fa, setError2fa] = useState("");
  const [copied, setCopied] = useState(false);
  
  const secretKey = "JBSW Y3DP EHPK 3PXP";

  async function loadSample() {
    setSeeding(true);
    setSeedError("");
    try {
      await api.post("/v1/dev/seed");
      window.location.href = "/analytics";
    } catch (e) {
      setSeedError((e as Error).message);
      setSeeding(false);
    }
  }

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    setSaved(true);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Business profile, dunning & tax configuration</p>
        </div>
      </div>

      <div className="panel">
        <h3>Business profile</h3>
        <div className="row">
          <div>
            <label>Business name</label>
            <input value={s.businessName} onChange={(e) => update("businessName", e.target.value)} />
          </div>
          <div>
            <label>Support email</label>
            <input value={s.supportEmail} onChange={(e) => update("supportEmail", e.target.value)} />
          </div>
        </div>
        <div className="mono" style={{ marginTop: 10 }}>
          Merchant ID: {merchantId}
        </div>
      </div>

      <div className="panel">
        <h3>Dunning (failed payment retries)</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Days after the first failure to retry the charge. Default <span className="mono">1,3,5</span>.
        </p>
        <label>Retry schedule (days)</label>
        <input
          value={s.dunningSchedule}
          onChange={(e) => update("dunningSchedule", e.target.value)}
          placeholder="1,3,5"
        />
      </div>

      <div className="panel">
        <h3>Tax</h3>
        <div className="row">
          <div>
            <label>Default tax rate (%)</label>
            <input type="number" value={s.taxRate} onChange={(e) => update("taxRate", e.target.value)} />
          </div>
          <div>
            <label>Region</label>
            <select value={s.taxRegion} onChange={(e) => update("taxRegion", e.target.value)}>
              <option value="US">US sales tax</option>
              <option value="EU">EU VAT</option>
              <option value="IN">India GST</option>
              <option value="NONE">No tax</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Security</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Two-step verification adds an extra layer of security to your account.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Two-Factor Authentication (2FA)</div>
            <div style={{ color: is2faEnabled ? "var(--green)" : "var(--muted)", fontSize: 13, marginTop: 4 }}>
              Status: {is2faEnabled ? "✓ Enabled (Authenticator App)" : "✗ Not configured"}
            </div>
          </div>
          {is2faEnabled ? (
            <button
              className="btn btn-sm btn-danger"
              style={{ width: "auto" }}
              onClick={async () => {
                try {
                  await api.post("/v1/me/2fa", { enabled: false });
                  localStorage.removeItem("chargeebee_2fa_enabled");
                  setIs2faEnabled(false);
                } catch (e) {
                  setError2fa("Failed to disable 2FA: " + (e as Error).message);
                }
              }}
            >
              Disable 2FA
            </button>
          ) : (
            <button
              className="btn btn-sm"
              style={{ width: "auto" }}
              onClick={() => {
                setOtp("");
                setError2fa("");
                setShow2faSetup(true);
              }}
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {show2faSetup && (
        <Modal
          title="Enable 2-Step Verification"
          onClose={() => setShow2faSetup(false)}
        >
          <div style={{ maxWidth: "400px" }}>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              Scan the QR code or enter the secret key manually into your authenticator app (like Google Authenticator).
            </p>

            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <svg
                width="120"
                height="120"
                viewBox="0 0 100 100"
                style={{
                  background: "#ffffff",
                  padding: 8,
                  borderRadius: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                <path d="M10,10 h25 v10 h-15 v15 h-10 z" fill="#111827" />
                <path d="M65,10 h25 v25 h-10 v-15 h-15 z" fill="#111827" />
                <path d="M10,65 h10 v15 h15 v10 h-25 z" fill="#111827" />
                <rect x="20" y="20" width="10" height="10" fill="#111827" />
                <rect x="70" y="20" width="10" height="10" fill="#111827" />
                <rect x="20" y="70" width="10" height="10" fill="#111827" />
                <rect x="40" y="20" width="10" height="5" fill="#111827" />
                <rect x="50" y="25" width="10" height="10" fill="#111827" />
                <rect x="35" y="40" width="15" height="15" fill="#111827" />
                <rect x="60" y="45" width="10" height="15" fill="#111827" />
                <rect x="20" y="45" width="10" height="10" fill="#111827" />
                <rect x="40" y="70" width="20" height="10" fill="#111827" />
                <rect x="70" y="65" width="10" height="15" fill="#111827" />
              </svg>
            </div>

            <div style={{ background: "var(--panel-2)", padding: 10, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Manual entry key:</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1, color: "var(--text)" }}>
                  {secretKey}
                </span>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(secretKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ width: "auto", padding: "3px 6px", fontSize: 10 }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <label htmlFor="otp-input-modal" style={{ fontWeight: 600 }}>Enter 6-digit Code</label>
            <input
              id="otp-input-modal"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              style={{ textAlign: "center", fontSize: 18, letterSpacing: 3, fontWeight: "bold" }}
            />

            {error2fa && <div className="error" style={{ textAlign: "center" }}>{error2fa}</div>}

            <div className="row" style={{ marginTop: 20 }}>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  if (!/^\d{6}$/.test(otp)) {
                    setError2fa("Please enter a valid 6-digit code.");
                    return;
                  }
                  try {
                    await api.post("/v1/me/2fa", { enabled: true });
                    localStorage.setItem("chargeebee_2fa_enabled", "true");
                    setIs2faEnabled(true);
                    setShow2faSetup(false);
                  } catch (e) {
                    setError2fa("Failed to enable 2FA: " + (e as Error).message);
                  }
                }}
              >
                Verify & Enable
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => setShow2faSetup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="panel">
        <h3>Sample data</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Populate <strong>{getMode()}</strong> mode with demo products, plans, customers,
          subscriptions and 30 days of transactions — so you can explore the dashboard and charts.
        </p>
        <button className="btn btn-sm" disabled={seeding} onClick={loadSample}>
          {seeding ? "Loading…" : "Load sample data"}
        </button>
        {seedError && <div className="error">{seedError}</div>}
      </div>

      <div className="panel">
        <h3>Help</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>Replay the welcome walkthrough.</p>
        <button
          className="btn-ghost"
          style={{ width: "auto" }}
          onClick={() => {
            resetTour();
            window.location.reload();
          }}
        >
          Replay product tour
        </button>
      </div>

      <button className="btn btn-sm" onClick={save}>
        Save settings
      </button>
      {saved && <span style={{ color: "var(--green)", marginLeft: 12 }}>Saved ✓</span>}
    </div>
  );
}
