// In-memory mock backend for GUEST/DEMO mode. Lets the full dashboard be used
// without the Go API or a database. Data is seeded with realistic samples and
// persisted to localStorage so it survives reloads. Reset on guest logout.

import {
  getMode,
  type Product,
  type Price,
  type Customer,
  type Subscription,
  type GatewayAccount,
  type Coupon,
  type Invoice,
  type Transaction,
  type WebhookEndpoint,
  type WebhookDelivery,
  type ApiKey,
} from "./client";

// Each mode gets its own isolated dataset, mirroring real test/live separation.
function storageKey(): string {
  return `chargeebee_mock_db_${getMode()}`;
}

interface DB {
  products: Product[];
  prices: Price[];
  customers: Customer[];
  subscriptions: Subscription[];
  gateways: GatewayAccount[];
  coupons: Coupon[];
  invoices: Invoice[];
  transactions: Transaction[];
  webhooks: WebhookEndpoint[];
  webhookDeliveries: WebhookDelivery[];
  apiKeys: ApiKey[];
  checkoutSessions: CheckoutMockSession[];
}

interface CheckoutMockSession {
  id: string;
  price_id: string;
  quantity: number;
  status: string;
  customer_email: string;
  success_url: string;
  cancel_url: string;
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

function origin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
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
  const janeSub: Subscription = {
    id: uuid(),
    customer_id: jane.id,
    price_id: proPrice.id,
    status: "active",
    quantity: 1,
    current_period_end: daysFromNow(30),
    next_billing_at: daysFromNow(30),
    created_at: nowISO(),
  };
  const samSub: Subscription = {
    id: uuid(),
    customer_id: sam.id,
    price_id: teamPrice.id,
    status: "trialing",
    quantity: 3,
    current_period_end: daysFromNow(14),
    next_billing_at: daysFromNow(14),
    created_at: nowISO(),
  };

  const janeInvoice: Invoice = {
    id: uuid(),
    customer_id: jane.id,
    subscription_id: janeSub.id,
    status: "paid",
    currency: "USD",
    subtotal_minor: 2900,
    discount_minor: 0,
    tax_minor: 0,
    total_minor: 2900,
    period_start: daysFromNow(-30),
    period_end: daysFromNow(0),
    paid_at: daysFromNow(-30),
    created_at: daysFromNow(-30),
  };

  const epId = uuid();

  return {
    products: [
      { id: proId, merchant_id: MERCHANT, name: "Pro", status: "active", created_at: nowISO() },
      { id: teamId, merchant_id: MERCHANT, name: "Team", status: "active", created_at: nowISO() },
    ],
    prices: [proPrice, teamPrice],
    customers: [jane, sam],
    subscriptions: [janeSub, samSub],
    gateways: [
      {
        id: uuid(),
        provider: "stripe",
        account_ref: "acct_demo_1A2b3C",
        status: "connected",
        created_at: nowISO(),
      },
    ],
    coupons: [
      {
        id: uuid(),
        code: "WELCOME20",
        discount_type: "percentage",
        value: 20,
        max_redemptions: 100,
        redemptions: 12,
        created_at: nowISO(),
      },
      {
        id: uuid(),
        code: "FLAT10",
        discount_type: "fixed",
        value: 1000,
        max_redemptions: null,
        redemptions: 3,
        created_at: nowISO(),
      },
    ],
    invoices: [janeInvoice],
    transactions: [
      {
        id: uuid(),
        invoice_id: janeInvoice.id,
        gateway_txn_ref: "pi_demo_3Nk2",
        status: "succeeded",
        amount_minor: 2900,
        currency: "USD",
        failure_reason: null,
        created_at: daysFromNow(-30),
      },
    ],
    webhooks: [
      {
        id: epId,
        url: "https://api.acme.com/webhooks/billing",
        signing_secret: "whsec_demo_9f2a7c1e",
        events: ["subscription.created", "payment.succeeded", "payment.failed"],
        enabled: true,
        created_at: nowISO(),
      },
    ],
    webhookDeliveries: [
      {
        id: uuid(),
        endpoint_id: epId,
        event_type: "payment.succeeded",
        status: "delivered",
        attempts: 1,
        created_at: daysFromNow(-1),
      },
      {
        id: uuid(),
        endpoint_id: epId,
        event_type: "subscription.created",
        status: "delivered",
        attempts: 1,
        created_at: daysFromNow(-2),
      },
      {
        id: uuid(),
        endpoint_id: epId,
        event_type: "payment.failed",
        status: "failed",
        attempts: 3,
        created_at: daysFromNow(-3),
      },
    ],
    apiKeys: [
      {
        id: uuid(),
        prefix: "test_aZ4k",
        scopes: ["read", "write"],
        last_used_at: daysFromNow(-1),
        revoked_at: null,
        created_at: daysFromNow(-10),
      },
    ],
    checkoutSessions: [],
  };
}

