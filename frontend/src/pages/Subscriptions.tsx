import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  api,
  getMode,
  type Subscription,
  type Customer,
  type Price,
  type Product,
  type BillRunResult,
  type BillingRun,
} from "../api/client";
import { formatDateTimeShort, formatMoney } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 20;
import { CANCEL_REASONS } from "../lib/subscriptions";

export default function Subscriptions() {
  const navigate = useNavigate();
  // A ?customer=<id> param (e.g. from the Customers "Create New Subscription"
  // action) preselects that customer in the new-subscription form.
  const [searchParams] = useSearchParams();
  const presetCustomer = searchParams.get("customer") ?? "";
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [priceId, setPriceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();
  const [billing, setBilling] = useState(false);
  const [billResult, setBillResult] = useState<BillRunResult | null>(null);
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("customer_request");

  async function cancelSub(id: string) {
    setError("");
    try {
      await api.post(`/v1/subscriptions/${id}/cancel`, { reason: cancelReason });
      setCancelId(null);
      setCancelReason("customer_request");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadRuns() {
    setRuns((await api.get<BillingRun[]>("/v1/billing-runs")) ?? []);
  }

  async function runBilling() {
    setBilling(true);
    setBillResult(null);
    setError("");
    try {
      const res = await api.post<BillRunResult>("/v1/dev/bill-now");
      setBillResult(res);
      await Promise.all([load(), loadRuns()]); // refetch data + run history
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBilling(false);
    }
  }

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
    if (!customerId && c.length) {
      const preset = presetCustomer && c.some((x) => x.id === presetCustomer) ? presetCustomer : c[0].id;
      setCustomerId(preset);
    }
    if (!priceId && pr.length) setPriceId(pr[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadRuns().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Oldest→newest for the history chart, with a compact time label.
  const runChart = [...runs].reverse().map((r) => ({
    label: new Date(r.created_at).toLocaleTimeString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    succeeded: r.succeeded,
    failed: r.failed,
    processed: r.processed,
  }));

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
    let result = subs;

    if (q) {
      result = result.filter((s) =>
        [customerEmail(s.customer_id), priceLabel(s.price_id), s.status].some((f) =>
          f.toLowerCase().includes(q),
        )
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((s) => s.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      result = result.filter((s) => new Date(s.created_at).getTime() >= fromTime);
    }

    if (toDate) {
      const toTime = new Date(toDate).getTime();
      result = result.filter((s) => new Date(s.created_at).getTime() <= toTime);
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, q, customers, prices, products, statusFilter, fromDate, toDate]);

  useEffect(() => setPage(1), [q, statusFilter, fromDate, toDate]);

  const hasActiveFilters = query || statusFilter !== "all" || fromDate || toDate;

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  };

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

      <div className="panel scheduler-panel">
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Billing scheduler</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            The engine runs automatically every minute, charging subscriptions whose next billing
            date has passed. Run it now to bill all <strong>{getMode()}</strong> subscriptions on
            demand and watch invoices, transactions and statuses update.
          </p>
          {billResult && (
            <div className="bill-result">
              Marked {billResult.marked_due} due · processed {billResult.processed} ·{" "}
              <span className="ok">{billResult.succeeded} succeeded</span> ·{" "}
              <span className="bad">{billResult.failed} failed (dunning)</span>
            </div>
          )}
        </div>
        <button className="btn btn-sm" disabled={billing} onClick={runBilling}>
          {billing ? "Running…" : "Run billing cycle now"}
        </button>
      </div>

      {runs.length > 0 && (
        <div className="panel">
          <h3>Billing run history</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Each bar is one billing pass — green succeeded, red failed (entered dunning).
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={runChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
              <XAxis dataKey="label" stroke="#9aa3b2" fontSize={11} />
              <YAxis stroke="#9aa3b2" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
                cursor={{ fill: "rgba(108,92,231,0.1)" }}
              />
              <Bar dataKey="succeeded" stackId="r" fill="#2ecc71" radius={[0, 0, 0, 0]} name="Succeeded" />
              <Bar dataKey="failed" stackId="r" fill="#e74c3c" radius={[4, 4, 0, 0]} name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>
            All subscriptions
            <span className="count">{filtered.length}</span>
          </h3>
        </div>

        {subs.length > 0 && (
          <div className="filters-bar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search customer, plan or status…"
            />
            
            <div className="filters-group">
              <label htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past Due</option>
                <option value="cancelled">Cancelled</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div className="filters-group">
              <label htmlFor="from-date">From</label>
              <input
                id="from-date"
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="filters-group">
              <label htmlFor="to-date">To</label>
              <input
                id="to-date"
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <button className="btn-clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {subs.length === 0 ? (
          <div className="empty">No subscriptions yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No subscriptions match the selected filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Qty</th>
                <th>Started</th>
                <th>Next billing</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => {
                const cancellable = ["active", "trialing", "past_due"].includes(s.status);
                return (
                  <tr 
                    key={s.id}
                    onClick={(e) => {
                      // Prevent navigation if they clicked an action button
                      if ((e.target as HTMLElement).closest("button, select")) return;
                      navigate(`/customers/${s.customer_id}`);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{customerEmail(s.customer_id)}</td>
                    <td>{priceLabel(s.price_id)}</td>
                    <td>
                      <span className={`badge ${s.status}`}>{s.status}</span>
                    </td>
                    <td>{s.quantity}</td>
                    <td>{formatDateTimeShort(s.created_at)}</td>
                    <td>{formatDateTimeShort(s.next_billing_at)}</td>
                    <td style={{ textAlign: "right" }}>
                      {cancelId === s.id ? (
                        <span className="row-actions">
                          <select
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
                          >
                            {CANCEL_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <button className="link-btn danger" onClick={() => cancelSub(s.id)}>
                            Confirm
                          </button>
                          <button className="link-btn" onClick={() => setCancelId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : cancellable ? (
                        <button className="link-btn danger" onClick={() => setCancelId(s.id)}>
                          Cancel
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
