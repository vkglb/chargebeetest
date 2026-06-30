import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Coupon } from "../api/client";
import { formatMoney, formatDateTimeShort } from "../lib/format";

const ARCHIVE_REASONS = [
  { value: "revoked", label: "Customer revoked" },
  { value: "expired", label: "Expired" },
  { value: "campaign_over", label: "Campaign over" },
  { value: "manual", label: "Manually disabled" },
];
const reasonLabel = (r?: string) =>
  ARCHIVE_REASONS.find((x) => x.value === r)?.label ?? (r || "—");

export default function CouponDetail() {
  const { id } = useParams<{ id: string }>();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Coupon[]>("/v1/coupons")
      .then((c) => setCoupon((c ?? []).find((x) => x.id === id) ?? null))
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!coupon) return <div className="empty">Loading coupon…</div>;

  const displayValue = coupon.discount_type === "percentage" ? `${coupon.value}%` : formatMoney(coupon.value, "USD");
  
  const maxRed = () => {
    const m = coupon.max_redemptions;
    if (m == null) return "∞";
    if (typeof m === "number") return m === 0 ? "∞" : m;
    return m.Valid ? m.Int32 : "∞";
  };

  const archived = coupon.status === "archived";

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/coupons" className="back-link">
            ← Coupons
          </Link>
          <h2>{coupon.code}</h2>
          <p>
            <span className={`badge ${archived ? 'cancelled' : 'active'}`}>
              {archived ? 'archived' : 'active'}
            </span>
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {/* Summary */}
          <div className="panel">
            <h3>Coupon Details</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Discount value</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {displayValue}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Type</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="mono">{coupon.discount_type}</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "var(--muted)" }}>Redemptions</td>
                  <td style={{ textAlign: "right" }}>
                    {coupon.redemptions} / {maxRed()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right rail: metadata */}
        <aside className="detail-side">
          <div className="panel">
            <h3>Metadata</h3>
            <dl className="detail-list">
              <dt>Coupon ID</dt>
              <dd className="mono">{coupon.id}</dd>
              <dt>Created at</dt>
              <dd>{formatDateTimeShort(coupon.created_at)}</dd>
              {archived && (
                <>
                  <dt>Archived at</dt>
                  <dd>{formatDateTimeShort(coupon.archived_at ?? null)}</dd>
                  <dt>Archive reason</dt>
                  <dd>{reasonLabel(coupon.archive_reason)}</dd>
                </>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
