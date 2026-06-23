import { useEffect, useState } from "react";
import { api, type Transaction } from "../api/client";
import { formatMoney, formatDate } from "../lib/format";

export default function Transactions() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setTxns((await api.get<Transaction[]>("/v1/transactions")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
        {txns.length === 0 ? (
          <div className="empty">No transactions yet.</div>
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
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.gateway_txn_ref || "—"}</td>
                  <td>{formatMoney(t.amount_minor, t.currency)}</td>
                  <td>
                    <span className={`badge ${t.status === "succeeded" ? "paid" : t.status === "failed" ? "cancelled" : "open"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.failure_reason || "—"}</td>
                  <td>{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
