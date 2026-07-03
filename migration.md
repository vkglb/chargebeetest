# Database & Migrations

Everything you need to create the schema, apply migrations, and move data
between Postgres databases. **All `make` commands run from `backend/`.**

The schema is defined by [goose](https://github.com/pressly/goose) migrations in
`backend/migrations/*.sql`. They are **embedded into the Go binaries** (`//go:embed`),
so applying them needs no goose CLI — just the app or the `migrate` command.

---

## 1. Prerequisites

- **Postgres** reachable via a connection string.
- **`DATABASE_URL`** set (or passed inline). Format:
  ```
  postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
  ```
  Local default (docker-compose): `postgres://chargeebee:chargeebee@localhost:5432/chargeebee?sslmode=disable`
- For **dump/restore** only: the Postgres client tools `pg_dump` / `pg_restore`
  installed locally (they ship with any Postgres install).

Pass the URL inline like:
```bash
DATABASE_URL="postgres://…" make migrate-up
```

---

## 2. Apply migrations (create all tables)

### Automatic — on app boot (what Render uses)
Set the env var; the API runs all pending migrations on startup:
```
AUTO_MIGRATE=true
```
Nothing else to do — a brand-new empty database is fully built on first boot.

### Manual — the migrate command
```bash
cd backend
make migrate-up        # apply all pending migrations
make migrate-status    # show applied vs pending
make migrate-down      # roll back the most recent migration
make migrate-reset     # roll back ALL migrations (destructive)
```
Equivalent without make: `go run ./cmd/migrate up|down|status|reset`.

### Direct goose CLI (optional, if you prefer it)
```bash
cd backend
goose -dir migrations postgres "$DATABASE_URL" up
goose -dir migrations postgres "$DATABASE_URL" status
```

> goose records applied versions in a `goose_db_version` table, so re-running
> `migrate-up` is safe/idempotent — it only applies what's missing.

---

## 3. Fresh Postgres server (create role + database first)

If the server has no `chargeebee` role/database yet:
```bash
cd backend
make bootstrap                       # runs scripts/bootstrap.sql as the postgres superuser
DATABASE_URL="postgres://…" make migrate-up
```

---

## 4. Back up & restore data (carry data to a new DB)

Full **schema + data** dump in Postgres custom format:
```bash
cd backend
DATABASE_URL="<source-db-url>" make db-dump        # writes backup.dump
DATABASE_URL="<source-db-url>" make db-dump DUMP_FILE=snapshot-2026-07.dump   # custom filename
```

Restore a dump into a target database (drops matching objects first, so it's
safe to run against a DB that already has the schema):
```bash
DATABASE_URL="<target-db-url>" make db-restore
DATABASE_URL="<target-db-url>" make db-restore DUMP_FILE=snapshot-2026-07.dump
```

> Dumps contain **real data** (password hashes, gateway keys, etc.). They are
> git-ignored (`*.dump`). Never commit or share them.

---

## 5. Full runbook: migrate to a new Postgres

Use this before the current free database expires, to keep your data.

```bash
cd backend

# 1. Snapshot the OLD database (schema + data)
DATABASE_URL="postgres://OLD_USER:OLD_PW@OLD_HOST/OLD_DB?sslmode=require" \
  make db-dump DUMP_FILE=cutover.dump

# 2. (New empty DB) Load the snapshot into the NEW database
DATABASE_URL="postgres://NEW_USER:NEW_PW@NEW_HOST/NEW_DB?sslmode=require" \
  make db-restore DUMP_FILE=cutover.dump

# 3. Point the app at the new DB and redeploy
#    On Render: set DATABASE_URL to the new one, keep AUTO_MIGRATE=true, redeploy.
#    (migrate-up is a no-op if the dump already carried the schema + goose history.)
```

**Schema-only move (no data):** skip the dump/restore — just set the new
`DATABASE_URL` with `AUTO_MIGRATE=true` and redeploy; the migrations rebuild
every table on boot.

---

## 6. Add a new migration

```bash
cd backend
goose -dir migrations create my_change sql     # creates NNNNN_my_change.sql
```
Then edit the file (it has `-- +goose Up` / `-- +goose Down` sections),
regenerate typed code, and apply:
```bash
make sqlc          # regenerate internal/db/sqlc from queries + schema
make migrate-up    # apply locally
```
Because migrations are embedded, the new file ships automatically with the next
deploy (and applies when `AUTO_MIGRATE=true`).

Naming: zero-padded sequential prefix + snake_case description, e.g.
`00017_add_refunds.sql`. Keep each migration reversible (fill in `+goose Down`).

---

## 7. Current migrations

| # | File | Adds |
|---|------|------|
| 00001 | init_core | merchants, merchant_users, api_keys, products, prices, customers, payment_methods, subscriptions, invoices, invoice_line_items, transactions, dunning_attempts, gateway_accounts, coupons, webhook_endpoints, webhook_deliveries |
| 00002 | checkout | checkout_sessions |
| 00003 | test_live_mode | `mode` column across data tables (test/live isolation) |
| 00004 | coupon_status | coupons.status |
| 00005 | customer_country | customers.country |
| 00006 | merchant_subdomain | merchants.subdomain + owner_name |
| 00007 | billing_runs | billing_runs table |
| 00008 | subscription_cancel_reason | subscriptions.cancel_reason |
| 00009 | coupon_archive | coupons.archived_at + archive_reason |
| 00010 | checkout_visits | checkout_visits table |
| 00011 | user_metadata | user_metadata table (product-tour state) |
| 00012 | gateway_publishable_key | gateway_accounts.publishable_key |
| 00013 | webhook_options | webhook_endpoints.content_type + verify_ssl |
| 00014 | webhook_delivery_result | webhook_deliveries.response_code + error |
| 00015 | user_2fa | user_metadata.two_factor_enabled |
| 00016 | user_2fa_secret | user_metadata.two_factor_secret |

---

## 8. Troubleshooting

- **`pg_dump: server version mismatch`** — use client tools matching (or newer
  than) the server's major version. The Render DB is Postgres 18.
- **Restore complains about roles/ownership** — the dump/restore commands already
  pass `--no-owner --no-privileges` to avoid this on a different account.
- **`AUTO_MIGRATE` didn't run** — confirm the env var is exactly `true` and the
  service redeployed; check boot logs for `goose up`.
- **Verify a deployed DB is migrated** — hit an endpoint that reads a newer
  column, e.g. `GET /v1/me` returns `two_factor_enabled` when 00015/00016 applied.
