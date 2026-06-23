# Migration Q&A — Answers (code-confirmed)

> Live answer sheet for the migrate-off-Chargebee questions. Each item is **✅ ANSWERED**,
> **🟡 PARTIAL**, or **⛔ NEEDS ACCESS**. Most are now code-confirmed against the real apps.
>
> As of **2026-06-23**. Companion to [CRITICAL_NOTES.md](CRITICAL_NOTES.md),
> [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md), [extra notes.md](extra%20notes.md),
> [quaderno.md](quaderno.md).

---

## ⚠️ Stack reality (corrects the older docs)

- **The Chargebee integration lives in a LARAVEL app: `D:\azexo_Version`** (`artisan`,
  `composer.json`, 105 KB `PaymentController.php`). 299 Chargebee references across 48 files.
- **The Node app `E:\node_updated` does NOT use Chargebee** — it only lists it in
  `package.json` (unused). So despite being called the "Node dashboard", all billing logic
  is Laravel.
- Older docs say "Laravel + Cashier" — they actually use the **raw Chargebee PHP SDK**
  (`ChargeBee_*` classes), **not** Cashier.

## 🔴 Security finding (act now, unrelated to migration)

- **Hardcoded live Stripe secret key** in
  [QuadernoWebhook.php:40](../../azexo_Version/app/Jobs/QuadernoWebhook.php) —
  `$key = 'sk_live_51HcEdv...'`. In a git repo = full charge/refund access if leaked.
  **Rotate the key in Stripe and move it to `env('STRIPE_SECRET')`.** Grep the whole
  codebase for other `sk_live_`/`sk_test_` literals.

---

## Stripe / Payment Layer

### Q1. Payment methods = Stripe Customer + attached PaymentMethods, or differently? — ✅ ANSWERED

**Stored as Stripe Customer objects with attached MODERN PaymentMethods, in our own Stripe
account.** Confirmed on two live customers, e.g.:

```
Gateway Stripe / Stripe-1
reference_id: cus_UiLAffgDQYsPet / pm_1TiuTlBmKELKMmK2iBYXeL85
```

- `cus_…` = Stripe Customer ✅, `pm_…` = modern PaymentMethod (not legacy `card_`/`src_`) ✅ → Trap A cleared.
- Card in Stripe's vault → survives cutting Chargebee.
- **Trap B (Stripe-side default PM) is moot** — the new platform passes `pm_…` explicitly per charge (Path B).
- TODO: spot-check 2–3 oldest customers for legacy stragglers.

### Q2. Direct mapping Stripe Customer ID ↔ internal user ID in our DB? — ✅ ANSWERED (No — indirect)

**No direct `cus_` ↔ user mapping. The link runs through Chargebee.** From
[ChargeBee.php](../../azexo_Version/app/Jobs/Webhooks/ChargeBee.php):

```
internal ref (cf_subscription_reference "MYLINKIE:3:G:S:47:W:167")
   → Chargebee customer/sub (16CbtvVMhbapv156Y)
   → Stripe customer (cus_UiLAffgDQYsPet)
```

- Our DB stores the **Chargebee subscription id** in `recurring_profiles.paypal_profile_id`
  and the Stripe **charge** `ch_` in `transactions.transaction_id`. **We never store `cus_`.**
- The user link is the custom field `cf_subscription_reference` → `pre_order_data` → `users`.
- **Good news:** every Chargebee webhook already delivers `cus_` (in `reference_id`) +
  `cf_subscription_reference`, so the `user ↔ cus_` map can be backfilled before cutover.

---

## Chargebee (Critical)

### Q3. Which Chargebee features are we actively using? — ✅ ANSWERED

| Feature | Status | Evidence |
|---|---|---|
| **Hosted checkout pages** | ✅ Yes | `ChargeBee_HostedPage::checkoutNew/checkoutOneTime/retrieve` (PaymentController.php:290, Event*.php) |
| **Webhooks** | ✅ Yes (heavy) | `Event@index` → `ChargeBee::dispatch`; job handles events |
| **Dunning / retry** | ✅ Yes — but **100% Chargebee-side** | ZERO charging/retry code in app (no PaymentIntent/off_session/dunning anywhere) |
| Subscriptions / plans / customers | ✅ Yes | `ChargeBee_Customer`, `ChargeBee_Plan` |
| Invoicing + Tax | ✅ Yes | Chargebee invoices; `tax_source: chargebee_tax` |
| Coupons / portal / credit notes | ❌ Not used in code | no `ChargeBee_Coupon`/`PortalSession`/`CreditNote` |

