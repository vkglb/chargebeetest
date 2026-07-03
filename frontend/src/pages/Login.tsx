import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";

type Step = "login" | "2fa_prompt" | "2fa_verify";

export default function Login() {
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const secretKey = "JBSW Y3DP EHPK 3PXP";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      const is2faEnabled = localStorage.getItem("chargeebee_2fa_enabled") === "true";
      if (is2faEnabled) {
        setStep("2fa_verify");
      } else {
        setStep("2fa_prompt");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Please enter a valid 6-digit verification code.");
      return;
    }
    
    if (step === "2fa_prompt") {
      try {
        await api.post("/v1/me/2fa", { enabled: true });
        localStorage.setItem("chargeebee_2fa_enabled", "true");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save 2FA to backend");
        return;
      }
    }
    
    navigate("/sites");
  }

  function handleCopy() {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "2fa_prompt") {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={onVerifyOtp} style={{ maxWidth: "440px" }}>
          <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            🛡️ Secure your account
          </h1>
          <p className="sub" style={{ marginBottom: 20 }}>
            Set up 2-step verification to add an extra layer of security to your billing dashboard.
          </p>

          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <svg
              width="130"
              height="130"
              viewBox="0 0 100 100"
              style={{
                background: "#ffffff",
                padding: 10,
                borderRadius: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {/* Outer boundary markers */}
              <path d="M10,10 h25 v10 h-15 v15 h-10 z" fill="#111827" />
              <path d="M65,10 h25 v25 h-10 v-15 h-15 z" fill="#111827" />
              <path d="M10,65 h10 v15 h15 v10 h-25 z" fill="#111827" />
              {/* Internal mock blocks */}
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

          <div style={{ background: "var(--panel-2)", padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Manual entry key:</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 14, fontWeight: "bold", letterSpacing: 1, color: "var(--text)" }}>
                {secretKey}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={handleCopy}
                style={{ width: "auto", padding: "4px 8px", fontSize: 11 }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <label htmlFor="otp-input" style={{ fontWeight: 600 }}>Enter 6-digit Authenticator Code</label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            autoFocus
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 4, fontWeight: "bold" }}
          />

          {error && <div className="error" style={{ textAlign: "center" }}>{error}</div>}

          <button className="btn" type="submit">
            Verify and enable
          </button>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button
              type="button"
              className="link-btn"
              onClick={() => navigate("/sites")}
              style={{ fontSize: 13, textDecoration: "none" }}
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "2fa_verify") {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={onVerifyOtp}>
          <h1>Two-Factor Verification</h1>
          <p className="sub">Enter the verification code from your authenticator app.</p>

          <label htmlFor="otp-input" style={{ fontWeight: 600 }}>Verification Code</label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            autoFocus
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 4, fontWeight: "bold" }}
          />

          {error && <div className="error" style={{ textAlign: "center" }}>{error}</div>}

          <button className="btn" type="submit">
            Verify
          </button>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setStep("login");
                setOtp("");
                setError("");
              }}
              style={{ fontSize: 13, textDecoration: "none" }}
            >
              Back to login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your billing dashboard</p>

        <label htmlFor="email-input">Email</label>
        <input id="email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="password-input">Password</label>
        <input
          id="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              loginAsGuest();
              navigate("/sites");
            }}
          >
            Explore as guest (demo, no backend)
          </button>
        </div>

        <p className="auth-switch">
          New here? <Link to="/signup">Create a business account</Link>
        </p>
      </form>
    </div>
  );
}
