import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export default function Login() {
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/sites");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to your billing dashboard</p>

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input
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
