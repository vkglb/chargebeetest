import { useEffect, useState } from "react";
import { api, type Invoice, type Customer } from "../api/client";
import { formatMoney, formatDate } from "../lib/format";

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [inv, cust] = await Promise.all([
      api.get<Invoice[]>("/v1/invoices"),
      api.get<Customer[]>("/v1/customers"),
    ]);
    setInvoices(inv ?? []);
    setCustomers(cust ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const customerEmail = (id: string) =>
    customers.find((c) => c.id === id)?.email ?? id.slice(0, 8);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Invoices</h2>
          <p>Bills generated from subscriptions</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        {invoices.length === 0 ? (
          <div className="empty">No invoices yet. They're created when subscriptions bill.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Period</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.id.slice(0, 8)}…</td>
                  <td>{customerEmail(i.customer_id)}</td>
                  <td>{formatMoney(i.total_minor, i.currency)}</td>
                  <td>
                    <span className={`badge ${i.status}`}>{i.status}</span>
                  </td>
                  <td>
                    {formatDate(i.period_start)} – {formatDate(i.period_end)}
                  </td>
                  <td>{formatDate(i.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
