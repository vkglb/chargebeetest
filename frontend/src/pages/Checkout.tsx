import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api, type CheckoutSessionDetails } from "../api/client";
import { formatMoney } from "../lib/format";

// Setup-intent bootstrap: either the merchant has a real card-vaulting gateway
// (Stripe) connected, or we fall back to the simulated demo capture.
type SetupInfo =
  | { simulated: true }
  | {
      simulated: false;
      publishable_key: string;
      client_secret: string;
      gateway_customer_ref: string;
    };

// Dark theme for the Stripe Elements card iframe so it matches the page.
const CARD_OPTIONS = {
  style: {
    base: {
      color: "#e6e8ee",
      fontSize: "16px",
      fontFamily: "inherit",
      "::placeholder": { color: "#6b7280" },
    },
    invalid: { color: "#ff6b6b", iconColor: "#ff6b6b" },
  },
};

export default function Checkout() {
  const { id } = useParams();
  const [session, setSession] = useState<CheckoutSessionDetails | null>(null);
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get<CheckoutSessionDetails>(`/v1/checkout/sessions/${id}`);
        setSession(s);
        // Ask the backend whether to vault a real card or simulate.
        const si = await api.post<SetupInfo>(`/v1/checkout/sessions/${id}/setup-intent`);
        setSetup(si);
        if (!si.simulated && si.publishable_key) {
          setStripePromise(loadStripe(si.publishable_key));
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading)
    return (
      <div className="checkout-wrap">
        <div className="checkout-card">Loading…</div>
      </div>
    );

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

  const summary = (
    <>
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
    </>
  );

  const realStripe = setup && !setup.simulated && stripePromise;

  return (
    <div className="checkout-wrap">
      <div className="checkout-card">
        {summary}
        {realStripe ? (
          <Elements stripe={stripePromise!}>
            <StripeForm
              sessionId={id!}
              setup={setup as Extract<SetupInfo, { simulated: false }>}
              session={s}
              total={total}
              onDone={() => setDone(true)}
            />
          </Elements>
        ) : (
          <DemoForm
            sessionId={id!}
            session={s}
            total={total}
            onDone={() => setDone(true)}
          />
        )}
        <div className="checkout-foot">🔒 Secured · cards vaulted by the payment gateway</div>
      </div>
    </div>
  );
}

// ── Shared submit helper ────────────────────────────────────────────────────
async function complete(
  sessionId: string,
  body: { email: string; name: string; payment_method_ref: string; gateway_customer_ref?: string },
  onDone: () => void,
) {
  const res = await api.post<{ redirect_url: string }>(
    `/v1/checkout/sessions/${sessionId}/complete`,
    body,
  );
  onDone();
  if (res.redirect_url && /^https?:\/\//.test(res.redirect_url)) {
    setTimeout(() => (window.location.href = res.redirect_url), 1500);
  }
}

function payLabel(session: CheckoutSessionDetails, total: number, submitting: boolean) {
  if (submitting) return "Processing…";
  return session.trial_days > 0 ? "Start free trial" : `Pay ${formatMoney(total, session.currency)}`;
}

// ── Real Stripe card form (inside <Elements>) ───────────────────────────────
function StripeForm({
  sessionId,
  setup,
  session,
  total,
  onDone,
}: {
  sessionId: string;
  setup: Extract<SetupInfo, { simulated: false }>;
  session: CheckoutSessionDetails;
  total: number;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState(session.customer_email || "");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card field not ready");
      // Vault the card off-session against the SetupIntent. SCA, if required,
      // is resolved here so later merchant-initiated dunning charges succeed.
      const result = await stripe.confirmCardSetup(setup.client_secret, {
        payment_method: { card, billing_details: { email, name } },
      });
      if (result.error) {
        setError(result.error.message || "Card could not be saved");
        setSubmitting(false);
        return;
      }
      const pm = result.setupIntent?.payment_method;
      const pmId = typeof pm === "string" ? pm : (pm?.id ?? "");
      await complete(
        sessionId,
        {
          email,
          name,
          payment_method_ref: pmId,
          gateway_customer_ref: setup.gateway_customer_ref,
        },
        onDone,
      );
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={pay}>
      <label>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

      <label>Name on card</label>
      <input value={name} onChange={(e) => setName(e.target.value)} required />

      <label>Card</label>
      <div className="stripe-card-field">
        <CardElement options={CARD_OPTIONS} />
      </div>
      <div className="checkout-testcard">Test mode — use card 4242 4242 4242 4242, any future date & CVC.</div>

      {error && <div className="error">{error}</div>}

      <button className="btn" disabled={submitting || !stripe}>
        {payLabel(session, total, submitting)}
      </button>
    </form>
  );
}

// ── Simulated demo form (no gateway connected / guest mode) ─────────────────
function DemoForm({
  sessionId,
  session,
  total,
  onDone,
}: {
  sessionId: string;
  session: CheckoutSessionDetails;
  total: number;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(session.customer_email || "");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await complete(
        sessionId,
        {
          email,
          name,
          // Demo token; the real flow returns a gateway pm token from Stripe.
          payment_method_ref: "pm_demo_" + Math.random().toString(36).slice(2, 10),
        },
        onDone,
      );
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
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
        {payLabel(session, total, submitting)}
      </button>
    </form>
  );
}
