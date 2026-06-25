import { useEffect, useMemo, useState } from "react";
import { api, type Product, type Price } from "../api/client";
import { formatMoney } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // New price form
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [intervalUnit, setIntervalUnit] = useState("month");
  const [trialDays, setTrialDays] = useState("0");
  const [query, setQuery] = useState("");
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    const [p, pr] = await Promise.all([
      api.get<Product[]>("/v1/products"),
      api.get<Price[]>("/v1/prices"),
    ]);
    setProducts(p);
    setPrices(pr);
    if (!productId && p.length) setProductId(p[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/v1/products", { name });
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createPrice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/v1/prices", {
        product_id: productId,
        amount_minor: Math.round(parseFloat(amount) * 100),
        currency,
        interval_unit: intervalUnit,
        interval_count: 1,
        trial_days: parseInt(trialDays, 10) || 0,
      });
      setAmount("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    if (!q) return prices;
    return prices.filter((p) =>
      [productName(p.product_id), p.interval_unit, p.currency].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, q, products]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Products & Plans</h2>
          <p>Define what you sell and how it's priced</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>New product</h3>
        <form onSubmit={createProduct} className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <label>Product name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" required />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm">Add product</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>New plan (price)</h3>
        {products.length === 0 ? (
          <div className="empty">Create a product first.</div>
        ) : (
          <form onSubmit={createPrice} className="row" style={{ alignItems: "flex-end" }}>
            <div>
              <label>Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="29.00"
                required
              />
            </div>
            <div>
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>INR</option>
              </select>
            </div>
            <div>
              <label>Interval</label>
              <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value)}>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <div>
              <label>Trial days</label>
              <input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button className="btn btn-sm">Add plan</button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            Plans
            <span className="count">{filtered.length}</span>
          </h3>
          {prices.length > 0 && (
            <SearchInput value={query} onChange={setQuery} placeholder="Search product or interval…" />
          )}
        </div>
        {prices.length === 0 ? (
          <div className="empty">No plans yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No plans match “{query}”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Interval</th>
                <th>Trial</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{productName(p.product_id)}</td>
                  <td>{formatMoney(p.amount_minor, p.currency)}</td>
                  <td>
                    every {p.interval_count} {p.interval_unit}
                  </td>
                  <td>{p.trial_days > 0 ? `${p.trial_days} days` : "—"}</td>
                  <td className="mono">{p.id.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
