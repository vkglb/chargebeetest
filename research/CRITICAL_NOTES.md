# CRITICAL NOTES — Verify-Before-You-Cut Chargebee

> The make-or-break facts for migrating off Chargebee without breaking billing or
> double-charging customers. These are the things to **verify on the real account**
> before cancelling Chargebee — not assume.
>
> Companion to [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md) and
> [CHARGEBEE_NOTES.md](CHARGEBEE_NOTES.md).

---

## 🔴 CRITICAL #1 — Stripe → Subscriptions tab is FULL (surprising!)

**Observed:** Stripe Dashboard → Subscriptions is **full** of subscriptions.

**Why this matters:** Classic Chargebee + Stripe does **NOT** create native `sub_xxx`
objects — it bills via one-off PaymentIntents and leaves the Subscriptions tab empty.
A full tab means one of three things, and we MUST know which:

| Case | Meaning | Migration impact |
|---|---|---|
| 1 ✅ | **Stripe genuinely runs the schedule** | Easiest — Stripe already owns the clock; cutting Chargebee barely breaks anything |
| 2 ⚠️ | **Chargebee made "shell" subs but still drives billing** | **DOUBLE-CHARGE RISK** — both think they own the schedule |
| 3 ⚠️ | **Mixed** — some Stripe-native, some Chargebee-driven | Must segment before migrating |

**The danger is not knowing which case we're in. → Confirm WHO drives billing.**

### How to confirm (open ONE active subscription in Stripe)
1. **"Next invoice" / upcoming charge** shows a future date + amount?
   - Yes → Stripe is driving (case 1). No / "—" → Chargebee drives a shell (case 2).
2. **Recent invoices** — regular cyclic invoices Stripe auto-generated & paid?
   - Yes → Stripe's clock runs. Only one-off/manual charges → Chargebee.
3. **Metadata** — any `chargebee_subscription_id`, `cb_*` keys? → Chargebee owns the object.

### Definitive via CLI/API
```bash
stripe subscriptions list --limit 3
stripe subscriptions retrieve sub_XXXX
```
Settle it with these fields:
- `status` → `active`?
- `current_period_end` → real future date Stripe will bill on?
- `collection_method` → `charge_automatically` (Stripe bills) vs `send_invoice` (manual)?
- `metadata` → any Chargebee keys?

> ✅ RESOLVED (2026-06-23): **Chargebee drives billing (case 2 / classic pure-gateway).**
> A live `payment_succeeded` webhook shows `"source":"scheduled_job"` (Chargebee's clock fired
> it) and `"id_at_gateway":"ch_…"` (a one-off Stripe **Charge**, not a Stripe `sub_`/invoice).
> Chargebee generates the invoice and holds `next_billing_at`. Our DB stores the CB sub id +
> Stripe `ch_`, never a `sub_`. → Cutting Chargebee stops all renewals; rebuild the scheduler.
> Still verify the "full Subscriptions tab" claim (likely non-billing shells). See
> [MIGRATION_QA.md](MIGRATION_QA.md) Q7.

---

## 🔴 CRITICAL #2 — How are payment methods stored?

**Answer:** As **Stripe Customer objects with attached PaymentMethods**, in OUR own
Stripe account. Stripe is the PCI vault; Chargebee never holds raw cards.

```
Stripe Customer (cus_xxx)
   ├── PaymentMethod (pm_xxx)   ← the actual card, in Stripe's vault
   └── invoice_settings.default_payment_method
```

Chargebee mirrors this as a **"Payment Source"** record holding only references
(`cus_xxx`, `pm_xxx`) + safe metadata (last-4, brand, expiry). **The card itself is
100% in our Stripe account → cutting Chargebee does not remove it.**

### ⚠️ Two storage traps to verify (card existing ≠ chargeable off-session)

**Trap A — Modern `pm_xxx` vs legacy `card_xxx`/`src_xxx`.**
Older integrations stored cards as legacy Sources/Tokens, not PaymentMethods. Native
Stripe Subscriptions + modern off-session charges expect `pm_xxx`. Legacy ones may need
migrating to PaymentMethods.

**Trap B — Is a default payment method set on the STRIPE side?**
Chargebee tracks "which card to charge" on its own subscription. Stripe needs it at
`customer.invoice_settings.default_payment_method` (or on the subscription) to
auto-charge. Chargebee may NOT have set the Stripe default → card attached but
Stripe-native billing won't know which to use until we set it.

### How to verify (one customer)
```bash
stripe customers retrieve cus_XXXX
stripe payment_methods list --customer cus_XXXX --type card
```
| Field | Want to see | If not… |
|---|---|---|
| PaymentMethods list | one+ `pm_xxx` cards | only `card_xxx`/sources → legacy, plan migration |
| `invoice_settings.default_payment_method` | a `pm_xxx` value | `null` → set it before relying on Stripe auto-charge |
| `default_source` (legacy) | — | set while `default_payment_method` is null → legacy storage |
| PaymentMethod count vs subscriber count | roughly matches | gaps = customers with no usable saved card |

> ✅ RESOLVED (2026-06-23): confirmed **Case A — modern**. A live Chargebee customer shows
> `Reference ID: cus_Uk2eaA4ezjdJOA / pm_1TkYZXBmKELKMmK2LKhUCdkv`, Gateway `Stripe` /
> `Stripe-1`. Cards are `pm_xxx` PaymentMethods (not legacy `card_`/`src_`) → Trap A cleared.
> Trap B (Stripe-side default PM) is moot — our charge path passes `pm_xxx` explicitly
> (Path B). TODO: spot-check 2–3 oldest customers for legacy stragglers. See
> [MIGRATION_QA.md](MIGRATION_QA.md) Q1.

---

## 🔴 CRITICAL #3 — Off-session / SCA / mandate (region-dependent)

Recurring off-session charges (EU SCA, India RBI e-mandates) need a valid **mandate**
for merchant-initiated transactions. Cards Chargebee saved *should* be off-session
capable, but **verify per region** — EU and India are the ones that bite.

> ⏳ STATUS: need customer region (EU / India / US / other).

---

## Decision gates (don't cut Chargebee until all ✅)

- [ ] Confirmed WHO drives billing (Critical #1 → case 1 / 2 / 3).
- [x] Confirmed cards are `pm_xxx` (not legacy) — Critical #2 ✅ (default-PM moot on Path B).
- [ ] Confirmed off-session/mandate works for the customer region (Critical #3).
- [ ] Exported Chargebee subscription data (plan, qty, coupons, **next renewal date**).
- [ ] Recreated schedule (native Stripe Subs or own scheduler) + verified timing (no double-charge).
- [ ] Switched webhooks Chargebee → Stripe and verified a real renewal.
- [ ] Ran both in parallel, verified, THEN cancelled Chargebee.

---

## Open questions blocking the migration

1. **Who drives billing** — Stripe (case 1) or Chargebee shell (case 2) or mixed (case 3)?
2. **PaymentMethod format + default** — `pm_xxx` with default set, or legacy/`null`?
3. **Customer region** — for the SCA/mandate check.