> **Biggest rebuild:** the charging + dunning loop is entirely Chargebee's. The app only
> reacts to outcome webhooks. Cut Chargebee → renewals + retries stop dead.

### Q4. Are Chargebee subscription IDs referenced in codebase/DB? — ✅ ANSWERED (Yes)

Stored in **`recurring_profiles.paypal_profile_id`** (legacy column name) = the Chargebee
subscription id (e.g. `16CbtvVMhbapv156Y`). Read/written in `ChargeBee.php`
(`->where('paypal_profile_id', $id)`). Every active sub is keyed by its CB id → each must be
remapped on migration.

### Q5. Custom metadata in Chargebee not in Stripe? — ✅ ANSWERED (Yes — 2 fields, load-bearing)

Two **subscription** custom fields, both read by code:

| Field | Purpose |
|---|---|
| **`cf_subscription_reference`** | The only link CB → our app user (set at checkout `= $token->description`; resolved via `pre_order_data`). Losing it = orphaned subs. |
| **`cf_previous_subscription`** | Links a new sub to the one it replaced (upgrade/downgrade) → cancels the old one. |

Must be copied into Stripe `metadata` (or our DB) in the same pass that recreates each sub.
No `meta_data`/tags/notes found in code — but **verify dashboard-only fields/notes** via
Chargebee → Settings → Custom Fields.

### Q6. Which Chargebee webhooks does the app listen to, and what does each do? — ✅ ANSWERED

Ingress: `Event@index` ([Event.php:38-53](../../azexo_Version/app/Http/Controllers/api/Event.php))
gets a JWT carrying the event id (relayed via `mylink.ie`), dispatches `ChargeBee` job →
`ChargeBee_Event::retrieve()` → branches on `event_type`. **No event-type filter at ingress.**

Acts on only **two** events:

| event_type | Action |
|---|---|
| **`payment_succeeded`** | New sub: resolve/create user, create `recurring_profiles` + `autolikes_orders`, cancel prior via `cf_previous_subscription`, insert `transactions` (idempotent on `ch_`), welcome email, start service. Renewal: insert txn, advance `last_payment_at`/`next_check_at`, reset counters. |
| **`subscription_cancelled`** | If `current_term_end <= next_check_at` → end now (`autolikes_status=3`); else `should_cancel=1` (stop at term end). |

**Everything else (incl. `payment_failed`) is ignored.** ← migration gap: no failed-payment
handling exists; must be built (revoke/notify) when leaving Chargebee.

### Q7. Subscriptions only in Chargebee, Stripe purely the gateway? — ✅ ANSWERED (Yes)

**Chargebee drives billing; Stripe is pure vault + gateway.** Webhook log proof:
`"source":"scheduled_job"` (CB's clock fired it), `"id_at_gateway":"ch_…"` (a one-off Stripe
**Charge**, not a Stripe `sub_`/`in_`), CB generated invoice `151858`, holds `next_billing_at`.
Our DB stores the CB sub id + Stripe `ch_`, never a `sub_`. → **Classic pure-gateway model;
cutting Chargebee stops all renewals.**

> Caveat: an earlier note said the Stripe→Subscriptions tab looked "full". Confirm by opening
> one Stripe sub → "Next invoice": "—" = non-billing shell (pure-gateway holds).

---

## Node / Laravel Dashboard

### Q8. Subscription status — own DB or live from Chargebee? — ✅ ANSWERED (Own DB)

Local tables, updated by the webhook job; never live-fetched:
`recurring_profiles.profile_status` / `status` / `should_cancel` / `next_check_at`, and
`autolikes_orders.autolikes_status` (1=active, 3=ended, 5=…). Good — app already treats its
own DB as system of record; repoint webhooks Stripe→ours and status logic barely changes.

### Q9. Which Chargebee API calls does the app make? — ✅ ANSWERED (write-light)

`ChargeBee_Customer::all/create`, `ChargeBee_Plan::retrieve`,
`ChargeBee_HostedPage::checkoutNew/checkoutOneTime/retrieve`, `ChargeBee_Event::retrieve`.

**Of the four asked — none via API:** list subscriptions ❌, cancel ❌ (react to webhook +
local DB), update plan ❌ (new hosted checkout + `cf_previous_subscription`), apply coupon ❌
(no `ChargeBee_Coupon`). All lifecycle changes are webhook-reaction + local DB writes.

---

## Emails

