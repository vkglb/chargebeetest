import { useEffect, useMemo, useState } from "react";
import { api, type Transaction } from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";

export default function Transactions() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
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
              {filtered.map((t) => (
                <tr key={t.id}>
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
      </div>
    </div>
  );
}
