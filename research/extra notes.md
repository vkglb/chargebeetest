# Extra Notes — Emails/Dunning Ownership + Chargebee Feature Inventory

> Additional migration scoping notes. Two topics:
> 1. Who sends emails today + can we own it all via SendGrid.
> 2. Which Chargebee features we're actually using (audit framework).
>
> Companion to [CRITICAL_NOTES.md](CRITICAL_NOTES.md),
> [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md),
> [quaderno.md](quaderno.md), [CHARGEBEE_NOTES.md](CHARGEBEE_NOTES.md).

---

## A. Emails & Dunning — can we run it all from our own SendGrid?

### Who sends renewal/dunning emails today?
Almost certainly **Chargebee**, unless someone disabled it and built custom code.
Chargebee has a built-in email engine that by default sends:
- Renewal / upcoming-charge reminders
- Payment receipts
- **Dunning emails** (failed payment → retry sequence → "update your card")
- Card-expiry reminders
- Trial-ending notices
- Subscription cancelled / paused

⚠️ This stops when we cut Chargebee — and it's easy to forget because **no code of ours
sends them**.

**How to confirm:**
- Chargebee → Settings → Configure Chargebee → Email Notifications (which are ON = Chargebee sends them).
- Grep our codebase for renewal/dunning mail logic — none = it's 100% Chargebee.
- SendGrid Activity Feed — are these emails already flowing through our SendGrid? If not, they go via Chargebee's mail system.

### Yes — we can own everything via SendGrid
Clean end state, decouples us from Chargebee AND Stripe email styling:
```
Event source (Stripe webhooks OR our own scheduler)
        │
        ▼
   Our Laravel app  ──>  SendGrid API  ──>  customer
   (decides WHICH email, WHEN, WHICH template)
```

| Email | Trigger we listen to | When we send |
|---|---|---|
| Renewal reminder | Stripe `invoice.upcoming` (or scheduler: `current_period_end − N days`) | 3–7 days before renewal |
| Payment receipt | `invoice.paid` / `payment_intent.succeeded` | on success |
| **Dunning #1/#2/#3** | `invoice.payment_failed` | on failure + retry schedule |
| Card expiring | scheduled scan of PM `exp_month/exp_year` | ~30 days before expiry |
| Trial ending | `customer.subscription.trial_will_end` | 3 days before |
| Cancelled | `customer.subscription.deleted` | on cancel |

**Key setup points:**
- **Turn OFF the duplicate sender** so customers don't get two emails. On Stripe-native
  subs, disable Stripe's customer emails (Stripe → Settings → Emails); Chargebee's stop
  when we cut it.
- **Dunning has two halves:** the *retry schedule* (re-charging) and the *emails*.
  Stripe Smart Retries can run the retries while WE send emails via SendGrid off the
  `invoice.payment_failed` webhook. On own-scheduler path (Path B) we own both.
- **`invoice.upcoming` is the magic event** for renewal reminders — Stripe fires it
  ahead of each renewal, no date math needed.
- Use **SendGrid Dynamic Templates** so copy edits don't need code changes.

**Decision:** retries run by **Stripe Smart Retries** (least code, we just email) vs
**our own scheduler** (full control, more work). Either way, all customer email can live
in our SendGrid.

---

## B. Which Chargebee features are we actually using?

> Can't be answered without inspecting the Chargebee dashboard + our codebase. This is
> the audit that scopes the whole migration. Two questions per feature: is it *enabled
> in Chargebee*, and does our *code depend on it*.

### Feature inventory matrix
| Feature | Check in Chargebee dashboard | Check in codebase | Migration cost if used |
|---|---|---|---|
| **Hosted checkout pages** | Settings → Hosted Pages | `HostedPage`, `checkout`, `hostedPage()->url`, redirects to `*.chargebee.com` | Rebuild w/ Stripe Checkout / Payment Element |
| **Dunning / retry logic** | Settings → Dunning (schedule on?) | usually none (server-side in CB) | Stripe Smart Retries or own scheduler |
| **Webhooks → our app** | Settings → Webhooks (endpoints + events) | webhook controller route, `verifyWebhook`, event names | Re-point to Stripe events |
| **Emails** | Settings → Email Notifications | likely none | Move to SendGrid (section A) |
| **Subscriptions / plans** | Product Catalog → Plans / Item Prices | `Subscription::`, `itemPriceId`, plan IDs | Recreate as Stripe Prices/Subscriptions |
| **Customer portal** | Settings → Customer Portal | `PortalSession`, portal links | Stripe Customer Portal |
| **Coupons / discounts** | Product Catalog → Coupons | `coupon`, `discount` in calls | Stripe Coupons |
| **Invoices / credit notes** | Billing → Invoices | `Invoice::`, `CreditNote::` | Stripe Invoices |
| **Taxes** | Settings → Taxes (or via Quaderno) | tax fields in calls | Stripe Tax / Quaderno |
| **Proration** | implicit in plan-change config | `prorate`, `changeTermEnd` | Stripe handles, or own math |

### Fastest way to find what's actually wired
1. **Chargebee → Settings → Webhooks** — the event list = our real dependency surface
   (which Chargebee outcomes our app reacts to).
