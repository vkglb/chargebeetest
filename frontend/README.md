# Billing Platform — Merchant Dashboard (React + TS)

The web app businesses use to sign up and run their billing — the Chargebee-style
front end for the Go API in [../backend](../backend).

## Stack
React 18 · TypeScript · Vite · React Router

## Run
```bash
npm install
npm run dev        # http://localhost:5173  (proxies /v1 → backend :8080)
```
The backend must be running on `:8080` (see ../backend/README.md).

## What a business can do
- **Sign up / log in** — creates a merchant + admin user, stores the JWT
- **Products & Plans** — create products, add prices (amount, currency, interval, trial)
- **Customers** — add the people they bill (optionally link a Stripe `cus_…`)
- **Subscriptions** — subscribe a customer to a plan; the backend scheduler bills them
- **Overview** — counts + recent subscriptions

## Structure
```
src/
  api/client.ts        typed fetch wrapper + JWT + domain types
  auth/AuthContext.tsx  signup/login/logout, token persistence
  components/           Layout (sidebar), ProtectedRoute
  pages/                Login, Signup, Overview, Products, Customers, Subscriptions
  lib/format.ts        money/date helpers
```

## Build
```bash
npm run build      # tsc -b && vite build  → dist/
```
