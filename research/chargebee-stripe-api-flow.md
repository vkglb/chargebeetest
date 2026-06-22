# Research — Which Stripe APIs Chargebee Hits (Payments, Retry, Dunning, Scheduler)

> Researched against Stripe + Chargebee official docs (June 2026). Goal: know the
> *exact* Stripe API calls Chargebee makes for subscription payments, re-hits/retries,
> and dunning — so we can replicate the behavior precisely after cutting Chargebee.
>
> Companion to [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md),
> [CRITICAL_NOTES.md](CRITICAL_NOTES.md), [extra notes.md](extra%20notes.md).

---

## 0. The core mental model

Chargebee uses Stripe as a **vault + charging engine**. It does NOT (classically) use
Stripe Subscriptions — it runs its OWN scheduler and, each cycle, calls Stripe's
**PaymentIntents API** to charge the saved card **off-session** (merchant-initiated).
Retries/dunning are also Chargebee's own scheduler re-calling the same PaymentIntents
API. (Note: our account shows a FULL Stripe Subscriptions tab — see
[extra notes.md](extra%20notes.md) §D — so verify whether we're on the classic model or
not.)

```
Chargebee scheduler ──> Stripe PaymentIntents API (off_session, confirm) ──> charge card
        ▲                         │
        └── retry/dunning loop ───┘  (re-hits the SAME API on a schedule)
```

---

## 1. Setup — saving the card for off-session use

Before any recurring charge, the card must be saved as a reusable, off-session-capable
PaymentMethod. Stripe does this via **SetupIntents** or a first PaymentIntent with
`setup_future_usage`.

- **`POST /v1/setup_intents`** — collect + save a card for future MIT charges. Used by
  `chargebee.js` / Stripe.js client-side, completing 3DS once up front.
- **`setup_future_usage = off_session`** on the first PaymentIntent — saves the card AND
  optimizes for SCA so later charges don't need the customer present.
- Result stored in our Stripe account: `cus_xxx` (Customer) + `pm_xxx` (PaymentMethod),
  attached. Stripe then marks subsequent off-session charges as **MIT (merchant-initiated
  transactions)** so the customer doesn't re-authenticate.
- The first on-session payment = **CIT** (customer-initiated); later recurring = **MIT**.

> An MIT requires an agreement (mandate) between merchant and customer set up at save
> time — this is the SCA/India-mandate caveat in CRITICAL_NOTES.md #3.

---

## 2. The recurring charge — exact API call

Each cycle Chargebee calls:

