import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type CheckoutSessionDetails } from "../api/client";
import { formatMoney } from "../lib/format";

// The public, branded hosted checkout page a merchant's customer lands on.
// (Card fields here are a demo capture; in production these are Stripe Elements
// iframes that tokenize the card directly with the gateway — PCI stays out of us.)
export default function Checkout() {
  const { id } = useParams();
  const [session, setSession] = useState<CheckoutSessionDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");

  useEffect(() => {
    api
      .get<CheckoutSessionDetails>(`/v1/checkout/sessions/${id}`)
      .then((s) => {
        setSession(s);
        setEmail(s.customer_email || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ redirect_url: string }>(`/v1/checkout/sessions/${id}/complete`, {
        email,
        name,
        // Demo token; real flow returns a gateway pm token from client tokenization.
        payment_method_ref: "pm_demo_" + Math.random().toString(36).slice(2, 10),
      });
      setDone(true);
      if (res.redirect_url && /^https?:\/\//.test(res.redirect_url)) {
        setTimeout(() => (window.location.href = res.redirect_url), 1500);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="checkout-wrap"><div className="checkout-card">Loading…</div></div>;

  if (error && !session)
    return (
      <div className="checkout-wrap">
        <div className="checkout-card">
          <h2>Checkout unavailable</h2>
          <p className="sub">{error}</p>
        </div>
      </div>
    );

  if (done)
    return (
      <div className="checkout-wrap">
        <div className="checkout-card" style={{ textAlign: "center" }}>
          <div className="check-ok">✓</div>
          <h2>Payment successful</h2>
          <p className="sub">Your subscription is active. Redirecting…</p>
        </div>
      </div>
    );

  const s = session!;
  const period = `${s.interval_count > 1 ? s.interval_count + " " : ""}${s.interval_unit}`;
  const total = s.amount_minor * s.quantity;

  return (
    <div className="checkout-wrap">
      <div className="checkout-card">
        <div className="checkout-merchant">{s.merchant_name}</div>

        <div className="checkout-summary">
          <div>
            <div className="checkout-plan">{s.product_name}</div>
            <div className="sub">
              {s.quantity > 1 ? `${s.quantity} × ` : ""}
              {formatMoney(s.amount_minor, s.currency)} / {period}
              {s.trial_days > 0 && ` · ${s.trial_days}-day free trial`}
            </div>
          </div>
          <div className="checkout-total">{formatMoney(total, s.currency)}</div>
        </div>

        <form onSubmit={pay}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

          <label>Name on card</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />

          <label>Card number</label>
          <input
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="4242 4242 4242 4242"
            required
          />
          <div className="row" style={{ gap: 12 }}>
            <div>
              <label>Expiry</label>
              <input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="MM/YY" required />
            </div>
            <div>
              <label>CVC</label>
              <input value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123" required />
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={submitting}>
            {submitting
              ? "Processing…"
              : s.trial_days > 0
                ? "Start free trial"
                : `Pay ${formatMoney(total, s.currency)}`}
          </button>
        </form>

        <div className="checkout-foot">🔒 Secured · cards vaulted by the payment gateway</div>
      </div>
    </div>
  );
}