function emptyDB(): DB {
  return {
    products: [],
    prices: [],
    customers: [],
    subscriptions: [],
    gateways: [],
    coupons: [],
    invoices: [],
    transactions: [],
    webhooks: [],
    webhookDeliveries: [],
    apiKeys: [],
    checkoutSessions: [],
  };
}

function load(): DB {
  const raw = localStorage.getItem(storageKey());
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
        coupons: parsed.coupons ?? [],
        invoices: parsed.invoices ?? [],
        transactions: parsed.transactions ?? [],
        webhooks: parsed.webhooks ?? [],
        webhookDeliveries: parsed.webhookDeliveries ?? [],
        apiKeys: parsed.apiKeys ?? [],
        checkoutSessions: parsed.checkoutSessions ?? [],
      };
    } catch {
      /* fall through to seed */
    }
  }
  // Test mode is seeded with rich sample data; live starts empty (true isolation).
  const db = getMode() === "live" ? emptyDB() : seed();
  save(db);
  return db;
}

function save(db: DB) {
  localStorage.setItem(storageKey(), JSON.stringify(db));
}

export function resetMock() {
  localStorage.removeItem("chargeebee_mock_db_test");
  localStorage.removeItem("chargeebee_mock_db_live");
}

// mockRequest mirrors the subset of the API the dashboard uses.
export async function mockRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const db = load();
  const key = `${method} ${path.split("?")[0]}`;

  switch (key) {
    case "GET /v1/sites":
      return [{ id: "demo-merchant-0000", name: "Demo Business", status: "active" }] as T;

    case "POST /v1/dev/seed": {
      // Re-seed the current mode's dataset with sample data.
      save(seed());
      return { status: "seeded" } as T;
    }

    case "GET /v1/analytics": {
      const statusMap: Record<string, number> = {};
      db.subscriptions.forEach((s) => (statusMap[s.status] = (statusMap[s.status] || 0) + 1));
      let mrr = 0;
      db.subscriptions
        .filter((s) => s.status === "active" || s.status === "trialing")
        .forEach((s) => {
          const p = db.prices.find((x) => x.id === s.price_id);
          if (!p) return;
          const monthly =
            p.interval_unit === "year"
              ? p.amount_minor / 12
              : p.interval_unit === "week"
                ? p.amount_minor * 4
                : p.interval_unit === "day"
                  ? p.amount_minor * 30
                  : p.amount_minor;
          mrr += monthly * s.quantity;
        });
      // Synthesized 30-day series so the demo charts look alive.
      const revenue_by_day: { day: string; value: number }[] = [];
      const subscriptions_by_day: { day: string; value: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        revenue_by_day.push({ day, value: Math.round((Math.sin(i / 4) + 1.6) * 4000 + Math.random() * 2500) });
        subscriptions_by_day.push({ day, value: Math.round(Math.random() * 3) });
      }
      const total = revenue_by_day.reduce((a, b) => a + b.value, 0);
      return {
        summary: {
          customers: db.customers.length,
          active_subscriptions: statusMap["active"] || 0,
          total_subscriptions: db.subscriptions.length,
          total_revenue_minor: total,
          mrr_minor: Math.round(mrr),
        },
        revenue_by_day,
        subscriptions_by_day,
        status_breakdown: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      } as T;
    }

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

    case "GET /v1/coupons":
      return db.coupons as T;
    case "POST /v1/coupons": {
      const c: Coupon = {
        id: uuid(),
        code: body.code,
        discount_type: body.discount_type,
        value: body.value,
        max_redemptions: body.max_redemptions || null,
        redemptions: 0,
        created_at: nowISO(),
      };
      db.coupons.unshift(c);
      save(db);
      return c as T;
    }

    case "GET /v1/invoices":
      return db.invoices as T;

    case "GET /v1/transactions":
      return db.transactions as T;

    case "GET /v1/webhooks":
      return db.webhooks as T;
    case "POST /v1/webhooks": {
      const dupUrl = (body.url || "").trim().toLowerCase();
      if (db.webhooks.some((w) => w.url.trim().toLowerCase() === dupUrl)) {
        throw new Error("this URL is already added as a webhook");
      }
      const ep: WebhookEndpoint = {
        id: uuid(),
        url: body.url,
        signing_secret: "whsec_" + Math.random().toString(36).slice(2, 18),
        events: body.events && body.events.length ? body.events : ["*"],
        enabled: true,
        created_at: nowISO(),
      };
      db.webhooks.unshift(ep);
      // Seed a few sample deliveries so the per-webhook log isn't empty in demo.
      const sampleEvents = ep.events[0] === "*" ? ["subscription.created", "payment.succeeded"] : ep.events;
      sampleEvents.slice(0, 3).forEach((evt, i) => {
        db.webhookDeliveries.unshift({
          id: uuid(),
          endpoint_id: ep.id,
          event_type: evt,
          status: i === 1 ? "failed" : "delivered",
          attempts: i === 1 ? 3 : 1,
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
        });
      });
      save(db);
      return ep as T;
    }

    case "GET /v1/webhook-deliveries":
      return db.webhookDeliveries as T;

    case "GET /v1/api-keys":
      return db.apiKeys as T;
    case "POST /v1/api-keys": {
      const env = body?.env === "live" ? "live" : "test";
      const body2 = Math.random().toString(36).slice(2, 10);
      const rec: ApiKey = {
        id: uuid(),
        prefix: `${env}_${body2.slice(0, 4)}`,
        scopes: ["read", "write"],
        last_used_at: null,
        revoked_at: null,
        created_at: nowISO(),
      };
      db.apiKeys.unshift(rec);
      save(db);
      return {
        ...rec,
        secret: `${env}_${body2}${Math.random().toString(36).slice(2, 18)}`,
      } as T;
    }

    case "POST /v1/checkout/sessions": {
      const sess: CheckoutMockSession = {
        id: uuid(),
        price_id: body.price_id,
        quantity: body.quantity || 1,
        status: "open",
        customer_email: body.customer_email || "",
        success_url: body.success_url || `${origin()}/checkout/success`,
        cancel_url: body.cancel_url || "",
      };
      db.checkoutSessions.unshift(sess);
      save(db);
      return {
        id: sess.id,
        url: `${origin()}/checkout/${sess.id}`,
        status: "open",
        expires_at: daysFromNow(1),
      } as T;
    }

    default:
      // ── Hosted checkout (dynamic id in path) ──
      if (method === "GET" && path.startsWith("/v1/checkout/sessions/")) {
        const id = path.split("/")[4];
        const sess = db.checkoutSessions.find((c) => c.id === id);
        if (!sess) throw new Error("checkout session not found");
        const price = db.prices.find((p) => p.id === sess.price_id);
        const product = price ? db.products.find((p) => p.id === price.product_id) : undefined;
        return {
          id: sess.id,
          status: sess.status,
          merchant_name: "Demo Business",
          product_name: product?.name ?? "Plan",
          amount_minor: price?.amount_minor ?? 0,
          currency: price?.currency ?? "USD",
          interval_unit: price?.interval_unit ?? "month",
          interval_count: price?.interval_count ?? 1,
          trial_days: price?.trial_days ?? 0,
          quantity: sess.quantity,
          customer_email: sess.customer_email,
          success_url: sess.success_url,
          cancel_url: sess.cancel_url,
        } as T;
      }
      if (method === "POST" && path.endsWith("/complete")) {
        const id = path.split("/")[4];
        const sess = db.checkoutSessions.find((c) => c.id === id);
        if (!sess) throw new Error("checkout session not found");
        const price = db.prices.find((p) => p.id === sess.price_id);
        const trial = price?.trial_days ?? 0;
        // Create customer + subscription, like the real backend.
        const customer: Customer = {
          id: uuid(),
          email: body.email,
          name: body.name || null,
          gateway_customer_ref: "cus_demo_" + Math.random().toString(36).slice(2, 8),
          created_at: nowISO(),
        };
        db.customers.unshift(customer);
        const sub: Subscription = {
          id: uuid(),
          customer_id: customer.id,
          price_id: sess.price_id,
          status: trial > 0 ? "trialing" : "active",
          quantity: sess.quantity,
          current_period_end: daysFromNow(trial > 0 ? trial : 30),
          next_billing_at: daysFromNow(trial > 0 ? trial : 30),
          created_at: nowISO(),
        };
        db.subscriptions.unshift(sub);
        sess.status = "completed";
        save(db);
        return {
          status: "completed",
          subscription_id: sub.id,
          redirect_url: sess.success_url,
        } as T;
      }
      // DELETE handlers (path includes an id segment).
      if (method === "DELETE" && path.startsWith("/v1/webhooks/")) {
        const id = path.split("/").pop();
        db.webhooks = db.webhooks.filter((w) => w.id !== id);
        save(db);
        return undefined as T;
      }
      if (method === "DELETE" && path.startsWith("/v1/api-keys/")) {
        const id = path.split("/").pop();
        const k = db.apiKeys.find((x) => x.id === id);
        if (k) k.revoked_at = nowISO();
        save(db);
        return undefined as T;
      }
      throw new Error(`mock: unhandled ${key}`);
  }
}
