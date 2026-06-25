import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api, type Analytics as AnalyticsData, type MetricDelta } from "../api/client";
import { useRealtime, type LiveEvent } from "../lib/useRealtime";
import { formatMoney, formatDateTime } from "../lib/format";

const STATUS_COLORS: Record<string, string> = {
  active: "#2ecc71",
  trialing: "#6c5ce7",
  past_due: "#f1c40f",
  cancelled: "#e74c3c",
  paused: "#9aa3b2",
};

// Percentage change vs the previous period. Up is good (green) for every metric
// on this dashboard; a brand-new value (no prior) is shown as "new".
function DeltaBadge({ d }: { d?: MetricDelta }) {
  if (!d) return null;
  const { current, previous } = d;
  let dir: "up" | "down" | "flat" = "flat";
  let label: string;
  if (previous === 0) {
    if (current === 0) {
      label = "no change";
    } else {
      dir = "up";
      label = "new";
    }
  } else {
    const pct = ((current - previous) / previous) * 100;
    dir = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
    label = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  return (
    <div className={`delta ${dir}`}>
      <span>{arrow}</span>
      <span>{label}</span>
      <span className="delta-cap">vs last 30d</span>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [live, setLive] = useState(false);

  async function load() {
    setData(await api.get<AnalyticsData>("/v1/analytics"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  // Live: prepend incoming events to the feed and refresh the charts.
  useRealtime((e) => {
    setLive(true);
    setFeed((prev) => [e, ...prev].slice(0, 12));
    load().catch(() => {});
  });

  const fmtDay = (d: string) => d.slice(5); // MM-DD
  const currency = "USD";

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Analytics</h2>
          <p>Revenue, growth and subscription health</p>
        </div>
        <span className={live ? "live-pill on" : "live-pill"}>
          <span className="live-dot" /> {live ? "Live" : "Realtime"}
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat">
          <div className="label">MRR</div>
          <div className="value">{data ? formatMoney(data.summary.mrr_minor, currency) : "…"}</div>
          <DeltaBadge d={data?.deltas?.mrr} />
        </div>
        <div className="stat">
          <div className="label">Revenue (last 30d)</div>
          <div className="value">
            {data ? formatMoney(data.deltas?.revenue.current ?? data.summary.total_revenue_minor, currency) : "…"}
          </div>
          <DeltaBadge d={data?.deltas?.revenue} />
        </div>
        <div className="stat">
          <div className="label">Active subscriptions</div>
          <div className="value">{data ? data.summary.active_subscriptions : "…"}</div>
          <DeltaBadge d={data?.deltas?.active_subscriptions} />
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{data ? data.summary.customers : "…"}</div>
          <DeltaBadge d={data?.deltas?.customers} />
        </div>
      </div>

      <div className="panel">
        <h3>Revenue — last 30 days</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data?.revenue_by_day ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6c5ce7" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#6c5ce7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
            <XAxis dataKey="day" tickFormatter={fmtDay} stroke="#9aa3b2" fontSize={11} />
            <YAxis stroke="#9aa3b2" fontSize={11} tickFormatter={(v) => `$${Math.round(v / 100)}`} />
            <Tooltip
              contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
              formatter={(v) => [formatMoney(Number(v), currency), "Revenue"]}
            />
            <Area type="monotone" dataKey="value" stroke="#6c5ce7" strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-row">
        <div className="panel" style={{ flex: 2 }}>
          <h3>New subscriptions — last 30 days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.subscriptions_by_day ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmtDay} stroke="#9aa3b2" fontSize={11} />
              <YAxis stroke="#9aa3b2" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
                cursor={{ fill: "rgba(108,92,231,0.1)" }}
              />
              <Bar dataKey="value" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <h3>Subscriptions by status</h3>
          {data && data.status_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.status_breakdown}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.status_breakdown.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#9aa3b2"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">No subscriptions yet.</div>
          )}
        </div>
      </div>

      {data?.products && data.products.length > 0 && (
        <div className="panel">
          <h3>Revenue by product</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Active subscriptions</th>
                <th>MRR</th>
                <th>Growth</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.product_id}>
                  <td style={{ color: "var(--text)" }}>{p.name}</td>
                  <td>{p.active_subscriptions}</td>
                  <td>{formatMoney(p.mrr_minor, currency)}</td>
                  <td>
                    <DeltaBadge d={{ current: p.mrr_minor, previous: p.prev_mrr_minor }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <h3>Live activity</h3>
        {feed.length === 0 ? (
          <div className="empty">
            Waiting for events… create a subscription to see it appear here in real time.
          </div>
        ) : (
          <table>
            <tbody>
              {feed.map((e, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: "var(--text)" }}>
                    {e.type}
                  </td>
                  <td className="mono">{formatDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
