import { useEffect, useState } from "react";
import { api, type Subscription, type Price, type Customer } from "../api/client";
import { formatMoney } from "../lib/format";

// Normalise any interval to a monthly amount (minor units).
function monthlyMinor(price: Price, qty: number): number {
  const base = price.amount_minor * qty;
  switch (price.interval_unit) {
    case "year":
      return Math.round(base / 12);
    case "week":
      return Math.round((base * 52) / 12);
    case "day":
      return Math.round((base * 365) / 12);
    default:
      return base; // month
  }
}

export default function Analytics() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<Price[]>("/v1/prices"),
      api.get<Customer[]>("/v1/customers"),
    ])
      .then(([s, p, c]) => {
        setSubs(s ?? []);
        setPrices(p ?? []);
        setCustomers(c ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  const priceOf = (id: string) => prices.find((p) => p.id === id);
  const active = subs.filter((s) => s.status === "active" || s.status === "trialing");
  const cancelled = subs.filter((s) => s.status === "cancelled");

  let mrr = 0;
  let currency = "USD";
  for (const s of active) {
    const p = priceOf(s.price_id);
    if (p) {
      mrr += monthlyMinor(p, s.quantity);
      currency = p.currency;
    }
  }
  const arr = mrr * 12;
  const arpa = active.length ? Math.round(mrr / active.length) : 0;
  const churnRate = subs.length ? Math.round((cancelled.length / subs.length) * 100) : 0;

  // Plan distribution
  const byPlan = new Map<string, number>();
  for (const s of active) {
    const p = priceOf(s.price_id);
    const label = p?.nickname || p?.id.slice(0, 6) || "Unknown";
    byPlan.set(label, (byPlan.get(label) ?? 0) + 1);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Analytics</h2>
          <p>Revenue & growth metrics</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat">
          <div className="label">MRR</div>
          <div className="value">{formatMoney(mrr, currency)}</div>
        </div>
        <div className="stat">
          <div className="label">ARR</div>
          <div className="value">{formatMoney(arr, currency)}</div>
        </div>
        <div className="stat">
          <div className="label">Active subscriptions</div>
          <div className="value">{active.length}</div>
        </div>
        <div className="stat">
          <div className="label">ARPA</div>
          <div className="value">{formatMoney(arpa, currency)}</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{customers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Churn rate</div>
          <div className="value">{churnRate}%</div>
        </div>
      </div>

      <div className="panel">
        <h3>Active subscriptions by plan</h3>
        {byPlan.size === 0 ? (
          <div className="empty">No active subscriptions.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {[...byPlan.entries()].map(([label, count]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
