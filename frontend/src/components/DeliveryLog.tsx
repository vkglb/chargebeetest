import { useMemo, useState } from "react";
import { type WebhookDelivery } from "../api/client";
import { formatDateTime } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import Modal from "./Modal";

// A filterable, searchable delivery log for one webhook endpoint, with a detail
// modal exposing the full event payload, target URL, response code and failure
// reason. Rendered once per endpoint (deliveries are pre-filtered by endpoint).
export default function DeliveryLog({
  deliveries,
  endpointUrl,
  onResend,
}: {
  deliveries: WebhookDelivery[];
  endpointUrl: string;
  onResend?: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<WebhookDelivery | null>(null);
  const [resending, setResending] = useState(false);
  const q = useDebounce(query).trim().toLowerCase();

  // Distinct event types present, for the event filter dropdown.
  const eventTypes = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.event_type))).sort(),
    [deliveries],
  );

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
    return deliveries.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (eventType !== "all" && d.event_type !== eventType) return false;
      const ts = new Date(d.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (q) {
        const hay = [
          d.event_type,
          d.status,
          d.error ?? "",
          d.response_code != null ? String(d.response_code) : "",
          JSON.stringify(d.payload ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deliveries, status, eventType, from, to, q]);

  const hasFilters = q || status !== "all" || eventType !== "all" || from || to;
  function clearFilters() {
    setQuery("");
    setStatus("all");
    setEventType("all");
    setFrom("");
    setTo("");
  }

  const badgeClass = (s: string) =>
    s === "delivered" ? "paid" : s === "failed" ? "cancelled" : "open";

  async function resend() {
    if (!viewing || !onResend) return;
    setResending(true);
    try {
      await onResend(viewing.id);
      setViewing(null);
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <div className="dl-filters">
        <input
          className="dl-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search event, reason, payload…"
        />
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="all">All events</option>
          {eventTypes.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <label className="dl-date">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="dl-date">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {hasFilters && (
          <button type="button" className="link-btn" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {deliveries.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>
          No deliveries sent yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>
          No deliveries match these filters.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th>Code</th>
              <th>Attempts</th>
              <th>Sent at</th>
              <th style={{ textAlign: "right" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td className="mono" style={{ color: "var(--text)" }}>
                  {d.event_type}
                </td>
                <td>
                  <span className={`badge ${badgeClass(d.status)}`}>{d.status}</span>
                </td>
                <td className="mono">{d.response_code ?? "—"}</td>
                <td>{d.attempts}</td>
                <td className="mono">{formatDateTime(d.created_at)}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="link-btn" onClick={() => setViewing(d)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && (
        <Modal title="Delivery details" onClose={() => setViewing(null)} className="modal-tall">
          <div className="dl-detail">
            <div className="dl-detail-body">
              <div className="dl-detail-head">
                <span className="mono dl-detail-event">{viewing.event_type}</span>
                <span className={`badge ${badgeClass(viewing.status)}`}>{viewing.status}</span>
              </div>

              <dl className="dl-meta">
                <dt>Endpoint URL</dt>
                <dd className="mono dl-break">{endpointUrl}</dd>
                <dt>Sent at</dt>
                <dd className="mono">{formatDateTime(viewing.created_at)}</dd>
                <dt>Attempts</dt>
                <dd>{viewing.attempts}</dd>
                <dt>Response code</dt>
                <dd className="mono">{viewing.response_code ?? "—"}</dd>
                {viewing.status !== "delivered" && (
                  <>
                    <dt>Failure reason</dt>
                    <dd className="dl-error">{viewing.error || "—"}</dd>
                  </>
                )}
                <dt>Delivery ID</dt>
                <dd className="mono dl-break">{viewing.id}</dd>
              </dl>

              <div className="dl-payload-label">Event payload</div>
              <pre className="dl-payload">
                {JSON.stringify(viewing.payload ?? {}, null, 2)}
              </pre>
            </div>

            <div className="modal-actions dl-detail-actions">
              <button
                type="button"
                className="btn-ghost"
                style={{ width: "auto" }}
                onClick={() => setViewing(null)}
              >
                Close
              </button>
              {onResend && (
                <button className="btn btn-sm" onClick={resend} disabled={resending}>
                  {resending ? "Resending…" : "Resend"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
