import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import { slugify } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export default function Signup() {
  const { signup, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avail, setAvail] = useState<Availability>("idle");

  // Normalise to a valid subdomain as the user types.
  const slug = slugify(subdomain);
  const debouncedSlug = useDebounce(slug, 350);

  useEffect(() => {
    let cancelled = false;
    if (!debouncedSlug) {
      setAvail("idle");
      return;
    }
    if (debouncedSlug.length < 3) {
      setAvail("invalid");
      return;
    }
    setAvail("checking");
    api
      .get<{ available: boolean; reason?: string }>(
        `/v1/signup/check-subdomain?subdomain=${encodeURIComponent(debouncedSlug)}`,
      )
      .then((res) => {
        if (cancelled) return;
        setAvail(res.available ? "available" : res.reason === "invalid" ? "invalid" : "taken");
      })
      .catch(() => !cancelled && setAvail("error"));
    return () => {
      cancelled = true;
    };
  }, [debouncedSlug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (slug.length < 3) {
      setError("Choose a subdomain of at least 3 characters");
      return;
    }
    if (avail === "taken") {
      setError("That subdomain is already taken");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await signup(slug, ownerName, email, password);
      navigate("/sites");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Set up your account</h1>
        <p className="sub">Pick your billing site address and create your login</p>

        <label>Business subdomain</label>
        <div className={`subdomain-field ${avail}`}>
          <input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            placeholder="acme"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <span className="subdomain-suffix">.billing.app</span>
        </div>
        <div className="subdomain-hint">
          {avail === "checking" && <span className="muted">Checking availability…</span>}
          {avail === "available" && <span className="ok">✓ {slug}.billing.app is available</span>}
          {avail === "taken" && <span className="bad">✗ {slug}.billing.app is taken</span>}
          {avail === "invalid" && <span className="bad">Use at least 3 letters/numbers</span>}
          {avail === "error" && <span className="muted">Couldn’t check right now</span>}
          {avail === "idle" && (
            <span className="muted">Your unique address, e.g. acme.billing.app</span>
          )}
        </div>

        <label>Account owner name</label>
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
        <div className="subdomain-hint">
          <span className="muted">Default sender name for customer emails.</span>
        </div>

        <label>Work email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Account password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min 8 characters"
          required
        />

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading || avail === "checking"}>
          {loading ? "Creating…" : "Create account"}
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
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
