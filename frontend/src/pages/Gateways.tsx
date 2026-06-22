import { useEffect, useState } from "react";
import { api, type GatewayAccount } from "../api/client";
import { formatDate } from "../lib/format";

// The catalogue of gateways the platform can integrate. Only Stripe is wired in
// v1; the rest are shown as "coming soon" to signal the multi-gateway roadmap.
const CATALOG = [
  { provider: "stripe", name: "Stripe", blurb: "Cards, wallets, SCA, Connect", available: true },
  { provider: "razorpay", name: "Razorpay", blurb: "India — UPI, cards, netbanking", available: false },
  { provider: "braintree", name: "Braintree", blurb: "PayPal-owned, global cards", available: false },
  { provider: "paypal", name: "PayPal", blurb: "PayPal balance & cards", available: false },
];

export default function Gateways() {
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [accountRef, setAccountRef] = useState("");
  const [secretKey, setSecretKey] = useState("");

  async function load() {
    const res = await api.get<GatewayAccount[]>("/v1/gateways");
    setAccounts(res ?? []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const connected = (provider: string) => accounts.find((a) => a.provider === provider);

  async function connect(provider: string) {
    setError("");
    try {
      await api.post("/v1/gateways", {
        provider,
        account_ref: accountRef,
        secret_key: secretKey || "sk_demo_placeholder",
      });
      setConnecting(null);
      setAccountRef("");
      setSecretKey("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Payment Gateways</h2>
          <p>Connect your own gateway — charges land in your account</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="gateway-grid">
        {CATALOG.map((g) => {
          const acct = connected(g.provider);
          return (
            <div key={g.provider} className="gateway-card">
              <div className="gateway-top">
                <div className="gateway-logo">{g.name[0]}</div>
                <div>
                  <div className="gateway-name">{g.name}</div>
                  <div className="gateway-blurb">{g.blurb}</div>
                </div>
              </div>

              {acct ? (
                <div className="gateway-status">
                  <span className="badge active">Connected</span>
                  <div className="mono" style={{ marginTop: 8 }}>
                    {acct.account_ref || "—"}
                  </div>
                  <div className="mono">since {formatDate(acct.created_at)}</div>
                </div>
              ) : g.available ? (
                connecting === g.provider ? (
                  <div className="gateway-form">
                    <label>Account ref (optional)</label>
                    <input
                      value={accountRef}
                      onChange={(e) => setAccountRef(e.target.value)}
                      placeholder="acct_..."
                    />
                    <label>Secret key</label>
                    <input
                      type="password"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="sk_live_..."
                    />
                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="btn btn-sm" onClick={() => connect(g.provider)}>
                        Save & connect
                      </button>
                      <button className="btn-ghost" onClick={() => setConnecting(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-sm" onClick={() => setConnecting(g.provider)}>
                    Connect {g.name}
                  </button>
                )
              ) : (
                <button className="btn-ghost" disabled>
                  Coming soon
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <h3>How it works</h3>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Connecting a gateway links <strong>your own</strong> Stripe (or other) account
          to the platform via Stripe Connect. We then charge your customers <em>as you</em>,
          and the money settles directly into your balance. Cards are vaulted by the
          gateway (PCI stays with them) — we only store reference tokens.
        </p>
      </div>
    </div>
  );
}
