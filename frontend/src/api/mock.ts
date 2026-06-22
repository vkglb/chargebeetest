// In-memory mock backend for GUEST/DEMO mode. Lets the full dashboard be used
// without the Go API or a database. Data is seeded with realistic samples and
// persisted to localStorage so it survives reloads. Reset on guest logout.

import type { Product, Price, Customer, Subscription, GatewayAccount } from "./client";

const KEY = "chargeebee_mock_db";

interface DB {
  products: Product[];
  prices: Price[];
  customers: Customer[];
  subscriptions: Subscription[];
  gateways: GatewayAccount[];
}

const MERCHANT = "demo-merchant-0000-0000-000000000000";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowISO(): string {
  return new Date().toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString();
}

function seed(): DB {
  const proId = uuid();
  const teamId = uuid();
  const proPrice: Price = {
    id: uuid(),
    product_id: proId,
    nickname: "Pro Monthly",
    amount_minor: 2900,
    currency: "USD",
    interval_unit: "month",
    interval_count: 1,
    trial_days: 14,
  };
  const teamPrice: Price = {
    id: uuid(),
    product_id: teamId,
    nickname: "Team Yearly",
    amount_minor: 99000,
    currency: "USD",
    interval_unit: "year",
    interval_count: 1,
    trial_days: 0,
  };
  const jane: Customer = {
    id: uuid(),
    email: "jane@acme.com",
    name: "Jane Doe",
    gateway_customer_ref: "cus_demo_jane",
    created_at: nowISO(),
  };
  const sam: Customer = {
    id: uuid(),
    email: "sam@globex.com",
    name: "Sam Park",
    gateway_customer_ref: null,
    created_at: nowISO(),
  };
  return {
    products: [
      { id: proId, merchant_id: MERCHANT, name: "Pro", status: "active", created_at: nowISO() },
      { id: teamId, merchant_id: MERCHANT, name: "Team", status: "active", created_at: nowISO() },
    ],
    prices: [proPrice, teamPrice],
    customers: [jane, sam],
    subscriptions: [
      {
        id: uuid(),
        customer_id: jane.id,
        price_id: proPrice.id,
        status: "active",
        quantity: 1,
        current_period_end: daysFromNow(30),
        next_billing_at: daysFromNow(30),
        created_at: nowISO(),
      },
      {
        id: uuid(),
        customer_id: sam.id,
        price_id: teamPrice.id,
        status: "trialing",
        quantity: 3,
        current_period_end: daysFromNow(14),
        next_billing_at: daysFromNow(14),
        created_at: nowISO(),
      },
    ],
    gateways: [
      {
        id: uuid(),
        provider: "stripe",
        account_ref: "acct_demo_1A2b3C",
        status: "connected",
        created_at: nowISO(),
      },
    ],
  };
}

function load(): DB {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DB>;
      // Backfill any collections added after this DB was first saved, so older
      // demo sessions don't break when new features land.
      return {
        products: parsed.products ?? [],
        prices: parsed.prices ?? [],
        customers: parsed.customers ?? [],
        subscriptions: parsed.subscriptions ?? [],
        gateways: parsed.gateways ?? [],
      };
    } catch {
      /* fall through to seed */
    }
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function resetMock() {
  localStorage.removeItem(KEY);
}

// mockRequest mirrors the subset of the API the dashboard uses.
export async function mockRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const db = load();
  const key = `${method} ${path.split("?")[0]}`;

  switch (key) {
    case "GET /v1/products":
      return db.products as T;
    case "POST /v1/products": {
      const p: Product = {
        id: uuid(),
        merchant_id: MERCHANT,
        name: body.name,
        status: "active",
        created_at: nowISO(),
      };
      db.products.unshift(p);
      save(db);
      return p as T;
    }

    case "GET /v1/prices":
      return db.prices as T;
    case "POST /v1/prices": {
      const pr: Price = {
        id: uuid(),
        product_id: body.product_id,
        nickname: body.nickname || null,
        amount_minor: body.amount_minor,
        currency: body.currency,
        interval_unit: body.interval_unit,
        interval_count: body.interval_count || 1,
        trial_days: body.trial_days || 0,
      };
      db.prices.unshift(pr);
      save(db);
      return pr as T;
    }

    case "GET /v1/customers":
      return db.customers as T;
    case "POST /v1/customers": {
      const c: Customer = {
        id: uuid(),
        email: body.email,
        name: body.name || null,
        gateway_customer_ref: body.gateway_customer_ref || null,
        created_at: nowISO(),
      };
      db.customers.unshift(c);
      save(db);
      return c as T;
    }

    case "GET /v1/subscriptions":
      return db.subscriptions as T;
    case "POST /v1/subscriptions": {
      const price = db.prices.find((p) => p.id === body.price_id);
      const trial = price?.trial_days ?? 0;
      const s: Subscription = {
        id: uuid(),
        customer_id: body.customer_id,
        price_id: body.price_id,
        status: trial > 0 ? "trialing" : "active",
        quantity: body.quantity || 1,
        current_period_end: daysFromNow(trial > 0 ? trial : 30),
        next_billing_at: daysFromNow(trial > 0 ? trial : 30),
        created_at: nowISO(),
      };
      db.subscriptions.unshift(s);
      save(db);
      return s as T;
    }

    case "GET /v1/gateways":
      return db.gateways as T;
    case "POST /v1/gateways": {
      const provider = body.provider || "stripe";
      const existing = db.gateways.find((g) => g.provider === provider);
      if (existing) {
        existing.account_ref = body.account_ref || existing.account_ref;
        existing.status = "connected";
        save(db);
        return existing as T;
      }
      const g: GatewayAccount = {
        id: uuid(),
        provider,
        account_ref: body.account_ref || `acct_demo_${Math.random().toString(36).slice(2, 8)}`,
        status: "connected",
        created_at: nowISO(),
      };
      db.gateways.unshift(g);
      save(db);
      return g as T;
    }

    default:
      throw new Error(`mock: unhandled ${key}`);
  }
}
