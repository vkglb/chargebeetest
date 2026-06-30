// Minimal typed API client for the Go backend. Attaches the JWT and unwraps
// JSON / error envelopes.

import { mockRequest } from "./mock";

const TOKEN_KEY = "chargeebee_token";
const GUEST_TOKEN = "guest";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Guest/demo mode: API calls are served by the in-memory mock backend.
export function isGuest(): boolean {
  return getToken() === GUEST_TOKEN;
}
export function setGuest() {
  setToken(GUEST_TOKEN);
}

// Test/Live mode — isolates each merchant's data + gateway keys.
const MODE_KEY = "chargeebee_mode";
export type Mode = "test" | "live";
export function getMode(): Mode {
  return localStorage.getItem(MODE_KEY) === "live" ? "live" : "test";
}
export function setMode(m: Mode) {
  localStorage.setItem(MODE_KEY, m);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// In dev, paths are proxied to the backend by Vite (empty base). In production
// (static site), set VITE_API_BASE to the deployed backend URL.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // In guest mode, short-circuit to the in-memory mock backend.
  if (isGuest()) {
    return mockRequest<T>(method, path, body);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Mode": getMode(), // selects the test/live dataset on the backend
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON body (e.g. a plain-text "404 page not found" from the router,
      // or an HTML error page from a proxy). Surface it as a clean error.
      if (!res.ok) {
        throw new ApiError(res.status, text.trim().slice(0, 200) || res.statusText);
      }
      throw new ApiError(res.status, `Unexpected non-JSON response: ${text.trim().slice(0, 120)}`);
    }
  }

  if (!res.ok) {
    const msg = data?.error ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// ── Domain types (mirror the Go API responses) ──────────────────────────────
export interface AuthResponse {
  token: string;
  merchant_id: string;
  user_id: string;
}

// Current user + server-persisted onboarding flags (e.g. product-tour state).
export interface Me {
  user_id: string;
  merchant_id: string;
  tour_completed: boolean;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface Price {
  id: string;
  product_id: string;
  nickname: string | null;
  amount_minor: number;
  currency: string;
  interval_unit: string;
  interval_count: number;
  trial_days: number;
}

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  gateway_customer_ref: string | null;
  country?: string; // ISO 3166-1 alpha-2, e.g. "US"
  created_at: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  price_id: string;
  status: string;
  quantity: number;
  current_period_end: string | null;
  next_billing_at: string | null;
  cancel_reason?: string;
  cancelled_at?: string | null;
  created_at: string;
}

export interface GatewayAccount {
  id: string;
  provider: string;
  account_ref: string | null;
  status: string;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: string; // percentage | fixed
  value: number;
  max_redemptions: { Int32: number; Valid: boolean } | number | null;
  redemptions: number;
  status?: string; // active | archived
  archived_at?: string | null;
  archive_reason?: string; // expired | campaign_over | revoked | manual
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  subscription_id: string | null;
  status: string; // draft|open|paid|void|uncollectible
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  invoice_id: string | null;
  gateway_txn_ref: string | null;
  status: string; // succeeded|failed|pending
  amount_minor: number;
  currency: string;
  failure_reason: string | null;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  signing_secret: string;
  events: string[];
  enabled: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: string; // pending|delivered|failed
  attempts: number;
  payload?: unknown; // the event envelope { id, type, mode, created_at, data }
  created_at: string;
}

export interface ApiKey {
  id: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKey {
  secret: string; // shown once
}

export interface SeriesPoint {
  day: string;
  value: number;
}
export interface MetricDelta {
  current: number;
  previous: number;
}
export interface ProductMetric {
  product_id: string;
  name: string;
  active_subscriptions: number;
  mrr_minor: number;
  prev_mrr_minor: number;
}
export interface Analytics {
  summary: {
    customers: number;
    active_subscriptions: number;
    total_subscriptions: number;
    total_revenue_minor: number;
    mrr_minor: number;
  };
  deltas?: {
    revenue: MetricDelta;
    mrr: MetricDelta;
    customers: MetricDelta;
    active_subscriptions: MetricDelta;
  };
  products?: ProductMetric[];
  revenue_by_day: SeriesPoint[];
  subscriptions_by_day: SeriesPoint[];
  customers_by_day?: SeriesPoint[];
  mrr_added_by_day?: SeriesPoint[];
  status_breakdown: { status: string; count: number }[];
  today_hourly?: { hour: number; value: number }[];
  yesterday_hourly?: { hour: number; value: number }[];
}

// WebSocket URL for the live event stream, or null in guest/unauthenticated mode.
export function realtimeUrl(): string | null {
  const token = getToken();
  if (!token || token === GUEST_TOKEN) return null;
  const httpBase = API_BASE || window.location.origin;
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/v1/realtime?token=${encodeURIComponent(token)}&mode=${getMode()}`;
}

export interface Site {
  id: string;
  name: string;
  status: string;
}

export interface BillRunResult {
  marked_due: number;
  processed: number;
  succeeded: number;
  failed: number;
  mode: string;
}

export interface CheckoutAnalytics {
  total_visits: number;
  completed: number;
  visits_by_day: SeriesPoint[];
  by_country: { country: string; count: number }[];
}

export interface BillingRun {
  id: string;
  mode: string;
  source: string; // manual | scheduler
  processed: number;
  succeeded: number;
  failed: number;
  created_at: string;
}

export interface CheckoutSessionCreated {
  id: string;
  url: string;
  status: string;
  expires_at: string;
}

// Public display payload served to the hosted checkout page.
export interface CheckoutSessionDetails {
  id: string;
  status: string;
  merchant_name: string;
  product_name: string;
  amount_minor: number;
  currency: string;
  interval_unit: string;
  interval_count: number;
  trial_days: number;
  quantity: number;
  customer_email: string;
  success_url: string;
  cancel_url: string;
}
