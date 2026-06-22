import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export default function Signup() {
  const { signup, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [merchantName, setMerchantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await signup(merchantName, email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Create your business</h1>
        <p className="sub">Start billing your customers in minutes</p>

        <label>Business name</label>
        <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} required />

        <label>Work email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min 8 characters"
          required
        />

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              loginAsGuest();
              navigate("/");
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
