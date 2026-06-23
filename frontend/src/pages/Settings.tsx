import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

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

      <button className="btn btn-sm" onClick={save}>
        Save settings
      </button>
      {saved && <span style={{ color: "var(--green)", marginLeft: 12 }}>Saved ✓</span>}
    </div>
  );
}
