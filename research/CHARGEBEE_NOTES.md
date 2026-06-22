# Chargebee Integration — Discussion Notes & Handoff

> Context handoff file. Summary of a discussion about Chargebee, how it works with
> Stripe, who stores card data, the hosted checkout flow, and how to build/clone it
> in a Laravel app.

---

## 1. What Chargebee Is

Chargebee is a **subscription management & recurring billing platform** — it sits
**on top of** payment gateways, it is **not** a gateway itself.

- **Subscription/recurring billing** — plans, add-ons, trials, proration, upgrades/downgrades, pauses, cancellations
- **Invoicing & taxes** — automated invoices, EU VAT, US sales tax, GST
- **Dunning** — automatic retries + customer emails for failed payments
- **Revenue analytics** — MRR, churn, LTV (RevenueStory)

**Relationship to gateways:** Chargebee does *not* move money itself. It orchestrates
billing logic and delegates the actual charge to a connected gateway (Stripe,
Braintree, Razorpay, Authorize.net, PayPal, etc.).

**PHP SDK:** `chargebee/chargebee-php` (Composer) — relevant for Laravel.

---

## 2. The Mental Model

```
Your App  ──webhooks──>  Chargebee  ──Stripe API (as you)──>  Stripe  ──>  Customer's card
                          (billing logic)                     (moves money)
   <──webhooks───────────    │                                    │
                             └────────  webhooks  <───────────────┘
```

- **Stripe** = the muscle. Moves money, stores cards, runs the charge. Money lands in *your* Stripe balance → your bank.
- **Chargebee** = the brain. Decides *who* to charge, *how much*, *when*, retries, taxes, invoices.
- **The access** = a **Stripe Connect OAuth token** that *you* granted, letting Chargebee call Stripe's API on your behalf.

---

## 3. How Chargebee Deducts Money via Stripe (Step by Step)

### One-time setup: connect Stripe to Chargebee
1. Chargebee → **Settings → Payment Gateways → Add Stripe**.
2. Authorize via **Stripe Connect** (OAuth) — log into *your* Stripe, approve. Stripe hands Chargebee an API token scoped to your account.
3. Chargebee stores those credentials securely → it can now call Stripe **as you**.

### Capturing the card (card data never touches you or Chargebee in plaintext)
4. Customer enters card into a **Chargebee/Stripe hosted field** (`chargebee-js` / Stripe.js, browser-side).
5. Card goes **directly to Stripe** → returns a **token / PaymentMethod ID** (`pm_xxx`). Raw card number never hits your server (keeps PCI scope tiny).
6. Chargebee tells Stripe (API) to **create a Stripe Customer** + **attach the PaymentMethod**. Stripe stores the card; Chargebee stores only the reference IDs (`cus_xxx`, `pm_xxx`).

### The actual deduction (recurring charge)
7. Chargebee's **billing scheduler** sees the subscription is due → generates an **invoice** (plan price, proration, coupons, tax).
8. Chargebee calls the **Stripe API** (`PaymentIntent` create + confirm): *"charge $X to `pm_xxx` of `cus_xxx`"*, authenticated with the Connect token.
9. **Stripe** runs the charge (handles 3D Secure/SCA), moves funds into **your Stripe balance**, returns success/failure.
10. Chargebee records a **Transaction**, marks the invoice **Paid**, sets subscription `active` for next period.

### Confirmation + failure handling (webhooks)
11. Stripe fires webhooks to Chargebee (`payment_intent.succeeded` / `.payment_failed`) → keeps state in sync for async outcomes.
12. On failure, Chargebee's **dunning** engine retries on schedule (day 1, 3, 5…), emails customer to update card, eventually cancels.
13. Chargebee fires **its own webhooks** to *your* app (`payment_succeeded`, `subscription_renewed`, etc.) → you grant/revoke access.

---

## 4. Who Stores the Card Details? (Hosted Checkout)

**Stripe stores the card. Not Chargebee, not your app.**

