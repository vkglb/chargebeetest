import { useEffect, useMemo, useState } from "react";
import { api, type Subscription, type Customer, type Price, type Product } from "../api/client";
import { formatDate, formatMoney } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    const [s, c, pr, p] = await Promise.all([
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<Customer[]>("/v1/customers"),
      api.get<Price[]>("/v1/prices"),
      api.get<Product[]>("/v1/products"),
    ]);
    setSubs(s);
    setCustomers(c);
    setPrices(pr);
    setProducts(p);
    if (!customerId && c.length) setCustomerId(c[0].id);
    if (!priceId && pr.length) setPriceId(pr[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSub(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/v1/subscriptions", {
        customer_id: customerId,
        price_id: priceId,
        quantity: parseInt(quantity, 10) || 1,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const customerEmail = (id: string) => customers.find((c) => c.id === id)?.email ?? id.slice(0, 8);
  const priceLabel = (id: string) => {
    const p = prices.find((x) => x.id === id);
    if (!p) return id.slice(0, 8);
    const prod = products.find((x) => x.id === p.product_id)?.name ?? "Plan";
    return `${prod} · ${formatMoney(p.amount_minor, p.currency)}/${p.interval_unit}`;
  };

  const canCreate = customers.length > 0 && prices.length > 0;

  const filtered = useMemo(() => {
    if (!q) return subs;
    return subs.filter((s) =>
      [customerEmail(s.customer_id), priceLabel(s.price_id), s.status].some((f) =>
        f.toLowerCase().includes(q),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, q, customers, prices, products]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Subscriptions</h2>
          <p>Recurring billing relationships</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>New subscription</h3>
        {!canCreate ? (
          <div className="empty">Add at least one customer and one plan first.</div>
        ) : (
          <form onSubmit={createSub} className="row" style={{ alignItems: "flex-end" }}>
            <div>
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Plan</label>
              <select value={priceId} onChange={(e) => setPriceId(e.target.value)}>
                {prices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {priceLabel(p.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button className="btn btn-sm">Subscribe</button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            All subscriptions
            <span className="count">{filtered.length}</span>
          </h3>
          {subs.length > 0 && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search customer, plan or status…"
            />
          )}
        </div>
        {subs.length === 0 ? (
          <div className="empty">No subscriptions yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No subscriptions match “{query}”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Qty</th>
                <th>Next billing</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{customerEmail(s.customer_id)}</td>
                  <td>{priceLabel(s.price_id)}</td>
                  <td>
                    <span className={`badge ${s.status}`}>{s.status}</span>
                  </td>
                  <td>{s.quantity}</td>
                  <td>{formatDate(s.next_billing_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
