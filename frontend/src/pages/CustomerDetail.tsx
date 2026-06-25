import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  api,
  type Customer,
  type Subscription,
  type Price,
  type Product,
  type Invoice,
  type Transaction,
} from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";
import { countryName } from "../lib/countries";

// Human-readable status + reason for a subscription, derived from its state.
const STATUS_LABEL: Record<string, { label: string; reason: string; cls: string }> = {
  active: { label: "Active", reason: "Currently billing on schedule", cls: "active" },
  trialing: { label: "Trialing", reason: "In free trial", cls: "trialing" },
  past_due: { label: "Past due", reason: "Payment failed — in dunning retries", cls: "past_due" },
  cancelled: { label: "Cancelled", reason: "Cancelled — no longer billing", cls: "cancelled" },
  unpaid: { label: "Unpaid", reason: "No payment method on file", cls: "unpaid" },
  expired: { label: "Expired", reason: "Term ended", cls: "cancelled" },
  paused: { label: "Paused", reason: "Billing paused", cls: "open" },
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Customer[]>("/v1/customers"),
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<Price[]>("/v1/prices"),
      api.get<Product[]>("/v1/products"),
      api.get<Invoice[]>("/v1/invoices"),
      api.get<Transaction[]>("/v1/transactions"),
    ])
      .then(([c, s, pr, p, inv, t]) => {
        setCustomer((c ?? []).find((x) => x.id === id) ?? null);
        setSubs((s ?? []).filter((x) => x.customer_id === id));
        setPrices(pr ?? []);
        setProducts(p ?? []);
        setInvoices((inv ?? []).filter((x) => x.customer_id === id));
        setTxns(t ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const priceLabel = (priceId: string) => {
    const p = prices.find((x) => x.id === priceId);
    if (!p) return priceId.slice(0, 8);
    const prod = products.find((x) => x.id === p.product_id)?.name ?? "Plan";
    return `${prod} · ${formatMoney(p.amount_minor, p.currency)}/${p.interval_unit}`;
  };

  // Payments for this customer = transactions tied to this customer's invoices.
  const invoiceIds = useMemo(() => new Set(invoices.map((i) => i.id)), [invoices]);
  const custTxns = useMemo(
    () => txns.filter((t) => t.invoice_id && invoiceIds.has(t.invoice_id)),
    [txns, invoiceIds],
  );

  const totalSpend = useMemo(
    () => custTxns.filter((t) => t.status === "succeeded").reduce((a, b) => a + b.amount_minor, 0),
    [custTxns],
  );
  const spendByDay = useMemo(() => {
    const m = new Map<string, number>();
    custTxns
      .filter((t) => t.status === "succeeded")
      .forEach((t) => {
        const day = t.created_at.slice(0, 10);
        m.set(day, (m.get(day) ?? 0) + t.amount_minor);
      });
    return [...m.entries()].sort().map(([day, value]) => ({ day, value }));
  }, [custTxns]);

  if (error) return <div className="error">{error}</div>;
  if (!customer) return <div className="empty">Loading customer…</div>;

  const currency = invoices[0]?.currency ?? "USD";

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/customers" className="back-link">
            ← Customers
          </Link>
          <h2>{customer.name || customer.email}</h2>
          <p>{customer.email}</p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {/* Insights */}
          <div className="panel">
            <h3>Insights</h3>
            <div className="insight-row">
              <div>
                <div className="insight-label">Total spend</div>
                <div className="insight-value">{formatMoney(totalSpend, currency)}</div>
                <div className="insight-sub">{custTxns.length} transactions</div>
              </div>
            </div>
            {spendByDay.length > 0 && (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={spendByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cspend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6c5ce7" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6c5ce7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} stroke="#9aa3b2" fontSize={10} />
                  <YAxis stroke="#9aa3b2" fontSize={10} tickFormatter={(v) => `$${Math.round(v / 100)}`} />
                  <Tooltip
                    contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
                    formatter={(v) => [formatMoney(Number(v), currency), "Spend"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="#6c5ce7" strokeWidth={2} fill="url(#cspend)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Subscriptions */}
          <div className="panel">
            <h3>Subscriptions ({subs.length})</h3>
            {subs.length === 0 ? (
              <div className="empty">No subscriptions.</div>
            ) : (
              <div className="sub-list">
                {subs.map((s) => {
                  const meta = STATUS_LABEL[s.status] ?? {
                    label: s.status,
                    reason: "",
                    cls: "open",
                  };
                  return (
                    <div key={s.id} className="sub-row">
                      <div>
                        <div className="sub-plan">{priceLabel(s.price_id)}</div>
                        <div className="sub-reason">{meta.reason}</div>
                      </div>
                      <div className="sub-meta">
                        <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        <div className="sub-next">
                          {s.status === "active" || s.status === "trialing"
                            ? `Next billing ${formatDateTimeShort(s.next_billing_at)}`
                            : `ID ${s.id.slice(0, 8)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="panel">
            <h3>Invoices ({invoices.length})</h3>
            {invoices.length === 0 ? (
              <div className="empty">No invoices yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.id.slice(0, 8)}…</td>
                      <td>{formatMoney(i.total_minor, i.currency)}</td>
                      <td>
                        <span className={`badge ${i.status}`}>{i.status}</span>
                      </td>
                      <td className="mono">{formatDateTimeShort(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Payments */}
          <div className="panel">
            <h3>Payments ({custTxns.length})</h3>
            {custTxns.length === 0 ? (
              <div className="empty">No payments yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {custTxns.map((t) => (
                    <tr key={t.id}>
                      <td>{formatMoney(t.amount_minor, t.currency)}</td>
                      <td>
                        <span
                          className={`badge ${t.status === "succeeded" ? "paid" : t.status === "failed" ? "cancelled" : "open"}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="mono">{t.gateway_txn_ref || "—"}</td>
                      <td className="mono">{formatDateTimeShort(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right rail: details */}
        <aside className="detail-side">
          <div className="panel">
            <h3>Details</h3>
            <dl className="detail-list">
              <dt>Customer ID</dt>
              <dd className="mono">{customer.id}</dd>
              <dt>Billing email</dt>
              <dd>{customer.email}</dd>
              <dt>Country</dt>
              <dd>{countryName(customer.country)}</dd>
              <dt>Gateway reference</dt>
              <dd className="mono">{customer.gateway_customer_ref || "—"}</dd>
              <dt>Customer since</dt>
              <dd>{formatDateTimeShort(customer.created_at)}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
