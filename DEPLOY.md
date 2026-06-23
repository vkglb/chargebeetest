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

## Running migrations from containers

Three ways, all using the **same embedded SQL** — pick what fits the host:

1. **App self-migrates** (simplest, used on Render): set `AUTO_MIGRATE=true` on the
   API service. It runs `goose up` on every boot (idempotent).

2. **Dedicated migrate container** (Docker Compose): a one-shot `migrate` service
   runs migrations, then the `api` waits for it to finish before starting.
   ```bash
   docker compose up --build              # postgres → migrate (runs) → api
   docker compose run --rm migrate up     # apply migrations on demand
   docker compose run --rm migrate status # show status
   docker compose run --rm migrate down   # roll back the last one
   ```
   The image builds two binaries: `/app` (server) and `/migrate` (runner).

3. **Run the migrate binary directly** in any container:
   ```bash
   docker run --rm -e DATABASE_URL=... --entrypoint /migrate chargeebee-backend up
   ```

On Render's **Docker** runtime you can also set a **Pre-Deploy Command** of
`/migrate up`; on Render's **native Go** runtime keep `AUTO_MIGRATE=true`.

## Notes
- **Free tier**: the API spins down when idle (first request after is slow), and free Postgres expires after ~30 days — fine for testing.
- **Guest/demo mode** in the dashboard works with no backend at all — useful to verify the static deploy independently.