### Q10. Who sends renewal reminder emails? — ✅ ANSWERED (Chargebee)

**Chargebee's built-in email engine.** No pre-renewal/upcoming-charge email logic in code —
the app only sends post-payment confirmations (`ChargeBee.php`) and a post-cancellation
win-back (`NotifyForResubscription` → `reSubscribeMail`). Renewal reminders **stop on cutover**
→ rebuild via SendGrid off Stripe `invoice.upcoming` (or own scheduler). Confirm "Upcoming
renewal reminder" is ON in Chargebee → Settings → Email Notifications.

### Q11. Can we run renewals, dunning, and all emails from our SendGrid? — ✅ ANSWERED (Yes)

Yes — the app already sends via SendGrid (`sendEmailThroughSendgrid`, `SendMailJob`), so the
pipe exists. Map: renewal→`invoice.upcoming`; receipt→`payment_succeeded`;
dunning→`invoice.payment_failed`; card-expiring→PM exp scan; trial→`trial_will_end`;
cancel→`subscription.deleted`. Caveats: (1) the retry *re-charging* still needs **Stripe Smart
Retries** or our own scheduler — email ≠ dunning; (2) **turn off the duplicate sender**
(Stripe/Chargebee) so customers don't get two. Use SendGrid Dynamic Templates.

---

## Quaderno / VAT

### Q12. Does Quaderno connect directly to Stripe or via Chargebee? — ✅ ANSWERED (Direct to Stripe)

**Directly to Stripe (Pattern A — safe).** [QuadernoWebhook.php](../../azexo_Version/app/Jobs/QuadernoWebhook.php)
receives a **Stripe charge id** and retrieves it via `StripeClient->charges->retrieve()` — pure
Stripe, no `ChargeBee_` call. So **cutting Chargebee does NOT break Quaderno**; subscription
renewals still produce Stripe `ch_` charges Quaderno reads.

> Nuance: subscription **tax calculation** is currently Chargebee (`tax_source: chargebee_tax`),
> and this handler skips subscription types (`1,3,5 → "not supported yet"`). Post-migration,
> ensure Quaderno/Stripe Tax takes over the tax *computation* CB does for subs. Doc generation
> (Quaderno↔Stripe) is safe.

---

## Scoreboard

| # | Question | Status |
|---|---|---|
| Q1 | Payment methods = Stripe `cus_`/`pm_`? | ✅ Yes — modern, in our Stripe |
| Q2 | Stripe customer ↔ user mapping? | ✅ No — indirect via `cf_subscription_reference` |
| Q3 | Which Chargebee features? | ✅ Hosted checkout, webhooks, dunning(CB-side), subs, tax |
| Q4 | CB sub IDs in code/DB? | ✅ Yes — `recurring_profiles.paypal_profile_id` |
| Q5 | CB-only custom fields? | ✅ Yes — `cf_subscription_reference`, `cf_previous_subscription` |
| Q6 | Which CB webhooks handled? | ✅ `payment_succeeded` + `subscription_cancelled` only |
| Q7 | Subs only in CB, Stripe pure gateway? | ✅ Yes — CB drives, Stripe `ch_` only |
| Q8 | Sub status — own DB or live? | ✅ Own DB |
| Q9 | Which CB API calls? | ✅ Customer/Plan/HostedPage/Event only (write-light) |
| Q10 | Who sends renewal emails? | ✅ Chargebee |
| Q11 | Run all email from SendGrid? | ✅ Yes (retries still need Stripe/own scheduler) |
| Q12 | Quaderno → Stripe direct or via CB? | ✅ Direct to Stripe |

## Migration-critical gaps (what breaks on cutover)

1. **Charging + dunning loop** — 100% Chargebee. Rebuild scheduler + retries (Stripe Smart
   Retries or own engine). `next_billing_at` lives in Chargebee → export per sub first.
2. **`payment_failed` handling** — does not exist in code. Build revoke/notify.
3. **Renewal reminder emails** — Chargebee-sent. Rebuild via SendGrid + `invoice.upcoming`.
4. **`cf_subscription_reference` / `cf_previous_subscription`** — the only CB→app links;
   export into Stripe `metadata`/our DB in the same pass that recreates subs.
5. **`user ↔ cus_` map** — not stored today; backfill from webhook data before cancelling CB.
6. **Subscription tax calc** — currently `chargebee_tax`; move to Stripe Tax / Quaderno.
7. **Rotate the leaked `sk_live_` key** (security, do now).
