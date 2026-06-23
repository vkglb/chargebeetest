// Developer documentation — the full public API reference, all in one place.
// (Static content; mirrors the live backend routes.)

interface Endpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  desc: string;
  auth: "key" | "jwt" | "public";
  example?: string;
}

interface Section {
  title: string;
  blurb?: string;
  endpoints: Endpoint[];
}

const BASE = "https://api.yourplatform.com";

const SECTIONS: Section[] = [
  {
    title: "Authentication",
    blurb:
      "Server-to-server calls use a secret API key (Developers → API Keys) sent as a Bearer token. Dashboard sessions use a JWT from login. Generate keys, then: Authorization: Bearer <key>.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/signup",
        auth: "public",
        desc: "Create a merchant account + first admin user. Returns a JWT.",
        example: `curl ${BASE}/v1/signup \\
  -H "Content-Type: application/json" \\
  -d '{"merchant_name":"Acme","email":"you@acme.com","password":"supersecret"}'`,
      },
      {
        method: "POST",
        path: "/v1/login",
        auth: "public",
        desc: "Authenticate and receive a JWT for the dashboard API.",
      },
    ],
  },
  {
    title: "Hosted Checkout",
    blurb:
      "Create a checkout session and redirect your customer to the returned url. We capture the card, create the customer + subscription, then redirect to your success_url.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/checkout/sessions",
        auth: "key",
        desc: "Create a hosted checkout session. Returns { id, url, status }.",
        example: `curl ${BASE}/v1/checkout/sessions \\
  -H "Authorization: Bearer live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "price_id": "price_123",
    "quantity": 1,
    "success_url": "https://your-app.com/welcome",
    "cancel_url": "https://your-app.com/pricing"
  }'

# → { "id": "cs_...", "url": "${BASE.replace("api.", "")}/checkout/cs_...", "status": "open" }`,
      },
      {
        method: "GET",
        path: "/v1/checkout/sessions/{id}",
        auth: "public",
        desc: "Public display data for the hosted page (plan, amount, merchant).",
      },
      {
        method: "POST",
        path: "/v1/checkout/sessions/{id}/complete",
        auth: "public",
        desc: "Called by the hosted page on payment. Creates customer + subscription.",
      },
    ],
  },
  {
    title: "Products & Plans",
    endpoints: [
      { method: "POST", path: "/v1/products", auth: "key", desc: "Create a product." },
      { method: "GET", path: "/v1/products", auth: "key", desc: "List products." },
      {
        method: "POST",
        path: "/v1/prices",
        auth: "key",
        desc: "Create a price (interval, amount_minor, currency, trial_days).",
        example: `curl ${BASE}/v1/prices \\
  -H "Authorization: Bearer live_your_api_key" \\
  -d '{
    "product_id": "prod_123",
    "amount_minor": 2900,
    "currency": "USD",
    "interval_unit": "month",
    "interval_count": 1,
    "trial_days": 14
  }'`,
      },
      { method: "GET", path: "/v1/prices", auth: "key", desc: "List prices." },
    ],
  },
  {
    title: "Customers",
    endpoints: [
      { method: "POST", path: "/v1/customers", auth: "key", desc: "Create a customer." },
      { method: "GET", path: "/v1/customers", auth: "key", desc: "List customers." },
    ],
  },
  {
    title: "Subscriptions",
    endpoints: [
      {
        method: "POST",
        path: "/v1/subscriptions",
        auth: "key",
        desc: "Create a subscription for a customer on a plan.",
        example: `curl ${BASE}/v1/subscriptions \\
  -H "Authorization: Bearer live_your_api_key" \\
  -d '{"customer_id":"cus_123","price_id":"price_123","quantity":1}'`,
      },
      { method: "GET", path: "/v1/subscriptions", auth: "key", desc: "List subscriptions." },
    ],
  },
  {
    title: "Coupons",
    endpoints: [
      { method: "POST", path: "/v1/coupons", auth: "key", desc: "Create a coupon (percentage or fixed)." },
      { method: "GET", path: "/v1/coupons", auth: "key", desc: "List coupons." },
    ],
  },
  {
    title: "Invoices & Transactions",
    endpoints: [
      { method: "GET", path: "/v1/invoices", auth: "key", desc: "List invoices." },
      { method: "GET", path: "/v1/transactions", auth: "key", desc: "List charge records." },
    ],
  },
  {
    title: "Payment Gateways",
    endpoints: [
      { method: "GET", path: "/v1/gateways", auth: "key", desc: "List connected gateways." },
      { method: "POST", path: "/v1/gateways", auth: "key", desc: "Connect/update a gateway (stripe, razorpay, braintree, paypal)." },
    ],
  },
  {
    title: "Webhooks",
    blurb:
      "We POST signed events to your endpoints. Verify the signature with the endpoint's signing secret (HMAC-SHA256 of the raw body).",
    endpoints: [
      {
        method: "POST",
        path: "/v1/webhooks",
        auth: "key",
        desc: "Register an endpoint. Returns a signing_secret.",
        example: `curl ${BASE}/v1/webhooks \\
  -H "Authorization: Bearer live_your_api_key" \\
  -d '{"url":"https://your-app.com/webhooks","events":["payment.succeeded","payment.failed"]}'`,
      },
      { method: "GET", path: "/v1/webhooks", auth: "key", desc: "List endpoints." },
      { method: "DELETE", path: "/v1/webhooks/{id}", auth: "key", desc: "Delete an endpoint." },
      { method: "GET", path: "/v1/webhook-deliveries", auth: "key", desc: "Recent delivery attempts." },
    ],
  },
  {
    title: "API Keys",
    endpoints: [
      { method: "POST", path: "/v1/api-keys", auth: "jwt", desc: "Generate a key (secret shown once)." },
      { method: "GET", path: "/v1/api-keys", auth: "jwt", desc: "List keys (metadata only)." },
      { method: "DELETE", path: "/v1/api-keys/{id}", auth: "jwt", desc: "Revoke a key." },
    ],
  },
];

