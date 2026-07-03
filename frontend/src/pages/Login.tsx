import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, type Me, type TwoFactorSetup } from "../api/client";

type Step = "login" | "setup" | "verify";

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
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // Ask the server (authoritatively) whether this account has 2FA on.
      const me = await api.get<Me>("/v1/me").catch(() => null);
      if (me?.two_factor_enabled) {
        setOtp("");
        setStep("verify");
      } else {
        // Offer enrollment: fetch a fresh secret + QR.
        const s = await api.post<TwoFactorSetup>("/v1/me/2fa/setup");
        setSetup(s);
        setOtp("");
        setStep("setup");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onEnable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/v1/me/2fa/enable", { code: otp.trim() });
      localStorage.setItem("chargeebee_2fa_enabled", "true");
      navigate("/sites");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enable 2FA");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/v1/me/2fa/verify", { code: otp.trim() });
      navigate("/sites");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  const prettySecret = (s: string) => (s.match(/.{1,4}/g) ?? [s]).join(" ");
  function copySecret() {
    if (!setup) return;
    navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const otpField = (onSubmitHandler: (e: React.FormEvent) => void, cta: string) => (
    <form onSubmit={onSubmitHandler}>
      <label htmlFor="otp-input" className="tfa-code-label">
        6-digit code
      </label>
      <input
        id="otp-input"
        className="tfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        placeholder="000000"
        required
        autoFocus
      />
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={loading}>
        {loading ? "Verifying…" : cta}
      </button>
    </form>
  );

  // ── Enrollment (2FA not yet enabled) ──────────────────────────────────────
  if (step === "setup" && setup) {
    return (
      <div className="auth-wrap">
        <div className="auth-card tfa-card">
          <div className="tfa-icon">🛡️</div>
          <h1>Protect your account</h1>
          <p className="sub">
            Add two-step verification with an authenticator app (Google Authenticator,
            Authy, 1Password…).
          </p>

          <ol className="tfa-steps">
            <li>
              <span className="tfa-step-n">1</span>
              <div>
                <div className="tfa-step-title">Scan this QR code</div>
                <div className="tfa-qr">
                  <QRCodeSVG value={setup.otpauth_url} size={168} marginSize={2} />
                </div>
              </div>
            </li>
            <li>
              <span className="tfa-step-n">2</span>
              <div>
                <div className="tfa-step-title">Or enter this key manually</div>
                <div className="tfa-key">
                  <span className="mono">{prettySecret(setup.secret)}</span>
                  <button type="button" className="btn-ghost btn-sm tfa-copy" onClick={copySecret}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </li>
            <li>
              <span className="tfa-step-n">3</span>
              <div style={{ flex: 1 }}>
                <div className="tfa-step-title">Enter the code it shows</div>
                {otpField(onEnable, "Verify & enable")}
              </div>
            </li>
          </ol>

          <button type="button" className="link-btn tfa-skip" onClick={() => navigate("/sites")}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ── Login-time verification (2FA already enabled) ─────────────────────────
  if (step === "verify") {
    return (
      <div className="auth-wrap">
        <div className="auth-card tfa-card">
          <div className="tfa-icon">🔐</div>
          <h1>Two-step verification</h1>
          <p className="sub">Enter the code from your authenticator app to continue.</p>
          {otpField(onVerify, "Verify")}
          <button
            type="button"
            className="link-btn tfa-skip"
            onClick={() => {
              setStep("login");
              setOtp("");
              setError("");
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Credentials ───────────────────────────────────────────────────────────
  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your billing dashboard</p>

        <label htmlFor="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

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
