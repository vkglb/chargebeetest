import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type Invoice,
  type Customer,
  type Transaction,
  type Subscription,
  type Price,
  type Product,
} from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Invoice[]>("/v1/invoices"),
      api.get<Customer[]>("/v1/customers"),
      api.get<Transaction[]>("/v1/transactions"),
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<Price[]>("/v1/prices"),
      api.get<Product[]>("/v1/products"),
    ])
      .then(([inv, c, t, s, pr, p]) => {
        setInvoice((inv ?? []).find((x) => x.id === id) ?? null);
        setCustomers(c ?? []);
        setTxns(t ?? []);
        setSubs(s ?? []);
        setPrices(pr ?? []);
        setProducts(p ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const customerEmail = (cid: string) => customers.find((c) => c.id === cid)?.email ?? cid.slice(0, 8);
  const planLabel = (subId: string | null) => {
    if (!subId) return "—";
    const sub = subs.find((s) => s.id === subId);
    if (!sub) return "—";
    const p = prices.find((x) => x.id === sub.price_id);
    if (!p) return "—";
    const prod = products.find((x) => x.id === p.product_id)?.name ?? "Plan";
    return `${prod} · ${formatMoney(p.amount_minor, p.currency)}/${p.interval_unit}`;
  };

  // Payment attempts recorded against this invoice.
  const invTxns = useMemo(() => txns.filter((t) => t.invoice_id === id), [txns, id]);

  if (error) return <div className="error">{error}</div>;
  if (!invoice) return <div className="empty">Loading invoice…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/invoices" className="back-link">
            ← Invoices
          </Link>
          <h2>
            Invoice <span className="mono">{invoice.id.slice(0, 8)}…</span>
          </h2>
          <p>
            <span className={`badge ${invoice.status}`}>{invoice.status}</span> ·{" "}
            {formatMoney(invoice.total_minor, invoice.currency)}
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="panel">
            <h3>Summary</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Subtotal</td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(invoice.subtotal_minor, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Discount</td>
                  <td style={{ textAlign: "right" }}>
                    −{formatMoney(invoice.discount_minor, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Tax</td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(invoice.tax_minor, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--text)", fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatMoney(invoice.total_minor, invoice.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>Payments ({invTxns.length})</h3>
            {invTxns.length === 0 ? (
              <div className="empty">No payment attempts recorded.</div>
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
                  {invTxns.map((t) => (
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

        <aside className="detail-side">
          <div className="panel">
            <h3>Details</h3>
            <dl className="detail-list">
              <dt>Invoice ID</dt>
              <dd className="mono">{invoice.id}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`badge ${invoice.status}`}>{invoice.status}</span>
              </dd>
              <dt>Customer</dt>
              <dd>
                <Link to={`/customers/${invoice.customer_id}`} className="row-link">
                  {customerEmail(invoice.customer_id)}
                </Link>
              </dd>
              <dt>Plan</dt>
              <dd>{planLabel(invoice.subscription_id)}</dd>
              <dt>Billing period</dt>
              <dd>
                {formatDateTimeShort(invoice.period_start)} – {formatDateTimeShort(invoice.period_end)}
              </dd>
              <dt>Created</dt>
              <dd>{formatDateTimeShort(invoice.created_at)}</dd>
              <dt>Paid</dt>
              <dd>{invoice.paid_at ? formatDateTimeShort(invoice.paid_at) : "—"}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
