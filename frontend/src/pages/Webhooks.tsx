import { useEffect, useState } from "react";
import { api, type WebhookEndpoint, type WebhookDelivery } from "../api/client";
import { formatDateTime } from "../lib/format";
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
          + Add webhook
        </button>
      </div>

      {error && !open && <div className="error">{error}</div>}

      {open && (
        <Modal title="Add a webhook" onClose={() => setOpen(false)}>
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
              <label>Events to send</label>
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
                {saving ? "Adding…" : `Add webhook (${events.length})`}
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

      {endpoints.length === 0 ? (
        <div className="panel">
          <div className="empty">No webhooks yet. Click “+ Add webhook” to create one.</div>
        </div>
      ) : (
        endpoints.map((ep) => {
          const epDeliveries = deliveries.filter((d) => d.endpoint_id === ep.id);
          return (
            <div className="panel" key={ep.id}>
              <div className="wh-head">
                <div>
                  <div className="wh-url">{ep.url}</div>
                  <div className="wh-events mono">{ep.events.join(", ")}</div>
                </div>
                <div className="wh-head-right">
                  <span className={`badge ${ep.enabled ? "active" : "cancelled"}`}>
                    {ep.enabled ? "enabled" : "disabled"}
                  </span>
                  <button className="btn-ghost" style={{ width: "auto" }} onClick={() => remove(ep.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="wh-secret mono">Signing secret: {ep.signing_secret}</div>

              <div className="wh-log-title">Delivery log</div>
              {epDeliveries.length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>No deliveries sent yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Sent at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epDeliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="mono" style={{ color: "var(--text)" }}>{d.event_type}</td>
                        <td>
                          <span className={`badge ${d.status === "delivered" ? "paid" : d.status === "failed" ? "cancelled" : "open"}`}>
                            {d.status}
                          </span>
                        </td>
                        <td>{d.attempts}</td>
                        <td className="mono">{formatDateTime(d.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
