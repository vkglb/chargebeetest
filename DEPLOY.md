# Deploying to Render

Two ways: the **Blueprint** (one click, recommended) or **manual** web-service setup.

---

## Option A — Blueprint (recommended)

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo. It reads [`render.yaml`](render.yaml).
3. Click **Apply**. Render creates:
   - `chargeebee-db` (Postgres)
   - `chargeebee-api` (Go web service) — runs migrations on boot (`AUTO_MIGRATE=true`)
   - `chargeebee-dashboard` (React static site)
4. After the first deploy, set the two cross-URLs:
   - On **chargeebee-dashboard** → env var `VITE_API_BASE` = the API URL, e.g. `https://chargeebee-api.onrender.com` → trigger a redeploy.
   - On **chargeebee-api** → env var `CHECKOUT_BASE_URL` = the dashboard URL, e.g. `https://chargeebee-dashboard.onrender.com`.
   - (Optional, tighten security) set `CORS_ORIGINS` on the API to the dashboard URL.

Done. Open the dashboard URL and sign up.

---

## Option B — Manual web service (the form you're on)

The backend is in the `backend/` subdirectory (monorepo), so the defaults won't work. Use:

| Field | Value |
|---|---|
| **Root Directory** | `backend` |
| **Build Command** | `go build -tags netgo -ldflags '-s -w' -o app ./cmd/api` |
| **Start Command** | `./app` |
| **Health Check Path** | `/healthz` |

> ⚠️ Two critical fixes vs the defaults: set **Root Directory = `backend`**, and append **`./cmd/api`** to the build command (the repo root isn't a `main` package).

### Database
Create a Render **PostgreSQL** instance first. Copy its **Internal Connection String**.

### Environment variables (on the web service)
| Key | Value |
|---|---|
| `DATABASE_URL` | the Postgres internal connection string |
| `AUTO_MIGRATE` | `true` (creates all tables on boot) |
| `JWT_SECRET` | a long random string |
| `CORS_ORIGINS` | `*` (or your dashboard URL) |
| `CHECKOUT_BASE_URL` | your dashboard URL (for hosted-checkout links) |
| `STRIPE_SECRET_KEY` | optional, for real charges |
| `SENDGRID_API_KEY` | optional, for emails |

> You do **not** set `PORT` — Render injects it and the app binds to it automatically.

### Frontend (separate Static Site)
Render → **New → Static Site** → same repo:
| Field | Value |
|---|---|
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |
| **Env var** | `VITE_API_BASE` = your API URL |
| **Rewrite rule** | `/*` → `/index.html` (SPA routing) |

---

## Notes
- **Free tier**: the API spins down when idle (first request after is slow), and free Postgres expires after ~30 days — fine for testing.
- **Migrations**: with `AUTO_MIGRATE=true` the API runs `goose up` on startup. To run them manually instead, use `go run ./cmd/migrate up` (see [backend/README.md](backend/README.md)).
- **Guest/demo mode** in the dashboard works with no backend at all — useful to verify the static deploy independently.
