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
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    setTxns((await api.get<Transaction[]>("/v1/transactions")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!q) return txns;
    return txns.filter((t) =>
      [t.gateway_txn_ref, t.status, t.failure_reason].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [txns, q]);

  useEffect(() => setPage(1), [q]);
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
          {txns.length > 0 && (
            <SearchInput value={query} onChange={setQuery} placeholder="Search ref, status or reason…" />
          )}
        </div>
        {txns.length === 0 ? (
          <div className="empty">No transactions yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No transactions match “{query}”.</div>
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
