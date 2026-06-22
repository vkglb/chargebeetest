# Migrating OFF Chargebee — Keeping Existing Stripe Subscribers

> The real situation: we currently use Chargebee on top of our own Stripe account,
> with active subscription-based users. We want to **drop Chargebee** and run billing
> ourselves, **without breaking the existing subscription flow** (no lost cards, no
> stopped renewals, no double charges).

---

## TL;DR

- ✅ The customers and their **cards already live in OUR own Stripe account** — cutting Chargebee does **not** delete them.
- ✅ Our own app does **not** need Stripe Connect. Connect existed only because Chargebee was a *third party* acting on our behalf. Our backend just uses our own `sk_live_...` secret key directly.
- ⚠️ **The trap:** Chargebee (almost certainly) is **NOT** using Stripe Subscriptions. The recurring *schedule* (who/when/how much) lives **only inside Chargebee**. If we just switch Chargebee off, the cards stay but **auto-renewals stop dead** — Stripe was never running the subscriptions.
- 🔧 To not break the flow: **export the subscription data from Chargebee, recreate it as native Stripe Subscriptions (or our own scheduler) before cancelling Chargebee.**

---

## 1. Where the data actually lives

| Thing | Lives in | Survives cutting Chargebee? |
|---|---|---|
| Card number / CVV / expiry | Stripe vault (our account) | ✅ Yes |
| Stripe Customer `cus_xxx` | Our Stripe account | ✅ Yes |
| PaymentMethod `pm_xxx` | Our Stripe account | ✅ Yes |
| **Subscription schedule** (plan, amount, next renewal date) | **Chargebee only** | ❌ **No — must export first** |
| Invoices / dunning state / coupons | Chargebee | ❌ No — export what we need |

Because Chargebee connected via **Stripe Connect to OUR own account**, everything it
created in Stripe belongs to us. We already have full API access with our own keys.

### Stripe object ownership (who stores what)

Every object below lives in **our own Stripe account**. Chargebee only ever held the
**reference IDs** + a mirrored "Transaction" record — never the objects themselves.

| Stripe object | ID format | What it is | Stored in | Survives cutting Chargebee? |
|---|---|---|---|---|
| **Customer** | `cus_xxx` | The billing entity | Stripe | ✅ Yes |
| **PaymentMethod** | `pm_xxx` | The saved card (number/CVV/expiry in Stripe vault) | Stripe | ✅ Yes |
| **PaymentIntent** | `pi_xxx` | **One charge attempt** + its lifecycle (`requires_action`→`succeeded`/`failed`) | Stripe | ✅ Yes — full charge history is ours |
| **Charge** | `ch_xxx` | The settled result of a PaymentIntent | Stripe | ✅ Yes |
| **Invoice** | `in_xxx` | A bill (only exists if native Stripe Subscriptions are used) | Stripe | ✅ Yes (likely few/none today) |
| **Subscription** | `sub_xxx` | **The recurring SCHEDULE** that auto-creates Invoice + PaymentIntent each cycle | Stripe — **but Chargebee likely never created these** | ❌ This is the missing brain to rebuild |

**Key distinction:**
- A **PaymentIntent (`pi_xxx`)** = a *single* charge, past or in-flight. Stripe stores these; Chargebee just triggered them and kept the `pi_xxx` reference.
- A **Subscription (`sub_xxx`)** = the *recurring schedule* that fires a new charge each period. **Chargebee did this itself instead of using Stripe Subscriptions** — so it's the one piece we must recreate, not the PaymentIntents.

---

## 2. Why the flow breaks (the key insight)

Chargebee uses Stripe purely as a **vault + charging machine**:
- Stores the card in Stripe (`cus_xxx` + `pm_xxx`).
- Each billing cycle, Chargebee's own scheduler fires a one-off `PaymentIntent` against that card.

So in Stripe there are (most likely) **no `sub_xxx` Subscription objects** — just
Customers, PaymentMethods, and a history of one-off PaymentIntents/Charges. The
"brain" that knows to charge again next month is **Chargebee**. Remove it and nothing
in Stripe renews anyone.

### ⬜ ACTION: confirm the case
Open **Stripe Dashboard → Subscriptions**:
- **Empty/sparse**, but **Customers** + **Payments** are full → Chargebee is the brain (normal case). Migration required.
- **Full of active `sub_xxx`** → rare; easier, Stripe already owns the schedule.

---

## 3. Migration plan (no broken flow, no double-charge)

Assuming the normal case (Chargebee is the brain):

1. **BEFORE cancelling Chargebee**, export per subscription:
   - Stripe customer ID (`cus_xxx`)
   - Payment method (`pm_xxx`)
   - Plan / item price / quantity
   - Coupons / discounts
   - **Next renewal date** (current term end) ← critical for timing
   - (Via Chargebee API or CSV export.)
2. **Recreate as native Stripe Subscriptions** in our account, reusing each existing
   customer + their existing saved card.
3. **Timing trick to avoid an immediate/double charge:**
   set `trial_end` (or `billing_cycle_anchor`) to each customer's **existing next-renewal
   date** with `proration_behavior: 'none'`. Stripe then won't charge now — it resumes
   the cycle exactly where Chargebee left off.
