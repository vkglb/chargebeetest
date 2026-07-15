import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Sector,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  api,
  getMode,
  type Analytics as AnalyticsData,
  type MetricDelta,
  type Transaction,
  type Subscription,
  type CheckoutAnalytics,
} from "../api/client";
import { useRealtime, type LiveEvent } from "../lib/useRealtime";
import { formatMoney, formatDateTimeShort } from "../lib/format";
import { countryName } from "../lib/countries";
import Sparkline from "../components/Sparkline";

// Running total of a daily series, seeded with a leading 0 so even a single
// day of data still renders as a clean 0→value growth line in the sparkline.
function cumulative(series?: { value: number }[]): number[] {
  const out: number[] = [];
  let acc = 0;
  (series ?? []).forEach((p) => out.push((acc += p.value)));
  return out.length ? [0, ...out] : out;
}

// Hovered donut segment: pop it out slightly and add an outer ring.
function renderActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 9}
        outerRadius={outerRadius + 12}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.45}
      />
    </g>
  );
}

// Build feed events from stored records, so the live feed shows recent real
// activity on load (before any new WebSocket events arrive).
function txnToEvent(t: Transaction): LiveEvent {
  return {
    type:
      t.status === "succeeded"
        ? "payment.succeeded"
        : t.status === "failed"
          ? "payment.failed"
          : "invoice.created",
    mode: getMode(),
    created_at: t.created_at,
    data: {
      amount_minor: t.amount_minor,
      currency: t.currency,
      reason: t.failure_reason ?? undefined,
    },
  };
}
function subToEvent(s: Subscription): LiveEvent {
  return {
    type: s.status === "cancelled" ? "subscription.cancelled" : "subscription.created",
    mode: getMode(),
    created_at: s.created_at,
    data: { subscription_id: s.id },
  };
}

// Turn a raw realtime event into a human-readable line for the live feed —
// surfacing the billing action in progress (payment, dunning retry, next bill).
function describeEvent(e: LiveEvent): { label: string; detail: string; cls: string } {
  const d = e.data || {};
  const money = (m: unknown, c: unknown) => formatMoney(Number(m) || 0, String(c || "USD"));
  const when = (v: unknown) => (v ? formatDateTimeShort(String(v)) : "");
  switch (e.type) {
    case "subscription.created":
      return { label: "New subscription", detail: "", cls: "trialing" };
    case "invoice.created":
      return { label: "Invoice created", detail: money(d.total_minor, d.currency), cls: "open" };
    case "payment.succeeded":
      return {
        label: "Payment received",
        detail: `${money(d.amount_minor, d.currency)} · next billing ${when(d.next_billing)}`,
        cls: "paid",
      };
    case "payment.failed":
      return {
        label: "Payment failed",
        detail: `${money(d.amount_minor, d.currency)}${d.reason ? ` · ${d.reason}` : ""}`,
        cls: "cancelled",
      };
    case "subscription.dunning_scheduled":
      return {
        label: `Dunning retry #${Number(d.attempt) || 1}`,
        detail: `scheduled for ${when(d.next_retry)}`,
        cls: "past_due",
      };
    case "subscription.dunning_exhausted":
      return {
        label: "Dunning exhausted",
        detail: `after ${Number(d.attempts) || 0} attempts · marked unpaid`,
        cls: "unpaid",
      };
    case "subscription.unpaid":
      return { label: "Marked unpaid", detail: String(d.reason || ""), cls: "unpaid" };
    case "subscription.cancelled":
      return { label: "Subscription cancelled", detail: d.reason ? String(d.reason) : "", cls: "cancelled" };
    default:
      return { label: e.type, detail: "", cls: "open" };
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: "#2ecc71",
  trialing: "#6c5ce7",
  past_due: "#f1c40f",
  cancelled: "#e74c3c",
  unpaid: "#ff8a7a",
  paused: "#9aa3b2",
};

// Percentage change vs the previous period. Up is good (green) for every metric
// on this dashboard; a brand-new value (no prior) is shown as "new".
function DeltaBadge({ d, caption = "vs last 30d" }: { d?: MetricDelta; caption?: string }) {
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
      <span className="delta-cap">{caption}</span>
    </div>
  );
}

