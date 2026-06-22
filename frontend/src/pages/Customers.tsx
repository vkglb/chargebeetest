import { useEffect, useState } from "react";
import { api, type Customer } from "../api/client";
import { formatDate } from "../lib/format";

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [gatewayRef, setGatewayRef] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setCustomers(await api.get<Customer[]>("/v1/customers"));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/v1/customers", {
        email,
        name,
        gateway_customer_ref: gatewayRef,
      });
      setEmail("");
      setName("");
      setGatewayRef("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Customers</h2>
          <p>The people you bill</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>New customer</h3>
        <form onSubmit={createCustomer} className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acme.com"
              required
            />
          </div>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label>Stripe customer (optional)</label>
            <input
              value={gatewayRef}
              onChange={(e) => setGatewayRef(e.target.value)}
              placeholder="cus_..."
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm">Add customer</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>All customers</h3>
        {customers.length === 0 ? (
          <div className="empty">No customers yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Stripe ref</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.email}</td>
                  <td>{c.name || "—"}</td>
                  <td className="mono">{c.gateway_customer_ref || "—"}</td>
                  <td>{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
