import { useEffect, useMemo, useState } from "react";
import { api, type Customer } from "../api/client";
import { formatDateTimeShort } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import { COUNTRIES, countryName } from "../lib/countries";

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [gatewayRef, setGatewayRef] = useState("");
  const [country, setCountry] = useState("US");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const q = useDebounce(query).trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return customers;
    return customers.filter((c) =>
      [c.email, c.name, c.gateway_customer_ref, countryName(c.country)].some((f) =>
        f?.toLowerCase().includes(q),
      ),
    );
  }, [customers, q]);

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
        country,
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
            <label>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Gateway reference (optional)</label>
            <input
              value={gatewayRef}
              onChange={(e) => setGatewayRef(e.target.value)}
              placeholder="e.g. cus_… / pay_…"
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm">Add customer</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            All customers
            <span className="count">{filtered.length}</span>
          </h3>
          {customers.length > 0 && (
            <SearchInput value={query} onChange={setQuery} placeholder="Search email or name…" />
          )}
        </div>
        {customers.length === 0 ? (
          <div className="empty">No customers yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No customers match “{query}”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Country</th>
                <th>Reference</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.email}</td>
                  <td>{c.name || "—"}</td>
                  <td>{countryName(c.country)}</td>
                  <td className="mono">{c.gateway_customer_ref || "—"}</td>
                  <td>{formatDateTimeShort(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
