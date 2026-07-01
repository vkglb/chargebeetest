import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Transaction } from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 20;

export default function Transactions() {
  const navigate = useNavigate();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    setTxns((await api.get<Transaction[]>("/v1/transactions")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    let result = txns;

    if (q) {
      result = result.filter((t) =>
        [t.gateway_txn_ref, t.status, t.failure_reason].some((f) => f?.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((t) => t.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      result = result.filter((t) => new Date(t.created_at).getTime() >= fromTime);
    }

    if (toDate) {
      const toTime = new Date(toDate).getTime();
      result = result.filter((t) => new Date(t.created_at).getTime() <= toTime);
    }

    return result;
  }, [txns, q, statusFilter, fromDate, toDate]);

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
          <h2>Transactions</h2>
          <p>Every charge attempt and its outcome</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>
            All transactions
            <span className="count">{filtered.length}</span>
          </h3>
        </div>

        {txns.length > 0 && (
          <div className="filters-bar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search ref, status or reason…" />
            
            <div className="filters-group">
              <label htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="succeeded">Succeeded</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
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

        {txns.length === 0 ? (
          <div className="empty">No transactions yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No transactions match the selected filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Gateway ref</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((t) => (
                <tr 
                  key={t.id}
                  onClick={() => {
                    if (t.invoice_id) navigate(`/invoices/${t.invoice_id}`);
                  }}
                  style={{ cursor: t.invoice_id ? "pointer" : "default" }}
                >
                  <td className="mono">{t.gateway_txn_ref || "—"}</td>
                  <td>{formatMoney(t.amount_minor, t.currency)}</td>
                  <td>
                    <span className={`badge ${t.status === "succeeded" ? "paid" : t.status === "failed" ? "cancelled" : "open"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.failure_reason || "—"}</td>
                  <td>{formatDateTimeShort(t.created_at)}</td>
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
