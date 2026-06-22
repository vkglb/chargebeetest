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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // In guest mode, short-circuit to the in-memory mock backend.
  if (isGuest()) {
    return mockRequest<T>(method, path, body);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.error ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

// ── Domain types (mirror the Go API responses) ──────────────────────────────
export interface AuthResponse {
  token: string;
  merchant_id: string;
  user_id: string;
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
  created_at: string;
}

export interface GatewayAccount {
  id: string;
  provider: string;
  account_ref: string | null;
  status: string;
  created_at: string;
}
