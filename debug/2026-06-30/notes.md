# Dev notes — 2026-06-30

Session focus: database-backed product tour, real Stripe test-mode payments on
the hosted checkout, and encryption of gateway secrets at rest.

## Shipped (committed + pushed to `main`)

### 1. Persist product-tour completion in the database — `5b4aafb`
Previously the tour "seen" flag lived only in `localStorage`, so clearing the
browser restarted the tour on next login.

- **Migration `00011_user_metadata.sql`** — new `user_metadata` table
  (1:1 with `merchant_users`, `ON DELETE CASCADE`), column `tour_completed_at`.
  Extensible for future onboarding flags.
- **Backend**: `userID(r)` context helper; `GET /v1/me`
  (`{user_id, merchant_id, tour_completed}`); `POST /v1/me/tour/complete`
  (upsert `tour_completed_at = now()`).
- **Frontend**: `Layout` fetches `/v1/me` to decide whether to auto-open the
  tour; falls back to `localStorage` for guests / not-yet-migrated backend.
  `Tour` posts completion to the DB on finish. `mock.ts` mirrors both endpoints.

### 2. Real Stripe test-mode card vaulting + dunning via hosted checkout — `ea2a66a`
The hosted checkout used to send a fake `pm_demo_…` token and never created
anything real on Stripe, so off-session dunning had nothing to charge. Now it
vaults a real card and the (already real) dunning engine can charge it.

- **Migration `00012_gateway_publishable_key.sql`** — adds
  `gateway_accounts.publishable_key` (Stripe `pk_…`, safe for the browser).
- **Gateway capability** `gateway.CardVaulting`; Stripe implements
  `CreateSetupIntent` (`usage=off_session`) so saved cards are chargeable later
  and SCA is resolved up front.
- **Endpoint** `POST /v1/checkout/sessions/{id}/setup-intent`:
  - Stripe connected → create Stripe customer + SetupIntent, return
    `{publishable_key, client_secret, gateway_customer_ref}`.
  - Otherwise → `{simulated:true}` (page falls back to the demo form).
- **`/complete`** now stores the real `cus_…` + `pm_…` on the customer +
  payment method (was empty / `pm_demo_`).
- **Frontend**: `Checkout.tsx` loads Stripe.js with the merchant's publishable
  key, mounts Elements, confirms the card via `confirmCardSetup`. Falls back to
  the demo form when simulated. `Gateways.tsx` gains a publishable-key field +
  test-key labels. `mock.ts` returns `{simulated:true}` for guest mode.
  Added deps: `@stripe/stripe-js`, `@stripe/react-stripe-js`.
- Sandbox simulator stays the default → demo still works without keys.

### 3. Encrypt gateway secrets at rest (AES-256-GCM) — `46e1901`
- **`internal/crypto`** — AES-256-GCM `Cipher`, magic-prefixed (`enc1:`) format.
  Passthrough when no key configured (dev); legacy plaintext rows decrypt
  unchanged so existing connections keep working.
- **`billing.CipherResolver`** decrypts per charge (replaces `PlaintextResolver`
  in `main`). Connect handler encrypts before storing; checkout setup-intent
  decrypts before calling Stripe.
- **Config**: `CREDENTIALS_ENC_KEY` (base64, 32 bytes).
- Publishable keys stay plaintext (client-side by design).

## Deploy reminders
- **Render redeploy with `AUTO_MIGRATE=true`** to apply migrations `00011` and
  `00012`.
- Set env var **`CREDENTIALS_ENC_KEY`** = `openssl rand -base64 32`. After
  setting it, hit **Update keys** once per connected gateway to re-save the
  secret encrypted (existing rows are still plaintext until re-saved).
- Post-deploy smoke checks:
  - `https://chargebeetest.onrender.com/v1/me` → 401 (route exists).
  - Stripe test: vault `4242 4242 4242 4242` to charge; vault
    `4000 0000 0000 0341` (attaches, fails off-session) to exercise dunning.

## Pending / discussed, not yet built
- **#2 Charge at checkout ("deduct")** — charge the first invoice immediately on
  the hosted page for paid plans (PaymentIntent); trials still just vault.
- **#3 Import existing Stripe test data** — pull Stripe customers + saved cards
  (and optionally subscriptions) into the platform so dunning can run on them.
  Open decision: how to map Stripe prices → local plans (auto-create vs match
  existing vs customers+cards only).
- Inbound Stripe webhook receiver (reconcile async outcomes); `VerifyWebhook`
  exists but nothing ingests events yet.

## Caveats
- Keys are only as safe as `CREDENTIALS_ENC_KEY` management — test keys only for
  now; do not store `sk_live_` until key handling is hardened (KMS).
- The setup-intent endpoint creates a fresh Stripe test customer on each
  checkout page load (harmless clutter in test mode; can cache on the session).
