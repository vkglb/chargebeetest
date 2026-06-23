import { useEffect, useState } from "react";
import { api, type Price, type Product, type CheckoutSessionCreated } from "../api/client";
import { formatMoney } from "../lib/format";

export default function Checkouts() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceId, setPriceId] = useState("");
  const [successUrl, setSuccessUrl] = useState("https://your-app.com/welcome");
  const [created, setCreated] = useState<CheckoutSessionCreated | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Price[]>("/v1/prices"), api.get<Product[]>("/v1/products")])
      .then(([pr, p]) => {
        setPrices(pr ?? []);
        setProducts(p ?? []);
        if (pr?.length) setPriceId(pr[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const priceLabel = (p: Price) => {
    const prod = products.find((x) => x.id === p.product_id)?.name ?? "Plan";
    return `${prod} · ${formatMoney(p.amount_minor, p.currency)}/${p.interval_unit}`;
  };

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCopied(false);
    try {
      const res = await api.post<CheckoutSessionCreated>("/v1/checkout/sessions", {
        price_id: priceId,
        quantity: 1,
        success_url: successUrl,
      });
      setCreated(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function copy() {
    if (created) {
      navigator.clipboard.writeText(created.url);
      setCopied(true);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Hosted Checkout</h2>
          <p>Generate a hosted payment page — share the link or call the API</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>Create a checkout link</h3>
        {prices.length === 0 ? (
          <div className="empty">Create a plan first.</div>
        ) : (
          <form onSubmit={createLink} className="row" style={{ alignItems: "flex-end" }}>
            <div>
              <label>Plan</label>
              <select value={priceId} onChange={(e) => setPriceId(e.target.value)}>
                {prices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {priceLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label>Success URL (where to send the customer after payment)</label>
              <input value={successUrl} onChange={(e) => setSuccessUrl(e.target.value)} />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button className="btn btn-sm">Create link</button>
            </div>
          </form>
        )}
      </div>

      {created && (
        <div className="panel" style={{ borderColor: "var(--accent)" }}>
          <h3>Your checkout link</h3>
          <div className="secret-box mono">{created.url}</div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn btn-sm" onClick={copy}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <a className="btn-ghost" style={{ width: "auto" }} href={created.url} target="_blank" rel="noreferrer">
              Open checkout ↗
            </a>
          </div>
          <p style={{ color: "var(--muted)", marginTop: 14, marginBottom: 0 }}>
            Prefer to generate links from your server? See <strong>Developers → API Docs</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
