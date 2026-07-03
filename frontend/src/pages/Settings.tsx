import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import OtpInput from "../components/OtpInput";
import { useAuth } from "../auth/AuthContext";
import { resetTour } from "../components/Tour";
import { api, getMode, type TwoFactorSetup } from "../api/client";
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
  const [setup2fa, setSetup2fa] = useState<TwoFactorSetup | null>(null);
  const [busy2fa, setBusy2fa] = useState(false);

  const prettySecret = (k: string) => (k.match(/.{1,4}/g) ?? [k]).join(" ");

  async function startEnable() {
    setOtp("");
    setError2fa("");
    setBusy2fa(true);
    try {
      const s = await api.post<TwoFactorSetup>("/v1/me/2fa/setup");
      setSetup2fa(s);
      setShow2faSetup(true);
    } catch (e) {
      setError2fa("Could not start 2FA setup: " + (e as Error).message);
    } finally {
      setBusy2fa(false);
    }
  }

  async function confirmEnable() {
    if (!/^\d{6}$/.test(otp)) {
      setError2fa("Please enter a valid 6-digit code.");
      return;
    }
    setBusy2fa(true);
    try {
      await api.post("/v1/me/2fa/enable", { code: otp });
      localStorage.setItem("chargeebee_2fa_enabled", "true");
      setIs2faEnabled(true);
      setShow2faSetup(false);
    } catch (e) {
      setError2fa((e as Error).message);
    } finally {
      setBusy2fa(false);
    }
  }

  async function disable2fa() {
    setBusy2fa(true);
    try {
      await api.post("/v1/me/2fa/disable");
      localStorage.removeItem("chargeebee_2fa_enabled");
      setIs2faEnabled(false);
    } catch (e) {
      setError2fa("Failed to disable 2FA: " + (e as Error).message);
    } finally {
      setBusy2fa(false);
    }
  }

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
              disabled={busy2fa}
              onClick={disable2fa}
            >
              Disable 2FA
            </button>
          ) : (
            <button className="btn btn-sm" style={{ width: "auto" }} disabled={busy2fa} onClick={startEnable}>
              {busy2fa ? "Preparing…" : "Enable 2FA"}
            </button>
          )}
        </div>
        {error2fa && !show2faSetup && <div className="error" style={{ marginTop: 10 }}>{error2fa}</div>}
      </div>

      {show2faSetup && setup2fa && (
        <Modal title="Enable two-step verification" onClose={() => setShow2faSetup(false)}>
          <div className="tfa-modal">
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
              Scan the QR code with your authenticator app, or enter the key manually.
            </p>

            <div className="tfa-qr" style={{ margin: "0 auto 16px" }}>
              <QRCodeSVG value={setup2fa.otpauth_url} size={168} marginSize={2} />
            </div>

            <div className="tfa-key" style={{ marginBottom: 16 }}>
              <span className="mono">{prettySecret(setup2fa.secret)}</span>
              <button
                type="button"
                className="btn-ghost btn-sm tfa-copy"
                onClick={() => {
                  navigator.clipboard.writeText(setup2fa.secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="otp-caption">Enter the 6-digit code</div>
            <OtpInput value={otp} onChange={setOtp} />

            {error2fa && <div className="error">{error2fa}</div>}

            <div className="modal-actions">
              <button className="btn-ghost btn-sm" style={{ width: "auto" }} onClick={() => setShow2faSetup(false)}>
                Cancel
              </button>
              <button className="btn btn-sm" disabled={busy2fa} onClick={confirmEnable}>
                {busy2fa ? "Verifying…" : "Verify & enable"}
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