// Dashboard time-window options. The key is sent to the backend as ?period=;
// "daily" (last 30 days) is the default and is sent as no param.
type Period = "daily" | "3m" | "6m" | "12m";
type CurrencyFilter = "all" | "USD" | "EUR";
const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
];
const PERIOD_LABEL: Record<Period, string> = {
  daily: "last 30 days",
  "3m": "last 3 months",
  "6m": "last 6 months",
  "12m": "last 12 months",
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [live, setLive] = useState(false);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [checkout, setCheckout] = useState<CheckoutAnalytics | null>(null);
  const [activeSlice, setActiveSlice] = useState<number | undefined>(undefined);
  // Dashboard filters — the time window and the billing currency. Both re-fetch
  // the analytics payload (see the effect below) and drive the money formatting.
  const [period, setPeriod] = useState<Period>("daily");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");

  async function load(seedFeed = false) {
    const params = new URLSearchParams();
    if (period !== "daily") params.set("period", period);
    if (currencyFilter !== "all") params.set("currency", currencyFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const [a, txns, subs, co] = await Promise.all([
      api.get<AnalyticsData>(`/v1/analytics${qs}`),
      api.get<Transaction[]>("/v1/transactions"),
      api.get<Subscription[]>("/v1/subscriptions"),
      api.get<CheckoutAnalytics>("/v1/analytics/checkout").catch(() => null),
    ]);
    setData(a);
    setCheckout(co);
    const allTxns = txns ?? [];
    setRecent(allTxns.slice(0, 8));
    // Seed the live feed with a mix of recent real events (payments + sub
    // changes) so it shows activity on load; WebSocket events then prepend.
    if (seedFeed) {
      const events = [...allTxns.map(txnToEvent), ...(subs ?? []).map(subToEvent)]
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
        .slice(0, 12);
      setFeed(events);
    }
  }
  useEffect(() => {
    load(true).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the period/currency filters change. The initial mount is
  // handled by the seed-loading effect above, so skip the first run here.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currencyFilter]);

  // Live: prepend incoming events to the feed and refresh the charts. This
  // closure is re-created each render, so it always re-fetches with the
  // currently selected period/currency.
  useRealtime((e) => {
    setLive(true);
    setFeed((prev) => [e, ...prev].slice(0, 12));
    load().catch(() => {});
  });

  const fmtDay = (d: string) => d.slice(5); // MM-DD
  // "All" aggregates every currency but displays as USD (matching the backend,
  // which sums minor units across currencies); otherwise format in the picked one.
  const currency = currencyFilter === "all" ? "USD" : currencyFilter;
  const periodLabel = PERIOD_LABEL[period];
  const revLabel = period === "daily" ? "last 30d" : periodLabel;
  const deltaCaption = data?.delta_caption ?? "vs last 30d";

  // Cumulative spark lines for the KPI cards.
  const mrrSpark = cumulative(data?.mrr_added_by_day);
  const revSpark = cumulative(data?.revenue_by_day);
  const subsSpark = cumulative(data?.subscriptions_by_day);
  const custSpark = cumulative(data?.customers_by_day);

  // Intraday gross-volume: cumulative revenue through the day, today (solid, up
  // to the current hour) vs yesterday (dashed, full day).
  const hourLabel = (h: number) => {
    const hh = h % 24;
    const ap = hh < 12 ? "AM" : "PM";
    const disp = hh % 12 === 0 ? 12 : hh % 12;
    return `${disp} ${ap}`;
  };
  const intraday = (() => {
    const t = new Array(24).fill(0);
    const y = new Array(24).fill(0);
    (data?.today_hourly ?? []).forEach((p) => (t[p.hour] = p.value));
    (data?.yesterday_hourly ?? []).forEach((p) => (y[p.hour] = p.value));
    const nowHour = new Date().getUTCHours();
    let accT = 0;
    let accY = 0;
    const rows: { hour: number; today: number | null; yesterday: number }[] = [];
    for (let h = 0; h <= 24; h++) {
      if (h > 0) {
        accT += t[h - 1] ?? 0;
        accY += y[h - 1] ?? 0;
      }
      rows.push({ hour: h, today: h <= nowHour + 1 ? accT : null, yesterday: accY });
    }
    return rows;
  })();
  const todayTotal = (data?.today_hourly ?? []).reduce((a, b) => a + b.value, 0);
  const yesterdayTotal = (data?.yesterday_hourly ?? []).reduce((a, b) => a + b.value, 0);
  const nowLabel = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Mouse-wheel zoom for the Today chart (X axis = hours, 0..24).
  const todayChartRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<[number, number]>([0, 24]);
  const zoomTicks = (() => {
    const [min, max] = zoom;
    const span = max - min;
    const step = span <= 4 ? 1 : span <= 8 ? 2 : span <= 14 ? 3 : 6;
    const ticks: number[] = [];
    for (let h = Math.ceil(min); h <= Math.floor(max); h += step) ticks.push(h);
    return ticks;
  })();
  useEffect(() => {
    const el = todayChartRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setZoom(([min, max]) => {
        const span = max - min;
        const cursor = min + frac * span;
        const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2; // out : in
        const newSpan = Math.min(24, Math.max(2, span * factor));
        let newMin = cursor - (cursor - min) * (newSpan / span);
        let newMax = newMin + newSpan;
        if (newMin < 0) [newMin, newMax] = [0, newSpan];
        if (newMax > 24) [newMin, newMax] = [24 - newSpan, 24];
        return [newMin, newMax];
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const zoomed = zoom[0] > 0 || zoom[1] < 24;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Analytics</h2>
          <p>Revenue, growth and subscription health</p>
        </div>
        <div className="analytics-controls">
          <div className="seg-toggle" role="group" aria-label="Time period">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={period === p.key ? "active" : ""}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            className="cur-filter"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as CurrencyFilter)}
            aria-label="Filter by currency"
          >
            <option value="all">All (USD)</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          <span className={live ? "live-pill on" : "live-pill"}>
            <span className="live-dot" /> {live ? "Live" : "Realtime"}
          </span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat">
          <div className="stat-top">
            <div className="label">MRR</div>
            <Sparkline data={mrrSpark} color="#6c5ce7" />
          </div>
          <div className="value">{data ? formatMoney(data.summary.mrr_minor, currency) : "…"}</div>
          <DeltaBadge d={data?.deltas?.mrr} caption={deltaCaption} />
        </div>
        <div className="stat">
          <div className="stat-top">
            <div className="label">Revenue ({revLabel})</div>
            <Sparkline data={revSpark} color="#2ecc71" />
          </div>
          <div className="value">
            {data ? formatMoney(data.deltas?.revenue.current ?? data.summary.total_revenue_minor, currency) : "…"}
          </div>
          <DeltaBadge d={data?.deltas?.revenue} caption={deltaCaption} />
        </div>
        <div className="stat">
          <div className="stat-top">
            <div className="label">Active subscriptions</div>
            <Sparkline data={subsSpark} color="#6c5ce7" />
          </div>
          <div className="value">{data ? data.summary.active_subscriptions : "…"}</div>
          <DeltaBadge d={data?.deltas?.active_subscriptions} caption={deltaCaption} />
        </div>
        <div className="stat">
          <div className="stat-top">
            <div className="label">Customers</div>
            <Sparkline data={custSpark} color="#4aa3ff" />
          </div>
          <div className="value">{data ? data.summary.customers : "…"}</div>
          <DeltaBadge d={data?.deltas?.customers} caption={deltaCaption} />
        </div>
      </div>

      {data && (
        <div className="panel today-panel">
          <div className="panel-head">
            <h3 style={{ margin: 0 }}>Today</h3>
            <span className="zoom-hint">
              {zoomed ? "double-click to reset" : "scroll to zoom"}
            </span>
          </div>
          <div className="today-legend">
            <div className="today-metric">
              <span className="today-label">Gross volume</span>
              <span className="today-amount">{formatMoney(todayTotal, currency)}</span>
              <span className="today-time">{nowLabel}</span>
            </div>
            <div className="today-metric muted">
              <span className="today-label">Yesterday</span>
              <span className="today-amount">{formatMoney(yesterdayTotal, currency)}</span>
            </div>
          </div>
          <div
            ref={todayChartRef}
            className="zoomable"
            onDoubleClick={() => setZoom([0, 24])}
            title="Scroll to zoom · double-click to reset"
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={intraday} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
                <XAxis
                  dataKey="hour"
                  type="number"
                  domain={zoom}
                  ticks={zoomTicks}
                  tickFormatter={hourLabel}
                  allowDataOverflow
                  stroke="#9aa3b2"
                  fontSize={11}
                />
              <YAxis stroke="#9aa3b2" fontSize={11} tickFormatter={(v) => `$${Math.round(v / 100)}`} />
              <Tooltip
                contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
                labelFormatter={(h) => hourLabel(Number(h))}
                formatter={(v, name) => [
                  v == null ? "—" : formatMoney(Number(v), currency),
                  name === "today" ? "Today" : "Yesterday",
                ]}
              />
              <Line
                type="monotone"
                dataKey="yesterday"
                stroke="#9aa3b2"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="today"
                stroke="#6c5ce7"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Revenue — {periodLabel}</h3>
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
          <h3>New subscriptions — {periodLabel}</h3>
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
                  onMouseEnter={(_: unknown, i: number) => setActiveSlice(i)}
                  onMouseLeave={() => setActiveSlice(undefined)}
                  {...({ activeIndex: activeSlice, activeShape: renderActiveSlice } as Record<string, unknown>)}
                >
                  {data.status_breakdown.map((s, i) => (
                    <Cell
                      key={s.status}
                      fill={STATUS_COLORS[s.status] ?? "#9aa3b2"}
                      opacity={activeSlice === undefined || activeSlice === i ? 1 : 0.45}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">No subscriptions yet.</div>
          )}
          {data && data.status_breakdown.length > 0 && (
            <div className="status-legend">
              {data.status_breakdown.map((s, i) => (
                <div
                  key={s.status}
                  className={`legend-item ${activeSlice === i ? "active" : ""}`}
                  onMouseEnter={() => setActiveSlice(i)}
                  onMouseLeave={() => setActiveSlice(undefined)}
                >
                  <span
                    className="legend-dot"
                    style={{ background: STATUS_COLORS[s.status] ?? "#9aa3b2" }}
                  />
                  <span className="legend-label">{s.status.replace("_", " ")}</span>
                  <span className="legend-count">{s.count}</span>
                </div>
              ))}
            </div>
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
                    <DeltaBadge d={{ current: p.mrr_minor, previous: p.prev_mrr_minor }} caption={deltaCaption} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {checkout && (
        <div className="chart-row">
          <div className="panel" style={{ flex: 2 }}>
            <div className="panel-head">
              <h3 style={{ margin: 0 }}>Hosted checkout — visits (last 30 days)</h3>
              <div className="checkout-kpis">
                <span>
                  <strong>{checkout.total_visits}</strong> visitors
                </span>
                <span>
                  <strong>
                    {checkout.total_visits > 0
                      ? Math.round((checkout.completed / checkout.total_visits) * 100)
                      : 0}
                    %
                  </strong>{" "}
                  conversion
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={checkout.visits_by_day}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="visits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4aa3ff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#4aa3ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
                <XAxis dataKey="day" tickFormatter={fmtDay} stroke="#9aa3b2" fontSize={11} />
                <YAxis stroke="#9aa3b2" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#171a21", border: "1px solid #2a2f3a", borderRadius: 8 }}
                  formatter={(v) => [v, "Visits"]}
                />
                <Area type="monotone" dataKey="value" stroke="#4aa3ff" strokeWidth={2} fill="url(#visits)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel" style={{ flex: 1 }}>
            <h3>Visitors by country</h3>
            {checkout.by_country.length === 0 ? (
              <div className="empty">No visits yet.</div>
            ) : (
              <div className="country-list">
                {checkout.by_country.map((c) => {
                  const pct = Math.round((c.count / checkout.total_visits) * 100);
                  return (
                    <div key={c.country} className="country-row">
                      <div className="country-name">
                        {c.country === "Unknown" ? "Unknown" : countryName(c.country)}
                      </div>
                      <div className="country-bar">
                        <div className="country-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="country-count">
                        {c.count} · {pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chart-row">
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            <h3>Live activity</h3>
            <span className={live ? "live-pill on" : "live-pill"}>
              <span className="live-dot" /> {live ? "Live" : "Realtime"}
            </span>
          </div>
          {feed.length === 0 ? (
            <div className="empty">
              No activity yet — payments and subscription changes appear here in real time.
            </div>
          ) : (
            <table>
              <tbody>
                {feed.map((e, i) => {
                  const m = describeEvent(e);
                  return (
                    <tr key={i}>
                      <td>
                        <span className={`badge ${m.cls}`}>{m.label}</span>
                      </td>
                      <td style={{ color: "var(--text)" }}>{m.detail}</td>
                      <td className="mono">{formatDateTimeShort(e.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <h3>Recent activity</h3>
          {recent.length === 0 ? (
            <div className="empty">No activity yet.</div>
          ) : (
            <table>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span
                        className={`badge ${t.status === "succeeded" ? "paid" : t.status === "failed" ? "cancelled" : "open"}`}
                      >
                        {t.status === "succeeded"
                          ? "Payment received"
                          : t.status === "failed"
                            ? "Payment failed"
                            : t.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text)" }}>{formatMoney(t.amount_minor, t.currency)}</td>
                    <td className="mono">{formatDateTimeShort(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
