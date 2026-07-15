import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Customer } from "../api/client";
import { formatDateTimeShort } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import Modal from "../components/Modal";
import HelpTip from "../components/HelpTip";
import RowMenu, { type MenuSection } from "../components/RowMenu";
import { toCSV, downloadCSV, parseCSV } from "../lib/csv";
import { COUNTRIES, countryName } from "../lib/countries";

const PAGE_SIZE = 20;

type ImportResult = { created: number; skipped: number; errors: string[] };

// Sample import file: every header the importer understands, with rows showing
// a required-only row and rows that fill the optional columns. `email` is
// required; `name`, `country` (2-letter ISO code) and `gateway_customer_ref`
// are optional.
const IMPORT_TEMPLATE_CSV =
  "email,name,country,gateway_customer_ref\n" +
  "jane@acme.com,Jane Doe,US,cus_12345\n" +
  "john@example.com,John Smith,GB,\n" +
  "maria@empresa.es,Maria Garcia,ES,cus_67890\n" +
  "sample@no-optionals.com,,,\n";

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [gatewayRef, setGatewayRef] = useState("");
  const [country, setCountry] = useState("US");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();

  // Export dropdown, CSV import, and the edit modal.
  const fileRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState("US");
  const [editRef, setEditRef] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const filtered = useMemo(() => {
    let result = customers;

    if (q) {
      result = result.filter((c) =>
        [c.email, c.name, c.gateway_customer_ref, countryName(c.country)].some((f) =>
          f?.toLowerCase().includes(q)
        )
      );
    }

    if (countryFilter !== "all") {
      result = result.filter((c) => c.country?.toLowerCase() === countryFilter.toLowerCase());
    }

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      result = result.filter((c) => new Date(c.created_at).getTime() >= fromTime);
    }

    if (toDate) {
      const toTime = new Date(toDate).getTime();
      result = result.filter((c) => new Date(c.created_at).getTime() <= toTime);
    }

    return result;
  }, [customers, q, countryFilter, fromDate, toDate]);

  useEffect(() => setPage(1), [q, countryFilter, fromDate, toDate]);

  // Close the export dropdown on any outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const hasActiveFilters = query || countryFilter !== "all" || fromDate || toDate;

  const clearFilters = () => {
    setQuery("");
    setCountryFilter("all");
    setFromDate("");
    setToDate("");
  };
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  // ── Export ────────────────────────────────────────────────────────────────
  // "Download data" mirrors the on-screen table; the import-friendly variant
  // uses the raw column names the importer (and POST /customers) expects.
  function exportData() {
    const header = ["Email", "Name", "Country", "Reference", "Created At"];
    const rows = filtered.map((c) => [
      c.email,
      c.name ?? "",
      countryName(c.country),
      c.gateway_customer_ref ?? "",
      c.created_at,
    ]);
    downloadCSV("customers.csv", toCSV(header, rows));
  }
  function exportImportFriendly() {
    const header = ["email", "name", "country", "gateway_customer_ref"];
    const rows = filtered.map((c) => [c.email, c.name ?? "", c.country ?? "", c.gateway_customer_ref ?? ""]);
    downloadCSV("customers-import.csv", toCSV(header, rows));
  }

  // ── Import ────────────────────────────────────────────────────────────────
  // Parse the CSV client-side and create each row through the existing endpoint,
  // reporting how many landed vs were skipped (duplicates, bad rows).
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    setImporting(true);
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) {
        setImportResult({ created: 0, skipped: 0, errors: ["No data rows found in the file."] });
        return;
      }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const iEmail = header.indexOf("email");
      if (iEmail === -1) {
        setImportResult({ created: 0, skipped: 0, errors: ['The file needs an "email" column.'] });
        return;
      }
      const iName = header.indexOf("name");
      const iCountry = header.indexOf("country");
      const iRef = header.findIndex((h) => h === "gateway_customer_ref" || h === "reference");

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const cols = rows[r];
        const rowEmail = (cols[iEmail] ?? "").trim();
        if (!rowEmail) {
          skipped++;
          continue;
        }
        try {
          await api.post("/v1/customers", {
            email: rowEmail,
            name: iName >= 0 ? (cols[iName] ?? "").trim() : "",
            country: iCountry >= 0 ? (cols[iCountry] ?? "").trim() || "US" : "US",
            gateway_customer_ref: iRef >= 0 ? (cols[iRef] ?? "").trim() : "",
          });
          created++;
        } catch (err) {
          skipped++;
          if (errors.length < 6) errors.push(`${rowEmail}: ${(err as Error).message}`);
        }
      }
      setImportResult({ created, skipped, errors });
      await load();
    } catch (err) {
      setImportResult({ created: 0, skipped: 0, errors: [(err as Error).message] });
    } finally {
      setImporting(false);
    }
  }

  // ── Row actions ─────────────────────────────────────────────────────────────
  function openEdit(c: Customer) {
    setEditing(c);
    setEditName(c.name ?? "");
    setEditCountry(c.country ?? "US");
    setEditRef(c.gateway_customer_ref ?? "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError("");
    try {
      await api.patch(`/v1/customers/${editing.id}`, {
        name: editName,
        country: editCountry,
        gateway_customer_ref: editRef,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeCustomer(c: Customer) {
    if (!window.confirm(`Delete ${c.name || c.email}? This can't be undone.`)) return;
    setError("");
    try {
      await api.del(`/v1/customers/${c.id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The per-row menu, mirroring Chargebee's References + Quick Actions groups.
  // Actions with no backing data model in this build are shown disabled.
  function rowSections(c: Customer): MenuSection[] {
    return [
      {
        title: "References",
        items: [
          { label: "Show associated Subscriptions", onClick: () => navigate(`/customers/${c.id}#subscriptions`) },
          { label: "Show associated Invoices", onClick: () => navigate(`/customers/${c.id}#invoices`) },
          { label: "Show associated Transactions", onClick: () => navigate(`/customers/${c.id}#payments`) },
          { label: "Show associated Orders", disabled: true, title: "Orders aren't tracked in this build" },
        ],
      },
      {
        title: "Quick Actions",
        items: [
          { label: "Edit Customer", onClick: () => openEdit(c) },
          { label: "Create New Subscription", onClick: () => navigate(`/subscriptions?customer=${c.id}`) },
          { label: "Request Payment Method Update", disabled: true, title: "Needs a connected payment gateway" },
          { label: "Add Credit Card", disabled: true, title: "Needs a connected payment gateway" },
          { label: "Update Billing Info", onClick: () => openEdit(c) },
          { label: "Change auto collection", disabled: true, title: "Auto-collection isn't configurable in this build" },
          { label: "Delete Customer", danger: true, onClick: () => removeCustomer(c) },
        ],
      },
    ];
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
          <div className="table-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleImportFile}
            />
            <button
              className="btn btn-sm btn-secondary"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? "Importing…" : "Import Customers"}
            </button>
            <HelpTip text="CSV needs an 'email' column (required). Optional columns: name, country (2-letter code like US), gateway_customer_ref. Tip: use Export → 'Download import-friendly file' as a template." />
            <a
              className="csv-template-link"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`}
              download="customers-template.csv"
            >
              Download sample CSV
            </a>
            <div className="export-wrap" ref={exportRef}>
              <button
                className="btn btn-sm btn-secondary"
                disabled={filtered.length === 0}
                onClick={() => setExportOpen((v) => !v)}
              >
                Export ▾
              </button>
              {exportOpen && (
                <div className="export-menu" role="menu">
                  <button
                    onClick={() => {
                      setExportOpen(false);
                      exportData();
                    }}
                  >
                    <strong>Download data</strong>
                    <span>Your current list as a CSV</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportOpen(false);
                      exportImportFriendly();
                    }}
                  >
                    <strong>Download import-friendly file</strong>
                    <span>Edit &amp; re-upload to import</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {customers.length > 0 && (
          <div className="filters-bar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search email or name…" />

            <div className="filters-group">
              <label htmlFor="country-filter">Country</label>
              <select
                id="country-filter"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
              >
                <option value="all">All Countries</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filters-group">
              <label htmlFor="from-date">Joined From</label>
              <input
                id="from-date"
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="filters-group">
              <label htmlFor="to-date">To</label>
              <input
                id="to-date"
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            {hasActiveFilters && (
              <button className="btn-clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {customers.length === 0 ? (
          <div className="empty">No customers yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No customers match the selected filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Country</th>
                <th>Reference</th>
                <th>Joined</th>
                <th className="col-actions" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} style={{ cursor: "pointer" }}>
                  <td>{c.email}</td>
                  <td>{c.name || "—"}</td>
                  <td>{countryName(c.country)}</td>
                  <td className="mono">{c.gateway_customer_ref || "—"}</td>
                  <td>{formatDateTimeShort(c.created_at)}</td>
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <RowMenu sections={rowSections(c)} ariaLabel={`Actions for ${c.email}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={page}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      {editing && (
        <Modal title="Edit customer" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="modal-form">
            <label>Email</label>
            <input value={editing.email} disabled />
            <label>Name</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Jane Doe" />
            <label>Country</label>
            <select value={editCountry} onChange={(e) => setEditCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <label>Gateway reference</label>
            <input
              value={editRef}
              onChange={(e) => setEditRef(e.target.value)}
              placeholder="e.g. cus_… / pay_…"
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn" disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importResult && (
        <Modal title="Import complete" onClose={() => setImportResult(null)}>
          <div className="modal-body">
            <p className="import-summary">
              <strong>{importResult.created}</strong> created ·{" "}
              <strong>{importResult.skipped}</strong> skipped
            </p>
            {importResult.errors.length > 0 && (
              <ul className="import-errors">
                {importResult.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setImportResult(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
