import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Invoice, type Customer } from "../api/client";
import { formatMoney, formatDate } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 20;

export default function Invoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();

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

  const filtered = useMemo(() => {
    let result = invoices;

    // Search query filter
    if (q) {
      result = result.filter((i) =>
        [i.id, customerEmail(i.customer_id), i.status].some((f) => f.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((i) => i.status.toLowerCase() === statusFilter.toLowerCase());
    }

    // Date from filter
    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      result = result.filter((i) => new Date(i.created_at).getTime() >= fromTime);
    }

    // Date to filter
    if (toDate) {
      const toTime = new Date(toDate).getTime();
      result = result.filter((i) => new Date(i.created_at).getTime() <= toTime);
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, q, customers, statusFilter, fromDate, toDate]);

  // Reset to page 1 whenever any filter changes.
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
          <h2>Invoices</h2>
          <p>Bills generated from subscriptions</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>
            All invoices
            <span className="count">{filtered.length}</span>
          </h3>
        </div>

        {invoices.length > 0 && (
          <div className="filters-bar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search id, customer or status…" />
            
            <div className="filters-group">
              <label htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
                <option value="uncollectible">Uncollectible</option>
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

        {invoices.length === 0 ? (
          <div className="empty">No invoices yet. They're created when subscriptions bill.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No invoices match the selected filters.</div>
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
              {paged.map((i) => (
                <tr 
                  key={i.id}
                  onClick={() => navigate(`/invoices/${i.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono">
                    {i.id.slice(0, 8)}…
                  </td>
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
