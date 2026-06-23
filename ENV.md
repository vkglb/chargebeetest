# Environment Variables — Single Source of Truth

All configuration for every deploy target lives here. The same variables are
consumed three ways:

- **Local dev** → `.env` files (`backend/.env`, `frontend/.env.local`)
- **Render** → declared per-service in [`render.yaml`](render.yaml) (or pasted in the dashboard)
- **Anywhere else (Docker/VM/K8s)** → a single root `.env` read by [`docker-compose.yml`](docker-compose.yml)

Copy the examples to start: `backend/.env.example`, `frontend/.env.example`.

---

## Backend API service

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | local dev DSN | Postgres connection string. On Render use the DB's **Internal Database URL**. |
| `AUTO_MIGRATE` | – | `false` | `true` → runs migrations on startup. Set **`true`** on Render/PaaS. |
| `JWT_SECRET` | ✅ (prod) | dev placeholder | Signs dashboard sessions. Use a long random string. |
| `PORT` | – | – | Injected by the platform (Render). If set, the app binds to it (overrides `HTTP_ADDR`). |
| `HTTP_ADDR` | – | `:8080` | Listen address for local/Docker (ignored when `PORT` is set). |
| `CHECKOUT_BASE_URL` | ✅ (prod) | `http://localhost:5173` | Where hosted-checkout links point — the **dashboard** URL. |
| `CORS_ORIGINS` | – | `*` | Comma-separated allowed browser origins. Tighten to the dashboard URL in prod. |
| `APP_ENV` | – | `development` | `development` \| `production`. |
| `SHUTDOWN_TIMEOUT_SECONDS` | – | `15` | Graceful-shutdown window. |
| `STRIPE_SECRET_KEY` | – | – | Platform-level Stripe key (per-merchant tokens live in the DB). |
| `STRIPE_WEBHOOK_SECRET` | – | – | Verifies inbound Stripe webhooks. |
| `SENDGRID_API_KEY` | – | – | Transactional / dunning email. |

## Frontend (static dashboard)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE` | ✅ (prod) | empty | Backend API URL. Empty in dev (Vite proxy). Build-time only — set before `npm run build`. |

---

## Render — what to set where (current manual deploy)

**Postgres** `chargeebee-db` → already created. Open it → **Connect** → copy the **Internal Database URL**.

**Web service** `chargeebee-api` → Environment tab:
```
DATABASE_URL        = <Internal Database URL from chargeebee-db>
AUTO_MIGRATE        = true
JWT_SECRET          = <long random string>
CHECKOUT_BASE_URL   = <dashboard static-site URL>   # set after frontend deploys
CORS_ORIGINS        = *                              # or the dashboard URL
```
(Do NOT set `PORT` — Render injects it.)

**Static site** `chargeebee-dashboard` → Environment tab:
```
VITE_API_BASE       = <chargeebee-api URL, e.g. https://chargeebee-api.onrender.com>
```

> Tip: with the **Blueprint** ([render.yaml](render.yaml)), `DATABASE_URL` and
> `JWT_SECRET` are wired/generated automatically; you only fill the two cross-URLs.

---

## Deploy somewhere else (portable)

One root `.env` drives the whole stack via Docker Compose:

```bash
cp backend/.env.example .env     # edit values
docker compose up --build        # postgres + api (+ optional frontend)
```

Because every host reads the **same variable names** documented above, moving
between Render, a VM, Fly.io, or Kubernetes is just "provide these vars."