**`POST /v1/payment_intents`** with:
```json
{
  "amount": 2000,
  "currency": "usd",
  "customer": "cus_xxx",
  "payment_method": "pm_xxx",
  "off_session": true,
  "confirm": true
}
```
Key params (from Stripe's Create-PaymentIntent reference):
| Param | Purpose |
|---|---|
| `amount` / `currency` | what to charge (smallest unit, e.g. 2000 = $20.00) |
| `customer` | `cus_xxx` |
| `payment_method` | `pm_xxx` (the saved card) |
| `off_session: true` | customer NOT present; charge later. **Only valid with `confirm:true`** |
| `confirm: true` | confirm immediately (run the charge now) |
| `error_on_requires_action: true` | *optional* — fail instead of entering `requires_action` if 3DS needed (simpler integrations) |

**Authentication-required outcome:** if the bank demands 3DS on an off-session charge,
the PaymentIntent enters `requires_action` (or returns a **400 / `authentication_required`**
if `error_on_requires_action:true`). Chargebee treats this as a failure → triggers
dunning (email the customer to re-authenticate on-session).

**3DS token flow (Chargebee specifics):** Chargebee completes 3DS via the PaymentIntents
API and you pass the PaymentIntent ID to Chargebee's `payment_intent[gw_token]`
parameter; for stored-card charges, `chargebee.js`' `handleCardPayment` is the callback.

### Newer Stripe option (v2)
Stripe now also exposes **`POST /v2/payments/off_session_payments`** — a higher-level
off-session endpoint with built-in retry strategy:
```json
{
  "amount": { "value": 1000, "currency": "usd" },
  "customer": "cus_xxx",
  "payment_method": "pm_xxx",
  "cadence": "recurring",
  "retry_details": { "retry_strategy": "best_available" }
}
```
Compatible setup APIs: `/v1/checkout/sessions`, `/v1/payment_intents`, `/v1/setup_intents`.

---

## 3. Re-hit / retry / dunning — how Chargebee does it

Chargebee's **dunning engine** owns the retry schedule. On a failed charge it re-calls
the **same PaymentIntents API** on a schedule, and emails the customer.

**Chargebee Dunning v2:**
- **Smart Retry** — up to **12 retries**; Chargebee auto-picks intervals from gateway
  error type + transaction patterns. No config.
- **Custom Retry** — up to **5 retries**; you set intervals in days, e.g. dunning period
  8 days + frequency `"1,4,8"` → retries on day 1, 4, 8 after first failure.
- **Hard vs soft declines:** hard = needs customer/merchant action (e.g. card declined,
  do not retry until card updated); soft = temporary (e.g. connectivity, insufficient
  funds) → retried per recovery probability.
- **End of dunning:** when period expires unpaid → cancel/retain subscription; invoice
  can be marked unpaid, voided, written off, or credit-noted.
- **Emails:** dunning reminder emails sent until invoice paid or period expires,
  configurable independently of retry attempts.

> Mechanically, a "retry" is just Chargebee firing `POST /v1/payment_intents` again with
> the same customer+pm. There is no special Stripe "retry" endpoint in the classic model
> — the retry logic lives entirely in Chargebee.

---

## 4. The scheduler — who runs the clock

| | Chargebee (classic) | Stripe native (alternative) |
|---|---|---|
| Clock | Chargebee's server-side scheduler reads `next_billing_at` daily | Stripe runs it from `current_period_end` |
| Charge call | `POST /v1/payment_intents` (off_session, confirm) | Stripe auto-creates Invoice → PaymentIntent |
| Retry/dunning | Chargebee Smart/Custom retry (≤12 / ≤5) | Stripe **Smart Retries** |
| Retry control | in Chargebee | Stripe Billing settings |

### Stripe-native replacement (if we migrate to Stripe Subscriptions)
- **`POST /v1/subscriptions`** with `collection_method: charge_automatically` → Stripe
  generates invoices, charges the default PM each cycle, manages status.
- **Smart Retries (Stripe Billing):** AI-timed retries; configurable N tries within
  1 wk / 2 wk / 3 wk / 1 mo / 2 mo. **Recommended default: 8 tries within 2 weeks.**
- On exhaustion → subscription becomes `canceled` or `unpaid` (per settings).
- Failed-payment emails: Billing settings → "Send emails when card payments fail".
- This **replaces Chargebee's scheduler + dunning entirely** with Stripe-run logic.

---

## 5. Chargebee feature → Stripe API map (replication cheat-sheet)

| Chargebee does | Stripe API to replicate it |
|---|---|
| Save card off-session | `POST /v1/setup_intents` or PI w/ `setup_future_usage=off_session` |
| Recurring charge | `POST /v1/payment_intents` (`off_session:true, confirm:true`) |
| Retry failed charge | re-call `POST /v1/payment_intents` (own scheduler) OR Stripe Smart Retries |
| Run the billing clock | own Laravel scheduler reading `next_billing_at` OR `POST /v1/subscriptions` (Stripe runs it) |
| Generate invoice | own logic OR Stripe auto-invoices on subscriptions |
| Dunning emails | own/SendGrid off `invoice.payment_failed` (see extra notes §A) |
| 3DS / SCA | PaymentIntents `requires_action` flow |

---

## 6. Two paths to rebuild this (recap)

- **Path A — Stripe-native:** `POST /v1/subscriptions` + Smart Retries. Stripe owns
  scheduler + retries + dunning. Least code. ✅ recommended.
- **Path B — Own engine:** Laravel scheduler + `POST /v1/payment_intents` per cycle +
  our own retry schedule (mimic Chargebee's `1,4,8` etc.). Full control, more work.

---

## Sources
- [Stripe — Off-Session Payments API](https://docs.stripe.com/payments/off-session-payments)
- [Stripe — Create a PaymentIntent (API ref)](https://docs.stripe.com/api/payment_intents/create)
- [Stripe — Payment Intents API](https://docs.stripe.com/payments/payment-intents)
- [Stripe — On-session vs off-session](https://support.stripe.com/questions/what-is-the-difference-between-on-session-and-off-session-and-why-is-it-important)
- [Stripe — Billing Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Stripe — How subscriptions work](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe — Billing collection methods](https://docs.stripe.com/billing/collection-method)
- [Chargebee — Stripe payment gateway docs](https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/stripe)
- [Chargebee — Dunning v2](https://www.chargebee.com/docs/payments/2.0/dunning/dunning-v2)
- [Chargebee — Retrieve Stripe payment_method id for PaymentIntent API](https://www.chargebee.com/docs/payments/2.0/kb/billing/how-to-retrieve-the-stripe-payment-method-id-for-stripe-payment-intent-api)
- [Chargebee — Dunning management overview](https://www.chargebee.com/recurring-payments/dunning-management/)