4. **Switch webhooks** from Chargebee → Stripe:
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted` → grant/revoke access.
5. **Run in parallel briefly**, verify a few real renewals, **then** cancel Chargebee.

### Alternative path B — build our own scheduler
Instead of native Stripe Subscriptions, keep charging via one-off `PaymentIntent`s
(exactly like Chargebee did) driven by our own Laravel scheduled command + queued jobs.
More control, more code (proration/dunning is on us). Path A is recommended unless we
need Chargebee-level flexibility.

---

## 3b. The scheduler — the "brain" we're replacing

The scheduler is the part Chargebee did that Stripe (probably) wasn't doing. Removing
Chargebee removes this loop, so renewals stop unless we rebuild it.

### How Chargebee's scheduler works
A continuous background clock on Chargebee's servers, ~daily:
```
DAILY JOB (Chargebee's servers)
  1. Query: which subscriptions have next_billing_at <= now ?
  2. For each due subscription:
       a. Generate an Invoice (plan price + proration + coupons + tax)
       b. Create a Stripe PaymentIntent against pm_xxx  → charge the card
       c. On success → mark invoice paid, advance next_billing_at += 1 period
       d. On failure → enter DUNNING (retry day 1, 3, 5… + emails)
  3. Fire webhooks to your app (subscription_renewed, payment_failed, …)
```
Two parts that make it reliable:
- **`next_billing_at` stored per subscription** = the cursor the clock reads. No date stored → nothing renews.
- **Idempotency** = the job can re-run without double-charging (each cycle's charge is keyed).

### Option A — Let Stripe be the scheduler (native Subscriptions) ✅ recommended
We **don't write a scheduler at all.** Create a Stripe `sub_xxx` per customer; **Stripe runs the clock:**
- Stripe stores `current_period_end`, auto-generates Invoice + PaymentIntent each cycle.
- Stripe handles **dunning (Smart Retries)** and **3DS/SCA** natively.
- Our app just listens to webhooks: `invoice.paid` → grant, `invoice.payment_failed` → warn, `customer.subscription.deleted` → revoke.

```php
// Laravel Cashier — Stripe is now the brain
$user->newSubscription('default', 'price_pro_monthly')
     ->trialUntil($nextRenewalDate)   // resume cycle where Chargebee left off, no charge now
     ->create($paymentMethodId);      // existing pm_xxx
```
Our "scheduler" becomes a **webhook controller** — no cron clock of our own.

### Option B — Build our own scheduler (mimic Chargebee exactly)
Keep firing one-off PaymentIntents ourselves via Laravel scheduled command + queued jobs:
```php
// app/Console/Kernel.php
$schedule->command('billing:run-due')->dailyAt('02:00');
```
```php
// billing:run-due
Subscription::where('status', 'active')
    ->where('next_billing_at', '<=', now())
    ->each(fn ($sub) => ChargeSubscription::dispatch($sub)); // queued job per sub
```
```php
// ChargeSubscription job
$invoice = $this->buildInvoice($sub);            // price + proration + coupon + tax
$pi = $stripe->paymentIntents->create([
    'amount'         => $invoice->total,
    'currency'       => $sub->currency,
    'customer'       => $sub->stripe_customer_id, // cus_xxx
    'payment_method' => $sub->stripe_pm_id,       // pm_xxx
    'off_session'    => true,                      // merchant-initiated, no customer present
    'confirm'        => true,
], ['idempotency_key' => "sub_{$sub->id}_cycle_{$sub->period_no}"]); // ← no double-charge

$pi->status === 'succeeded'
    ? $sub->advancePeriod()                        // next_billing_at += 1 interval
    : $sub->enterDunning();                        // our own retry schedule
```
We own: proration, dunning retries, tax, idempotency.

### Trade-off
| | A — Stripe Subscriptions | B — Own scheduler |
|---|---|---|
| Who runs the clock | **Stripe** | **Us** (Laravel cron + queue) |
| Dunning / retries | Stripe Smart Retries (free) | We build it |
| Proration / tax | Stripe handles | We build it |
| Control / flexibility | Stripe's model | Total |
| Effort | Days | Weeks+ |

> For "drop Chargebee without breaking the flow," **Option A** is fastest and offloads
> the riskiest parts (retries, SCA, idempotent renewals) back to Stripe.

---

## 4. Caveats to verify (most likely to bite)

- **Off-session / SCA / 3DS mandates:** recurring off-session charges (EU SCA, India
  RBI e-mandates) need a valid mandate for merchant-initiated transactions. Cards
  Chargebee saved *should* be set up off-session, but verify per region before relying
  on it. **EU and India are the tricky ones.**
- **System of record shifts to Stripe** going forward → we gain Stripe's native
  dunning / Smart Retries for free (replaces a big chunk of Chargebee).
- **Don't trust the redirect** for confirmation — webhooks are the source of truth.
- **Idempotency** on any migration script — never run the recreate step twice unguarded.

---

## 5. Open questions to resolve

1. What does **Stripe → Subscriptions** show today (empty vs. full)?
2. What **region** are the customers in? (Decides how much the SCA/mandate caveat matters.)
3. After cutting Chargebee: **native Stripe Subscriptions (Path A)** or **own scheduler (Path B)**?
4. Stack confirmation — Laravel + Stripe assumed (Laravel Cashier is the fast path for Path A).

---

*Companion to [CHARGEBEE_NOTES.md](CHARGEBEE_NOTES.md). Discussion in progress.*
