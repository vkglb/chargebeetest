import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  api,
  type Product,
  type Price,
  type Subscription,
  type Customer,
  type Analytics,
} from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Product[]>("/v1/products"),
      api.get<Price[]>("/v1/prices"),
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<Customer[]>("/v1/customers"),
      api.get<Analytics>("/v1/analytics").catch(() => null),
    ])
      .then(([p, pr, s, c, a]) => {
        setProduct((p ?? []).find((x) => x.id === id) ?? null);
        setPrices((pr ?? []).filter((x) => x.product_id === id));
        
        // Find subscriptions linked to this product's prices
        const productPriceIds = new Set((pr ?? []).filter((x) => x.product_id === id).map((x) => x.id));
        setSubs((s ?? []).filter((x) => productPriceIds.has(x.price_id)));
        
        setCustomers(c ?? []);
        setAnalytics(a);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const customerEmail = (cid: string) => customers.find((c) => c.id === cid)?.email ?? cid.slice(0, 8);
  const priceLabel = (priceId: string) => {
    const p = prices.find((x) => x.id === priceId);
    if (!p) return priceId.slice(0, 8);
    return `${p.nickname || "Plan"} · ${formatMoney(p.amount_minor, p.currency)}/${p.interval_unit}`;
  };

  const productMetrics = useMemo(() => {
    return analytics?.products?.find((p) => p.product_id === id);
  }, [analytics, id]);

  if (error) return <div className="error">{error}</div>;
  if (!product) return <div className="empty">Loading product…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/products" className="back-link">
            ← Products & Plans
          </Link>
          <h2>{product.name}</h2>
          <p>
            <span className={`badge ${product.status === 'active' ? 'active' : 'cancelled'}`}>
              {product.status || 'active'}
            </span>
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {/* Insights */}
          <div className="panel">
            <h3>Insights</h3>
            <div className="insight-row">
              <div>
                <div className="insight-label">MRR (Monthly Recurring Revenue)</div>
                <div className="insight-value">{productMetrics ? formatMoney(productMetrics.mrr_minor, "USD") : "—"}</div>
                <div className="insight-sub">{productMetrics?.active_subscriptions || 0} active subscriptions</div>
              </div>
            </div>
          </div>

          {/* Plans */}
          <div className="panel">
            <h3>Plans ({prices.length})</h3>
            {prices.length === 0 ? (
              <div className="empty">No plans for this product.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Plan name</th>
                    <th>Price</th>
                    <th>Interval</th>
                    <th>Trial</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nickname || "—"}</td>
                      <td>{formatMoney(p.amount_minor, p.currency)}</td>
                      <td>every {p.interval_count} {p.interval_unit}</td>
                      <td>{p.trial_days > 0 ? `${p.trial_days} days` : "—"}</td>
                      <td className="mono">{p.id.slice(0, 8)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Subscriptions */}
          <div className="panel">
            <h3>Subscriptions ({subs.length})</h3>
            {subs.length === 0 ? (
              <div className="empty">No subscriptions yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr 
                      key={s.id}
                      onClick={() => navigate(`/customers/${s.customer_id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{customerEmail(s.customer_id)}</td>
                      <td>{priceLabel(s.price_id)}</td>
                      <td>
                        <span className={`badge ${s.status}`}>
                          {s.status}
                        </span>
                      </td>
                      <td>{formatDateTimeShort(s.created_at)}</td>
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
              <dt>Product ID</dt>
              <dd className="mono">{product.id}</dd>
              <dt>Name</dt>
              <dd>{product.name}</dd>
              <dt>Created at</dt>
              <dd>{formatDateTimeShort(product.created_at)}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
