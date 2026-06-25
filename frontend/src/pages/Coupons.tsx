import { useEffect, useMemo, useState } from "react";
import { api, type Coupon } from "../api/client";
import { formatMoney } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    setCoupons((await api.get<Coupon[]>("/v1/coupons")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!q) return coupons;
    return coupons.filter((c) =>
      [c.code, c.discount_type].some((f) => f.toLowerCase().includes(q)),
    );
  }, [coupons, q]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const raw = parseFloat(value);
      await api.post("/v1/coupons", {
        code,
        discount_type: discountType,
        value: discountType === "percentage" ? Math.round(raw) : Math.round(raw * 100),
        max_redemptions: parseInt(maxRedemptions, 10) || 0,
      });
      setCode("");
      setValue("");
      setMaxRedemptions("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const displayValue = (c: Coupon) =>
    c.discount_type === "percentage" ? `${c.value}%` : formatMoney(c.value, "USD");
  const maxRed = (c: Coupon) => {
    const m = c.max_redemptions;
    if (m == null) return "∞";
    if (typeof m === "number") return m === 0 ? "∞" : m;
    return m.Valid ? m.Int32 : "∞";
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Coupons</h2>
          <p>Discounts you can apply to subscriptions</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>New coupon</h3>
        <form onSubmit={create} className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" required />
          </div>
          <div>
            <label>Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          <div>
            <label>{discountType === "percentage" ? "Percent off" : "Amount off"}</label>
            <input
              type="number"
              step={discountType === "percentage" ? "1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={discountType === "percentage" ? "20" : "10.00"}
              required
            />
          </div>
          <div>
            <label>Max redemptions</label>
            <input
              type="number"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="∞"
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm">Create coupon</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            All coupons
            <span className="count">{filtered.length}</span>
          </h3>
          {coupons.length > 0 && (
            <SearchInput value={query} onChange={setQuery} placeholder="Search code or type…" />
          )}
        </div>
        {coupons.length === 0 ? (
          <div className="empty">No coupons yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No coupons match “{query}”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Redeemed</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="mono" style={{ color: "var(--text)" }}>{c.code}</td>
                  <td>{displayValue(c)}</td>
                  <td>{c.redemptions}</td>
                  <td>{maxRed(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
