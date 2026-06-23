import { useEffect, useState } from "react";
import { api, type ApiKey, type ApiKeyCreated } from "../api/client";
import { formatDate } from "../lib/format";

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [env, setEnv] = useState("test");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setKeys((await api.get<ApiKey[]>("/v1/api-keys")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function create() {
    setError("");
    try {
      const res = await api.post<ApiKeyCreated>("/v1/api-keys", { env });
      setNewSecret(res.secret);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function revoke(id: string) {
    await api.del(`/v1/api-keys/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>API Keys</h2>
          <p>Authenticate your server-side calls to the billing API</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {newSecret && (
        <div className="panel" style={{ borderColor: "var(--accent)" }}>
          <h3>Your new API key — copy it now</h3>
          <p style={{ color: "var(--muted)" }}>
            This is the only time the full key is shown. Store it securely.
          </p>
          <div className="secret-box mono">{newSecret}</div>
          <button className="btn-ghost" style={{ marginTop: 10, width: "auto" }} onClick={() => setNewSecret(null)}>
            I've copied it
          </button>
        </div>
      )}

      <div className="panel">
        <h3>Generate key</h3>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <label>Environment</label>
            <select value={env} onChange={(e) => setEnv(e.target.value)}>
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm" onClick={create}>
              Generate new key
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Keys</h3>
        {keys.length === 0 ? (
          <div className="empty">No API keys yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="mono" style={{ color: "var(--text)" }}>{k.prefix}…</td>
                  <td>{k.scopes.join(", ")}</td>
                  <td>{formatDate(k.last_used_at)}</td>
                  <td>
                    <span className={`badge ${k.revoked_at ? "cancelled" : "active"}`}>
                      {k.revoked_at ? "revoked" : "active"}
                    </span>
                  </td>
                  <td>
                    {!k.revoked_at && (
                      <button className="btn-ghost" onClick={() => revoke(k.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
