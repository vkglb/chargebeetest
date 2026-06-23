import { useEffect, useState } from "react";
import { api, type WebhookEndpoint, type WebhookDelivery } from "../api/client";
import { formatDate } from "../lib/format";

const EVENT_OPTIONS = [
  "subscription.created",
  "subscription.renewed",
  "subscription.cancelled",
  "payment.succeeded",
  "payment.failed",
  "invoice.created",
];

export default function Webhooks() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [eps, dels] = await Promise.all([
      api.get<WebhookEndpoint[]>("/v1/webhooks"),
      api.get<WebhookDelivery[]>("/v1/webhook-deliveries"),
    ]);
    setEndpoints(eps ?? []);
    setDeliveries(dels ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function toggleEvent(ev: string) {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/v1/webhooks", { url, events });
      setUrl("");
      setEvents([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    await api.del(`/v1/webhooks/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Webhooks</h2>
          <p>We POST signed events to your endpoints in real time</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>Add endpoint</h3>
        <form onSubmit={create}>
          <label>Endpoint URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yoursite.com/webhooks/billing"
            required
          />
          <label>Events</label>
          <div className="chip-row">
            {EVENT_OPTIONS.map((ev) => (
              <button
                type="button"
                key={ev}
                className={events.includes(ev) ? "chip on" : "chip"}
                onClick={() => toggleEvent(ev)}
              >
                {ev}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" style={{ marginTop: 14 }}>
            Add endpoint
          </button>
        </form>
      </div>

      <div className="panel">
        <h3>Endpoints</h3>
        {endpoints.length === 0 ? (
          <div className="empty">No endpoints yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Events</th>
                <th>Signing secret</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td>{ep.url}</td>
                  <td>{ep.events.join(", ")}</td>
                  <td className="mono">{ep.signing_secret.slice(0, 16)}…</td>
                  <td>
                    <span className={`badge ${ep.enabled ? "active" : "cancelled"}`}>
                      {ep.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <button className="btn-ghost" onClick={() => remove(ep.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Recent deliveries</h3>
        {deliveries.length === 0 ? (
          <div className="empty">No deliveries yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="mono" style={{ color: "var(--text)" }}>{d.event_type}</td>
                  <td>
                    <span className={`badge ${d.status === "delivered" ? "paid" : d.status === "failed" ? "cancelled" : "open"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.attempts}</td>
                  <td>{formatDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
