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
  type BillingRun,
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
  billingRuns: BillingRun[];
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
    country: "US",
    created_at: nowISO(),
  };
  const sam: Customer = {
    id: uuid(),
    email: "sam@globex.com",
    name: "Sam Park",
    gateway_customer_ref: null,
    country: "GB",
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
        content_type: "application/json",
        verify_ssl: true,
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
        response_code: 200,
        error: null,
        payload: { type: "payment.succeeded", data: { subscription_id: janeSub.id, amount_minor: 2900 } },
        created_at: daysFromNow(-1),
      },
      {
        id: uuid(),
        endpoint_id: epId,
        event_type: "subscription.created",
        status: "delivered",
        attempts: 1,
        response_code: 200,
        error: null,
        payload: { type: "subscription.created", data: { subscription_id: janeSub.id } },
        created_at: daysFromNow(-2),
      },
      {
        id: uuid(),
        endpoint_id: epId,
        event_type: "payment.failed",
        status: "failed",
        attempts: 3,
        response_code: 500,
        error: "endpoint returned HTTP 500",
        payload: { type: "payment.failed", data: { subscription_id: janeSub.id, reason: "card_declined" } },
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
    billingRuns: [],
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
    billingRuns: [],
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
        billingRuns: parsed.billingRuns ?? [],
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

    case "GET /v1/me":
      return {
        user_id: "demo-user-0000",
        merchant_id: MERCHANT,
        tour_completed: localStorage.getItem("chargeebee_tour_done") === "1",
        two_factor_enabled: localStorage.getItem("chargeebee_2fa_enabled") === "true",
      } as T;

    case "POST /v1/me/tour/complete":
      localStorage.setItem("chargeebee_tour_done", "1");
      return undefined as T;

    case "POST /v1/me/2fa":
      if (body?.enabled) {
        localStorage.setItem("chargeebee_2fa_enabled", "true");
      } else {
        localStorage.removeItem("chargeebee_2fa_enabled");
      }
      return undefined as T;

    case "POST /v1/dev/seed": {
      // Re-seed the current mode's dataset with sample data.
      save(seed());
      return { status: "seeded" } as T;
    }

    case "GET /v1/analytics": {
      const statusMap: Record<string, number> = {};
      db.subscriptions.forEach((s) => (statusMap[s.status] = (statusMap[s.status] || 0) + 1));
      const monthlyOf = (priceId: string) => {
        const p = db.prices.find((x) => x.id === priceId);
        if (!p) return 0;
        return p.interval_unit === "year"
          ? p.amount_minor / 12
          : p.interval_unit === "week"
            ? p.amount_minor * 4
            : p.interval_unit === "day"
              ? p.amount_minor * 30
              : p.amount_minor;
      };
      let mrr = 0;
      // Per-product MRR + active count for the breakdown table.
      const byProduct: Record<string, { name: string; mrr: number; subs: number }> = {};
      db.subscriptions
        .filter((s) => s.status === "active" || s.status === "trialing")
        .forEach((s) => {
          const p = db.prices.find((x) => x.id === s.price_id);
          if (!p) return;
          const m = monthlyOf(s.price_id) * s.quantity;
          mrr += m;
          const prod = db.products.find((x) => x.id === p.product_id);
          const key = p.product_id;
          if (!byProduct[key]) byProduct[key] = { name: prod?.name ?? "Product", mrr: 0, subs: 0 };
          byProduct[key].mrr += m;
          byProduct[key].subs += 1;
        });
      // Synthesized 30-day series so the demo charts look alive.
      const revenue_by_day: { day: string; value: number }[] = [];
      const subscriptions_by_day: { day: string; value: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        revenue_by_day.push({ day, value: Math.round((Math.sin(i / 4) + 1.6) * 4000 + Math.random() * 2500) });
        subscriptions_by_day.push({ day, value: Math.round(Math.random() * 3) });
      }
      const customers_by_day = revenue_by_day.map((p) => ({
        day: p.day,
        value: Math.round(Math.random() * 2),
      }));
      const mrr_added_by_day = revenue_by_day.map((p) => ({
        day: p.day,
        value: Math.round(Math.random() * 1500),
      }));
      const total = revenue_by_day.reduce((a, b) => a + b.value, 0);
      const activeSubs = statusMap["active"] || 0;
      const customers = db.customers.length;
      // Intraday hourly gross volume (today up to the current hour, yesterday full day).
      const nowHour = new Date().getUTCHours();
      const today_hourly: { hour: number; value: number }[] = [];
      for (let h = 0; h <= nowHour; h++) {
        if (Math.random() < 0.5) today_hourly.push({ hour: h, value: Math.round(Math.random() * 1500 + 200) });
      }
      const yesterday_hourly: { hour: number; value: number }[] = [];
      for (let h = 0; h < 24; h++) {
        if (Math.random() < 0.45) yesterday_hourly.push({ hour: h, value: Math.round(Math.random() * 1500 + 200) });
      }
      return {
        summary: {
          customers,
          active_subscriptions: activeSubs,
          total_subscriptions: db.subscriptions.length,
          total_revenue_minor: total,
          mrr_minor: Math.round(mrr),
        },
        // Demo deltas: prior period synthesized a bit lower so growth is visible.
        deltas: {
          revenue: { current: total, previous: Math.round(total * 0.88) },
          mrr: { current: Math.round(mrr), previous: Math.round(mrr * 0.85) },
          customers: { current: customers, previous: Math.max(0, customers - 1) },
          active_subscriptions: { current: activeSubs, previous: Math.max(0, activeSubs - 1) },
        },
        products: Object.entries(byProduct).map(([product_id, v]) => ({
          product_id,
          name: v.name,
          active_subscriptions: v.subs,
          mrr_minor: Math.round(v.mrr),
          prev_mrr_minor: Math.round(v.mrr * 0.82),
        })),
        revenue_by_day,
        subscriptions_by_day,
        customers_by_day,
        mrr_added_by_day,
        status_breakdown: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
        today_hourly,
        yesterday_hourly,
      } as T;
    }

    case "POST /v1/dev/bill-now": {
      // Simulate a scheduler pass: bill every active/past_due subscription,
      // creating an invoice + succeeded transaction and advancing the period.
      const billable = db.subscriptions.filter(
        (s) => s.status === "active" || s.status === "past_due",
      );
      let succeeded = 0;
      billable.forEach((s) => {
        const price = db.prices.find((p) => p.id === s.price_id);
        const amount = (price?.amount_minor ?? 0) * s.quantity;
        const inv: Invoice = {
          id: uuid(),
          customer_id: s.customer_id,
          subscription_id: s.id,
          status: "paid",
          currency: price?.currency ?? "USD",
          subtotal_minor: amount,
          discount_minor: 0,
          tax_minor: 0,
          total_minor: amount,
          period_start: daysFromNow(0),
          period_end: daysFromNow(30),
          paid_at: nowISO(),
          created_at: nowISO(),
        };
        db.invoices.unshift(inv);
        db.transactions.unshift({
          id: uuid(),
          invoice_id: inv.id,
          gateway_txn_ref: "pi_sbx_" + Math.random().toString(36).slice(2, 14),
          status: "succeeded",
          amount_minor: amount,
          currency: inv.currency,
          failure_reason: null,
          created_at: nowISO(),
        });
        s.status = "active";
        s.next_billing_at = daysFromNow(30);
        succeeded++;
      });
      db.billingRuns.unshift({
        id: uuid(),
        mode: getMode(),
        source: "manual",
        processed: billable.length,
        succeeded,
        failed: 0,
        created_at: nowISO(),
      });
      save(db);
      return {
        marked_due: billable.length,
        processed: billable.length,
        succeeded,
        failed: 0,
        mode: getMode(),
      } as T;
    }

    case "GET /v1/billing-runs":
      return db.billingRuns as T;

    case "GET /v1/analytics/checkout": {
      const visits_by_day: { day: string; value: number }[] = [];
      let total = 0;
      for (let i = 29; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const v = Math.round(Math.random() * 6) + 2;
        total += v;
        visits_by_day.push({ day, value: v });
      }
      const fractions: [string, number][] = [
        ["US", 0.4],
        ["GB", 0.15],
        ["IN", 0.12],
        ["DE", 0.1],
        ["CA", 0.08],
        ["AU", 0.08],
        ["FR", 0.07],
      ];
      const by_country = fractions.map(([country, f]) => ({ country, count: Math.round(total * f) }));
      return {
        total_visits: total,
        completed: Math.round(total * 0.35),
        visits_by_day,
        by_country,
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
        country: body.country || "",
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
        signing_secret: (body.secret && body.secret.trim()) || "whsec_" + Math.random().toString(36).slice(2, 18),
        events: body.events && body.events.length ? body.events : ["*"],
        enabled: true,
        content_type: body.content_type || "application/json",
        verify_ssl: body.verify_ssl !== false,
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
          response_code: i === 1 ? 500 : 200,
          error: i === 1 ? "endpoint returned HTTP 500" : null,
          payload: { type: evt, data: { subscription_id: db.subscriptions[0]?.id } },
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
      // Guest/demo mode never has a real gateway — always simulate vaulting.
      if (method === "POST" && /\/v1\/checkout\/sessions\/[^/]+\/setup-intent$/.test(path)) {
        return { simulated: true } as T;
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
          // Paid plans deduct the first payment now; trials just vault the card.
          payment_status: trial > 0 ? "trial" : "succeeded",
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
      if (method === "DELETE" && path.startsWith("/v1/gateways/")) {
        const provider = path.split("/").pop();
        db.gateways = db.gateways.filter((g) => g.provider !== provider);
        save(db);
        return { status: "disconnected", provider } as T;
      }
      if (method === "PATCH" && path.startsWith("/v1/coupons/")) {
        const id = path.split("/").pop();
        const c = db.coupons.find((x) => x.id === id);
        if (!c) throw new Error("coupon not found");
        c.status = body?.status;
        if (body?.status === "archived") {
          c.archived_at = nowISO();
          c.archive_reason = body?.reason || "manual";
        } else {
          c.archived_at = null;
          c.archive_reason = "";
        }
        save(db);
        return c as T;
      }
      if (method === "DELETE" && path.startsWith("/v1/coupons/")) {
        const id = path.split("/").pop();
        db.coupons = db.coupons.filter((x) => x.id !== id);
        save(db);
        return { status: "deleted", id } as T;
      }
      if (method === "POST" && /^\/v1\/subscriptions\/[^/]+\/cancel$/.test(path)) {
        const id = path.split("/")[3];
        const sub = db.subscriptions.find((x) => x.id === id);
        if (!sub) throw new Error("subscription not found");
        sub.status = "cancelled";
        sub.cancel_reason = body?.reason || "other";
        sub.cancelled_at = nowISO();
        sub.next_billing_at = null;
        save(db);
        return sub as T;
      }
      if (method === "POST" && /^\/v1\/webhook-deliveries\/[^/]+\/resend$/.test(path)) {
        const id = path.split("/")[3];
        const prev = db.webhookDeliveries.find((x) => x.id === id);
        if (!prev) throw new Error("delivery not found");
        db.webhookDeliveries.unshift({
          ...prev,
          id: uuid(),
          status: "delivered",
          attempts: 1,
          response_code: 200,
          error: null,
          created_at: nowISO(),
        });
        save(db);
        return { status: "resent", id } as T;
      }
      throw new Error(`mock: unhandled ${key}`);
  }
}
