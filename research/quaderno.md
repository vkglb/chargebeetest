# Quaderno (Tax Layer) — Does It Connect to Stripe or via Chargebee?

> Quaderno is a **tax compliance + invoicing** tool (VAT / GST / US sales tax
> calculation, tax-compliant invoices & receipts, tax reporting). It is **not** a
> gateway and **not** a billing engine — it sits *alongside* them, watching
> transactions and producing tax documents.
>
> The question that matters for the migration: **is Quaderno wired directly to Stripe,
> or routed through Chargebee?** That decides whether cutting Chargebee also breaks the
> tax/invoicing flow.
>
> Companion to [CRITICAL_NOTES.md](CRITICAL_NOTES.md),
> [MIGRATION_OFF_CHARGEBEE.md](MIGRATION_OFF_CHARGEBEE.md), [CHARGEBEE_NOTES.md](CHARGEBEE_NOTES.md).

---

## The two possible wiring patterns

Quaderno supports both. Our setup is one of them — must verify which.

### Pattern A — Quaderno connects DIRECTLY to Stripe (most common) ✅
```
Stripe  ──(Quaderno native Stripe integration / webhooks)──>  Quaderno
```
- Quaderno has a native Stripe connector — watches Stripe charges/invoices, generates tax docs from them.
- Chargebee is irrelevant to Quaderno here.
- **Cutting Chargebee does NOT break Quaderno.** ✅

### Pattern B — Quaderno fed through the Chargebee layer ⚠️
```
Chargebee  ──(webhook / API)──>  Quaderno
```
- Quaderno wired to Chargebee's events instead of Stripe.
- Tax flow then depends on Chargebee.
- **Cutting Chargebee BREAKS the tax/invoicing flow.** ⚠️ Must re-point Quaderno to Stripe first.

> Note: Quaderno's primary / best-supported model is **direct-to-Stripe**. A
> Chargebee-routed setup is possible but less standard. Don't assume — verify.

---

## How to verify (3 quick checks)

1. **Quaderno → Settings → Integrations / Connected accounts**
   - Lists **Stripe** as a connected source? → Pattern A (direct).
2. **Stripe → Developers → Webhooks**
   - A **Quaderno webhook endpoint** (a `*.quaderno.io` URL)? → Quaderno listens to Stripe directly.
3. **Chargebee → Settings → Webhooks**
   - A **Quaderno endpoint** there? → Quaderno is (also) fed by Chargebee = Pattern B dependency.

**Decisive combo:** if **#1 shows Stripe connected** AND **#2 shows a Quaderno webhook in Stripe**, we're on the safe path — Chargebee removal won't touch tax docs.

---

## Why it matters for the migration

- Moving to **native Stripe Subscriptions** (Path A in the migration plan) pairs ideally
  with a direct Stripe↔Quaderno wiring: Quaderno just keeps reading Stripe invoices,
  which become richer (Stripe-generated) after migration.
- If Quaderno is on **Chargebee (Pattern B)**, re-point it to Stripe **before** cutting
  over, or tax documents/receipts stop generating.

---

## Decision gate

- [ ] Confirmed Quaderno wiring: **Pattern A (direct to Stripe)** or **Pattern B (via Chargebee)**.
- [ ] If Pattern B → re-point Quaderno to Stripe and verify tax docs generate, BEFORE cancelling Chargebee.

> ⏳ STATUS: need what **Quaderno → Integrations** shows, and whether a `*.quaderno.io`
> webhook exists in Stripe vs Chargebee.
