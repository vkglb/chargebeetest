import { useEffect, useState } from "react";
import { api, type Product, type Customer, type Subscription } from "../api/client";
import { formatDate } from "../lib/format";

export default function Overview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Product[]>("/v1/products"),
      api.get<Customer[]>("/v1/customers"),
      api.get<Subscription[]>("/v1/subscriptions"),
    ])
      .then(([p, c, s]) => {
        setProducts(p);
        setCustomers(c);
        setSubscriptions(s);
      })
      .finally(() => setLoading(false));
  }, []);

  const active = subscriptions.filter((s) => s.status === "active").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p>Your billing at a glance</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Products & Plans</div>
          <div className="value">{loading ? "…" : products.length}</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{loading ? "…" : customers.length}</div>
        </div>
        <div className="stat">
          <div className="label">Subscriptions</div>
          <div className="value">{loading ? "…" : subscriptions.length}</div>
        </div>
        <div className="stat">
          <div className="label">Active</div>
          <div className="value">{loading ? "…" : active}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Recent subscriptions</h3>
        {subscriptions.length === 0 ? (
          <div className="empty">No subscriptions yet. Create a plan and subscribe a customer.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Qty</th>
                <th>Next billing</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id.slice(0, 8)}…</td>
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
