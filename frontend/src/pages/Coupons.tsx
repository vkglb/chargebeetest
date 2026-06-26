import { useEffect, useMemo, useState } from "react";
import { api, type Coupon } from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";
import { useDebounce } from "../lib/useDebounce";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 20;

const ARCHIVE_REASONS = [
  { value: "revoked", label: "Customer revoked" },
  { value: "expired", label: "Expired" },
  { value: "campaign_over", label: "Campaign over" },
  { value: "manual", label: "Manually disabled" },
];
const reasonLabel = (r?: string) =>
  ARCHIVE_REASONS.find((x) => x.value === r)?.label ?? (r || "—");

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(query).trim().toLowerCase();

  async function load() {
    setCoupons((await api.get<Coupon[]>("/v1/coupons")) ?? []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!q) return coupons;
    return coupons.filter((c) =>
      [c.code, c.discount_type].some((f) => f.toLowerCase().includes(q)),
    );
  }, [coupons, q]);

  useEffect(() => setPage(1), [q]);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const raw = parseFloat(value);
      await api.post("/v1/coupons", {
        code,
        discount_type: discountType,
        value: discountType === "percentage" ? Math.round(raw) : Math.round(raw * 100),
        max_redemptions: parseInt(maxRedemptions, 10) || 0,
      });
      setCode("");
      setValue("");
      setMaxRedemptions("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [disableId, setDisableId] = useState<string | null>(null);
  const [disableReason, setDisableReason] = useState("revoked");

  async function activate(c: Coupon) {
    setError("");
    try {
      await api.patch(`/v1/coupons/${c.id}`, { status: "active" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function archive(id: string) {
    setError("");
    try {
      await api.patch(`/v1/coupons/${id}`, { status: "archived", reason: disableReason });
      setDisableId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api.del(`/v1/coupons/${id}`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const displayValue = (c: Coupon) =>
    c.discount_type === "percentage" ? `${c.value}%` : formatMoney(c.value, "USD");
  const maxRed = (c: Coupon) => {
    const m = c.max_redemptions;
    if (m == null) return "∞";
    if (typeof m === "number") return m === 0 ? "∞" : m;
    return m.Valid ? m.Int32 : "∞";
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Coupons</h2>
          <p>Discounts you can apply to subscriptions</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <h3>New coupon</h3>
        <form onSubmit={create} className="row" style={{ alignItems: "flex-end" }}>
          <div>
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" required />
          </div>
          <div>
            <label>Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          <div>
            <label>{discountType === "percentage" ? "Percent off" : "Amount off"}</label>
            <input
              type="number"
              step={discountType === "percentage" ? "1" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={discountType === "percentage" ? "20" : "10.00"}
              required
            />
          </div>
          <div>
            <label>Max redemptions</label>
            <input
              type="number"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="∞"
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn btn-sm">Create coupon</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>
            All coupons
            <span className="count">{filtered.length}</span>
          </h3>
          {coupons.length > 0 && (
            <SearchInput value={query} onChange={setQuery} placeholder="Search code or type…" />
          )}
        </div>
        {coupons.length === 0 ? (
          <div className="empty">No coupons yet.</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No coupons match “{query}”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Redeemed</th>
                <th>Max</th>
                <th>Status</th>
                <th>Created</th>
                <th>Revoked</th>
                <th>Reason</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => {
                const archived = c.status === "archived";
                return (
                  <tr key={c.id} style={archived ? { opacity: 0.55 } : undefined}>
                    <td className="mono" style={{ color: "var(--text)" }}>{c.code}</td>
                    <td>{displayValue(c)}</td>
                    <td>{c.redemptions}</td>
                    <td>{maxRed(c)}</td>
                    <td>
                      <span className={`badge ${archived ? "cancelled" : "active"}`}>
                        {archived ? "archived" : "active"}
                      </span>
                    </td>
                    <td className="mono">{formatDateTimeShort(c.created_at)}</td>
                    <td className="mono">{archived ? formatDateTimeShort(c.archived_at ?? null) : "—"}</td>
                    <td>{archived ? reasonLabel(c.archive_reason) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {confirmDelete === c.id ? (
                        <span className="row-actions">
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Remove?</span>
                          <button className="link-btn danger" onClick={() => remove(c.id)}>
                            Yes
                          </button>
                          <button className="link-btn" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : disableId === c.id ? (
                        <span className="row-actions">
                          <select
                            value={disableReason}
                            onChange={(e) => setDisableReason(e.target.value)}
                            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                          >
                            {ARCHIVE_REASONS.map((rsn) => (
                              <option key={rsn.value} value={rsn.value}>
                                {rsn.label}
                              </option>
                            ))}
                          </select>
                          <button className="link-btn danger" onClick={() => archive(c.id)}>
                            Disable
                          </button>
                          <button className="link-btn" onClick={() => setDisableId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="row-actions">
                          {archived ? (
                            <button className="link-btn" onClick={() => activate(c)}>
                              Activate
                            </button>
                          ) : (
                            <button
                              className="link-btn"
                              onClick={() => {
                                setDisableReason("revoked");
                                setDisableId(c.id);
                              }}
                            >
                              Disable
                            </button>
                          )}
                          <button className="link-btn danger" onClick={() => setConfirmDelete(c.id)}>
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
}
