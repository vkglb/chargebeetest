import { useEffect, useState } from "react";
import { api, type WebhookEndpoint, type WebhookDelivery } from "../api/client";
import { formatDate } from "../lib/format";
import Modal from "../components/Modal";

const EVENT_OPTIONS = [
  { id: "subscription.created", desc: "A subscription is created" },
  { id: "subscription.renewed", desc: "A subscription renews for a new period" },
  { id: "subscription.cancelled", desc: "A subscription is cancelled" },
  { id: "payment.succeeded", desc: "A charge succeeds" },
  { id: "payment.failed", desc: "A charge fails (dunning begins)" },
  { id: "invoice.created", desc: "An invoice is generated" },
];

export default function Webhooks() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [error, setError] = useState("");

  // Add-endpoint modal state.
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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

  function openModal() {
    setUrl("");
    setEvents([]);
    setError("");
    setOpen(true);
  }

  function toggleEvent(ev: string) {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  }

  const allSelected = events.length === EVENT_OPTIONS.length;
  function toggleAll() {
    setEvents(allSelected ? [] : EVENT_OPTIONS.map((e) => e.id));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (events.length === 0) {
      setError("Select at least one event");
      return;
    }
    setSaving(true);
    try {
      await api.post("/v1/webhooks", { url, events });
      setOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
        <button className="btn btn-sm" onClick={openModal}>
          + Add endpoint
        </button>
      </div>

      {error && !open && <div className="error">{error}</div>}

      {open && (
        <Modal title="Add a webhook endpoint" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <label>Endpoint URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.yoursite.com/webhooks/billing"
              required
              autoFocus
            />

            <div className="events-head">
              <label style={{ margin: "16px 0 0" }}>Events to send</label>
              <button type="button" className="link-btn" onClick={toggleAll}>
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>

            <div className="check-list">
              {EVENT_OPTIONS.map((ev) => (
                <label className="check-row" key={ev.id}>
                  <input
                    type="checkbox"
                    checked={events.includes(ev.id)}
                    onChange={() => toggleEvent(ev.id)}
                  />
                  <span>
                    <span className="mono check-name">{ev.id}</span>
                    <span className="check-desc">{ev.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <div className="error">{error}</div>}

            <div className="row" style={{ marginTop: 18, gap: 10 }}>
              <button className="btn btn-sm" disabled={saving}>
                {saving ? "Adding…" : `Add endpoint (${events.length})`}
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ width: "auto" }}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

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