| Layer | Stores |
|---|---|
| **Stripe vault** | Card number, CVV, expiry (PCI burden = Stripe's) |
| **Chargebee** | Reference tokens only (`cus_xxx`, `pm_xxx`) + safe metadata (last-4, brand, expiry mm/yy) |
| **Your app** | Usually just the Chargebee customer/subscription ID |

Raw card data flows **browser → Stripe directly**, skipping both Chargebee's servers and yours.

---

## 5. Hosted Checkout Flow — How It Gets "Called"

```
1. Your server  ──API──>  Chargebee:  "create a checkout for plan X"
2. Chargebee    ──returns──>  a hosted_page URL (+ token)
3. Your app redirects/opens that URL  ──>  customer sees Chargebee's page
4. Customer types card  ──directly──>  Stripe (tokenized, browser-side)
5. Stripe vaults the card, returns token to Chargebee
6. Chargebee creates customer + subscription, triggers first charge via Stripe
7. Chargebee redirects customer back to your redirect_url
8. Chargebee fires a webhook to your app to confirm
```

### Server-side call (Chargebee PHP SDK)
```php
$result = \ChargeBee\ChargeBee\Models\HostedPage::checkoutNewForItems([
    "subscriptionItems" => [[
        "itemPriceId" => "pro-plan-USD-monthly",
        "quantity"    => 1,
    ]],
    "customer" => [
        "email"     => $user->email,
        "firstName" => $user->name,
    ],
    "redirectUrl" => route('billing.callback'),
    "cancelUrl"   => route('billing.cancel'),
]);

$hostedPage = $result->hostedPage();
return redirect($hostedPage->url);   // customer goes here
```

### Two flavors of "hosted"
| Type | What's hosted | Card entry |
|---|---|---|
| **Hosted Page (full redirect)** | Entire page is Chargebee's URL | On Chargebee's domain |
| **Drop-in / Components (`chargebee-js`)** | Your page, Chargebee/Stripe iframes embedded | iframe fields → straight to Stripe |

Full redirect = least work + least PCI exposure.

### Confirming payment afterward (don't trust redirect alone)
1. **Retrieve on callback:**
   ```php
   $hp = \ChargeBee\ChargeBee\Models\HostedPage::retrieve($hostedPageId)->hostedPage();
   // $hp->state === "succeeded"
   ```
2. **Webhook (source of truth):** Chargebee POSTs `subscription_created` / `payment_succeeded` to your endpoint → grant access here.

---

## 6. "Cloning Chargebee" — What It Takes

### Core domain
| Module | Holds |
|---|---|
| Products / Plans / Prices | Pricing models (flat, per-unit, tiered, volume, usage), intervals, currencies |
| Add-ons & Coupons | Optional extras, discounts, redemption limits |
| Customers | Billing profile, tokenized payment methods, tax/region |
| Subscriptions | State machine: `trial → active → past_due → cancelled/paused`, plan changes, quantities |
| Invoices & Line items | Generated from subscriptions, **proration**, credits, taxes |
| Transactions / Payments | Actual charge records linked to a gateway |
| Credit notes / Refunds | Adjustments |

### The hard engine pieces
1. **Billing scheduler** — daily job: find due subscriptions, generate invoices, trigger charges (Laravel: scheduled command + queued jobs).
2. **Proration calculator** — mid-cycle upgrade credit/charge math (most clones get this wrong).
3. **Dunning manager** — failed payment → retry schedule → escalating emails → cancellation.
4. **Tax engine** — flat per-region to start; later VAT/GST via TaxJar/Avalara.
5. **Gateway abstraction** — interface so Stripe/Razorpay/etc. are swappable.
6. **Webhook ingestion** — receive gateway events, update subscription state.

### Supporting layers
- Hosted checkout + client-side tokenization (keep PCI scope minimal)
- Customer self-service portal (update card, change plan, cancel)
- Admin dashboard (plans, customers, invoices, MRR/churn analytics)
- Public REST API + your own webhooks
- **Idempotency, audit logs, event sourcing** — billing must be replayable, never double-charge

### Realistic Laravel path
- **v1:** Laravel Cashier + Stripe → recurring subscriptions in days. Handles subscriptions, proration, trials, webhooks. Docs: https://laravel.com/docs/billing
- **v2:** Build your own plan/coupon/dunning layer on top where Cashier is too rigid.
- **v3:** Gateway abstraction, multi-gateway, tax engine, hosted pages, public API.

> A true from-scratch Chargebee clone (multi-gateway, multi-currency, full tax + dunning + API + analytics) = realistically **multi-month, multi-developer** effort. Correctness of billing/proration/idempotency eats the time, not the CRUD.

---

## 7. Next Steps / Open Questions

Decisions to make before writing code:
1. **Goal?**
   - (a) Internal billing for one app → **Laravel Cashier** is the fast path.
   - (b) A standalone product to sell (real Chargebee competitor) → bigger build, scope a v1.
   - (c) Just estimating feasibility/effort.
2. **One-time payments or recurring subscriptions?** (Chargebee shines at subscriptions.)
3. **Which payment gateway behind it?** (Stripe assumed in these notes.)
4. **Use Chargebee itself, or build the Chargebee-equivalent logic in-house?**

### Suggested first implementation tasks (if integrating Chargebee into a Laravel app)
- [ ] Install `chargebee/chargebee-php` via Composer; add Chargebee site + API key to `.env`.
- [ ] Connect Stripe to Chargebee via Stripe Connect (dashboard, one-time).
- [ ] Create Plans/Item Prices in Chargebee dashboard.
- [ ] Build `BillingController@checkout` → generates hosted page, redirects.
- [ ] Build `billing.callback` route → retrieve hosted page state, confirm.
- [ ] Build webhook controller → handle `subscription_created`, `payment_succeeded`, `payment_failed`; grant/revoke access. Verify webhook signature.
- [ ] Build customer portal session for self-service (update card/cancel).

---

*Originally generated as a context handoff from an earlier session in the `azexo_Version` project.*
*See [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md) for the plan to leave Chargebee while keeping existing Stripe users.*
