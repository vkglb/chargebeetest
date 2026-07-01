import { useEffect, useState } from "react";
import { api, type WebhookEndpoint, type WebhookDelivery } from "../api/client";
import Modal from "../components/Modal";
import DeliveryLog from "../components/DeliveryLog";

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
  const [secret, setSecret] = useState("");
  const [contentType, setContentType] = useState("application/json");
  const [verifySsl, setVerifySsl] = useState(true);
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
    setSecret("");
    setContentType("application/json");
    setVerifySsl(true);
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
      await api.post("/v1/webhooks", {
        url,
        events,
        secret: secret.trim(),
        content_type: contentType,
        verify_ssl: verifySsl,
      });
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

  async function resendDelivery(id: string) {
    await api.post(`/v1/webhook-deliveries/${id}/resend`);
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
        <Modal title="Add a webhook" onClose={() => setOpen(false)} className="modal-tall">
          <form onSubmit={create} className="wh-form">
            {/* Fixed top: endpoint + events header */}
            <div className="wh-form-top">
              <label>Endpoint URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.yoursite.com/webhooks/billing"
                required
                autoFocus
              />

              <div className="events-head">
                <label>
                  Events to send
                  {events.length > 0 && <span className="events-count">{events.length}</span>}
                </label>
                <button type="button" className="link-btn" onClick={toggleAll}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
            </div>

            {/* Scroll region: only the events list scrolls */}
            <div className="check-list wh-events-scroll">
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

            {/* Fixed bottom: delivery options + actions */}
            <div className="wh-form-bottom">
              <div className="wh-field-grid">
                <div>
                  <label>Content type</label>
                  <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    <option value="application/json">application/json</option>
                    <option value="application/x-www-form-urlencoded">
                      application/x-www-form-urlencoded
                    </option>
                  </select>
                </div>
                <div>
                  <label>SSL verification</label>
                  <select
                    value={verifySsl ? "on" : "off"}
                    onChange={(e) => setVerifySsl(e.target.value === "on")}
                  >
                    <option value="on">Enabled (recommended)</option>
                    <option value="off">Disabled</option>
                  </select>
                </div>
              </div>

              <label style={{ marginTop: 12 }}>Secret (optional)</label>
              <input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Leave blank to auto-generate a signing secret"
              />
              <div className="field-hint">
                Signs every payload with HMAC-SHA256 (sent in the{" "}
                <span className="mono">X-Webhook-Signature</span> header).
              </div>

              {error && <div className="error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: "auto" }}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-sm" disabled={saving}>
                  {saving ? "Adding…" : "Add webhook"}
                </button>
              </div>
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
              <div className="wh-meta">
                <span className="wh-tag mono">{ep.content_type}</span>
                <span className={`wh-tag ${ep.verify_ssl ? "" : "wh-tag-warn"}`}>
                  {ep.verify_ssl ? "SSL verified" : "SSL verification off"}
                </span>
              </div>

              <div className="wh-log-title">Delivery log</div>
              <DeliveryLog
                deliveries={epDeliveries}
                endpointUrl={ep.url}
                onResend={resendDelivery}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