const EVENTS = [
  "subscription.created",
  "subscription.renewed",
  "subscription.cancelled",
  "payment.succeeded",
  "payment.failed",
  "invoice.created",
];

function authLabel(a: Endpoint["auth"]) {
  if (a === "public") return "Public";
  if (a === "jwt") return "Dashboard (JWT)";
  return "API key";
}

export default function Docs() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>API Docs</h2>
          <p>Everything you need to integrate the billing platform</p>
        </div>
      </div>

      <div className="panel">
        <h3>Base URL & authentication</h3>
        <div className="secret-box mono" style={{ borderStyle: "solid" }}>
          {BASE}
        </div>
        <p style={{ color: "var(--muted)" }}>
          Most endpoints require a secret API key as a Bearer token. Create one in{" "}
          <strong>Developers → API Keys</strong> — the full key is shown only once.
        </p>
        <pre className="code-block">{`Authorization: Bearer live_your_api_key`}</pre>
      </div>

      {SECTIONS.map((sec) => (
        <div className="panel" key={sec.title}>
          <h3>{sec.title}</h3>
          {sec.blurb && (
            <p style={{ color: "var(--muted)", marginTop: 0, lineHeight: 1.6 }}>{sec.blurb}</p>
          )}
          {sec.endpoints.map((ep) => (
            <div className="endpoint" key={ep.method + ep.path}>
              <div className="endpoint-line">
                <span className={`method ${ep.method.toLowerCase()}`}>{ep.method}</span>
                <span className="endpoint-path mono">{ep.path}</span>
                <span className="endpoint-auth">{authLabel(ep.auth)}</span>
              </div>
              <div className="endpoint-desc">{ep.desc}</div>
              {ep.example && <pre className="code-block">{ep.example}</pre>}
            </div>
          ))}
        </div>
      ))}

      <div className="panel">
        <h3>Webhook events</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Subscribe to any of these when registering an endpoint:
        </p>
        <div className="chip-row">
          {EVENTS.map((e) => (
            <span className="chip on" key={e}>
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
