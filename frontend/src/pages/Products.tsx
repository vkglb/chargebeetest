import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Product, type Price } from "../api/client";
import { formatMoney } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import HelpTip from "../components/HelpTip";

const PAGE_SIZE = 20;

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // New price form
  const [productId, setProductId] = useState("");
  const [nickname, setNickname] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [intervalUnit, setIntervalUnit] = useState("month");
  const [intervalCount, setIntervalCount] = useState("1");
  const [trialDays, setTrialDays] = useState("0");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
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
        nickname: nickname.trim(),
        amount_minor: Math.round(parseFloat(amount) * 100),
        currency,
        interval_unit: intervalUnit,
        interval_count: parseInt(intervalCount, 10) || 1,
        trial_days: parseInt(trialDays, 10) || 0,
      });
      setAmount("");
      setNickname("");
      setIntervalCount("1");
      setTrialDays("0");
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

  useEffect(() => setPage(1), [q]);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <h3>Create a new plan</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          A plan sets the price and billing cadence for a product.
        </p>
        {products.length === 0 ? (
          <div className="empty">Create a product first.</div>
        ) : (
          <form onSubmit={createPrice} className="plan-form">
            <div className="field">
              <span className="field-label">
                Product
                <HelpTip text="The product this plan prices. A product can have several plans (e.g. monthly and yearly)." />
              </span>
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="field-label">
                Plan name
                <span className="optional-tag">optional</span>
                <HelpTip text="A label to identify this plan, e.g. “Pro Monthly”. Shown in dropdowns and on invoices." />
              </span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Pro Monthly"
              />
            </div>

            <div className="field">
              <span className="field-label">
                Amount
                <HelpTip text="The price charged each billing cycle, in the chosen currency." />
              </span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="29.00"
                required
              />
            </div>

            <div className="field">
              <span className="field-label">
                Currency
                <HelpTip text="The 3-letter currency this plan is billed in. Each plan has a single currency." />
              </span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>INR</option>
              </select>
            </div>

            <div className="field">
              <span className="field-label">
                Bill every
                <HelpTip text="How often the customer is charged — e.g. every 1 month, or every 3 months for quarterly." />
              </span>
              <div className="field-inline">
                <input
                  type="number"
                  min="1"
                  value={intervalCount}
                  onChange={(e) => setIntervalCount(e.target.value)}
                  style={{ width: 70 }}
                />
                <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value)}>
                  <option value="day">day(s)</option>
                  <option value="week">week(s)</option>
                  <option value="month">month(s)</option>
                  <option value="year">year(s)</option>
                </select>
              </div>
            </div>

            <div className="field">
              <span className="field-label">
                Trial days
                <span className="optional-tag">optional</span>
                <HelpTip text="Free trial length before the first charge. Leave at 0 for no trial." />
              </span>
              <input
                type="number"
                min="0"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
            </div>

            <div className="plan-form-actions">
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
                <th>Plan name</th>
                <th>Price</th>
                <th>Interval</th>
                <th>Trial</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr 
                  key={p.id}
                  onClick={() => navigate(`/products/${p.product_id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{productName(p.product_id)}</td>
                  <td>{p.nickname || "—"}</td>
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
        <Pagination
          page={page}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>
    </div>
  );
}