2. **Codebase grep** for every `\ChargeBee\` / `ChargeBee\\` reference. The set of CB
   classes we call IS the definitive feature list:
   - `HostedPage` → hosted checkout
   - `Subscription` → subscription mgmt
   - `PortalSession` → customer portal
   - `Invoice` / `CreditNote` → invoicing
   - `Coupon` → discounts
   - `PaymentSource` → stored cards

### TODO to make this concrete
- [ ] Point Claude at the actual Laravel app path → grep for `ChargeBee\` usage → definitive "features we call in code" list.
- [ ] Paste Chargebee webhook event list → know which events our app depends on.
- [ ] Merge both into a real feature-usage matrix (replace the template above).

> ⏳ STATUS: codebase not yet provided (working folder `d:\chargeebee` has only research
> notes). App likely in the `azexo_Version` project — provide path to run the grep.

---

## C. Chargebee-only data — find, map, migrate (HIGH RISK)

> If we migrate only `cus_xxx`/`pm_xxx` + recreate subscriptions, anything that lived
> ONLY in Chargebee silently disappears. Once Chargebee is cancelled, the export window
> closes. This is the most-forgotten migration workstream.

### What typically exists in Chargebee but NOT in Stripe
| Chargebee-only data | What it is | Risk if lost |
|---|---|---|
| **Custom Fields (`cf_*`)** | User-defined fields on customers/subscriptions/plans (e.g. `cf_internal_user_id`, `cf_account_tier`) | High — often the **link back to our app's user/account** |
| **Metadata / `meta_data`** | JSON blob our code may have stashed | High — app logic may read it |
| **Customer notes / comments** | Free-text notes CS added per customer | Medium — institutional knowledge |
| **VAT / tax registration number** | Stored on CB customer for compliance | High — needed for correct tax/invoicing |
| **Multiple contacts per customer** | CB supports extra billing contacts | Medium — Stripe customer = single email |
| **Parent–child / account hierarchy** | CB customer relationships | Medium — Stripe is flat |
| **PO numbers / billing notes** | B2B invoice fields | Medium |
| **Subscription status-change history / audit log** | Full lifecycle timeline | Medium — historical reporting |
| **Coupon redemption history** | Who used what, when | Low/Medium |
| **Plan/add-on custom attributes** | Business metadata on the catalog | Medium |

> Two that bite hardest: **custom fields linking CB → our app's users**, and **VAT/tax
> numbers** (Quaderno / tax docs depend on them).

### Where it maps in Stripe
- **Stripe `metadata`** — key-value bag on almost every object (Customer, Subscription,
  PaymentIntent…), up to **50 keys × 500 chars** each. CB `cf_*` + `meta_data` → migrate here.
- **VAT/tax IDs** → Stripe **Customer Tax IDs** (`customer.tax_ids`), a first-class field (not metadata).
- **Notes / hierarchy / extra contacts** → no native Stripe equivalent → flatten into
  `metadata` or keep in **our own database** (often the better home).

### How to find what we actually have
1. **Chargebee → Settings → Custom Fields** — definitive list of every custom field, per object type.
2. **Chargebee API / CSV export** — export customers & subscriptions; any `cf_*` column = custom field; check `meta_data` too.
3. **Grep codebase** for `cf_`, `customFields`, `meta_data`, `metaData` — if code *reads* a CB custom field, it's load-bearing → must migrate.
4. **Customer notes** — CB → a customer → Comments/Notes (export separately, sometimes API-only).

### The migration rule
> Anything Chargebee-only that our **code reads** or our **tax/CS process needs** →
> export it and write it into Stripe `metadata` (or our DB) **in the same pass** that
> recreates the customer/subscription. Don't defer it — the export window closes when
> Chargebee is cancelled.

### TODO
- [ ] List all fields from Chargebee → Settings → Custom Fields → build field-by-field map.
- [ ] Grep codebase for `cf_` / `meta_data` usage → flag load-bearing fields.
- [ ] Export VAT/tax numbers → plan into Stripe `customer.tax_ids`.
- [ ] Decide home for notes/hierarchy/contacts (Stripe metadata vs own DB).

> ⏳ STATUS: need contents of Chargebee → Settings → Custom Fields to build the real map.

---

## D. Are subscriptions ONLY in Chargebee (Stripe purely a gateway)?

> Short answer for OUR account: **No — not purely.** Our observed data (Stripe →
> Subscriptions tab is FULL) contradicts the "pure gateway" model. But we still haven't
> confirmed WHO drives the billing. Ties back to [CRITICAL_NOTES.md](CRITICAL_NOTES.md) #1.

### The two architectures
**Model 1 — "Stripe as pure gateway" (classic Chargebee):**
```
Subscriptions live ONLY in Chargebee.
Stripe = vault + charging only (cus_xxx, pm_xxx, one-off PaymentIntents).
Stripe → Subscriptions tab = EMPTY.
```
**Model 2 — Stripe also holds native subscriptions:**
```
Native sub_xxx objects exist in Stripe.
Stripe → Subscriptions tab = FULL.
```

### What our data says
We observed **Stripe → Subscriptions = FULL**. In a textbook pure-gateway setup that tab
would be **EMPTY**. Therefore:
> ❌ Subscriptions are **NOT** only in Chargebee. Stripe holds native `sub_xxx` objects too.

Good for migration *if* those Stripe subs are real & active — but a full tab still has
two meanings (unresolved Critical #1):

| If the Stripe subscriptions are… | Truth | Risk |
|---|---|---|
| **Actively billing** (Stripe runs the clock) | Stripe owns the schedule; Chargebee is mostly a wrapper | ✅ Easy migration |
| **"Shell" subs CB created but doesn't let Stripe drive** | Both think they own it | ⚠️ **Double-charge risk** |

### The single check that settles it
Open **one active subscription in Stripe → look at "Next invoice":**
- **Future date + amount** → Stripe drives billing → subscriptions genuinely in Stripe → easiest migration.
- **"—" / nothing** → Stripe sub is a shell; Chargebee fires the charges → double-charge case, handle carefully.

> ⏳ STATUS: need the "Next invoice" value on one live Stripe subscription. Resolves both
> this question AND Critical #1 (easy path vs careful path).
