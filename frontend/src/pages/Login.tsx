import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError, type Me, type TwoFactorSetup } from "../api/client";
import OtpInput from "../components/OtpInput";
import ShieldIcon from "../components/ShieldIcon";

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

    // 1) Authenticate. Only credential/connection errors surface here.
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? "Incorrect email or password." : err.message);
      } else {
        setError("Couldn't reach the server — please try again.");
      }
      setLoading(false);
      return;
    }

    // 2) Signed in. Pick the 2FA step — but never let this block sign-in: if
    //    the 2FA endpoints are unavailable, continue to the dashboard.
    try {
      const me = await api.get<Me>("/v1/me");
      if (me.two_factor_enabled) {
        setOtp("");
        setStep("verify");
      } else {
        const s = await api.post<TwoFactorSetup>("/v1/me/2fa/setup");
        setSetup(s);
        setOtp("");
        setStep("setup");
      }
    } catch {
      navigate("/sites");
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
      <div className="otp-caption">6-digit code</div>
      <OtpInput value={otp} onChange={setOtp} autoFocus />
      {error && <div className="error">{error}</div>}
      <button className="btn tfa-submit" disabled={loading}>
        {loading ? "Verifying…" : (
          <>
            {cta} <span aria-hidden="true">→</span>
          </>
        )}
      </button>
    </form>
  );

  // ── Enrollment (2FA not yet enabled) ──────────────────────────────────────
  if (step === "setup" && setup) {
    return (
      <div className="auth-wrap">
        <div className="auth-card tfa-card">
          <div className="tfa-head">
            <div className="tfa-icon">
              <ShieldIcon />
            </div>
            <h1>Protect your account</h1>
            <p className="sub">
              Add two-step verification with an authenticator app (Google Authenticator,
              Authy, 1Password…).
            </p>
          </div>

          <div className="tfa-step">
            <div className="tfa-step-head">
              <span className="tfa-step-n">1</span>Scan this QR code
            </div>
            <div className="tfa-qr">
              <QRCodeSVG value={setup.otpauth_url} size={176} marginSize={2} />
            </div>
          </div>

          <div className="tfa-step">
            <div className="tfa-step-head">
              <span className="tfa-step-n">2</span>Or enter this key manually
            </div>
            <div className="tfa-key">
              <span className="mono">{prettySecret(setup.secret)}</span>
              <button type="button" className="btn-ghost btn-sm tfa-copy" onClick={copySecret}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="tfa-step">
            <div className="tfa-step-head">
              <span className="tfa-step-n">3</span>Enter the code it shows
            </div>
            {otpField(onEnable, "Verify & enable")}
          </div>

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
          <div className="tfa-head">
            <div className="tfa-icon">
              <ShieldIcon />
            </div>
            <h1>Two-step verification</h1>
            <p className="sub">Enter the code from your authenticator app to continue.</p>
          </div>
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
