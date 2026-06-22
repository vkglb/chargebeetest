package billing

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
	"github.com/chargeebee/platform/internal/domain"
	"github.com/chargeebee/platform/internal/gateway"
)

// CredentialResolver decrypts a merchant's stored gateway account into usable
// credentials. The dev resolver treats encrypted_credentials as plaintext; a
// production resolver decrypts with a KMS-managed key.
type CredentialResolver interface {
	Resolve(ctx context.Context, account sqlc.GatewayAccount) (gateway.Credentials, error)
}

// Engine runs the recurring-billing loop: find due subscriptions, build an
// invoice, charge the gateway off-session, and advance or enter dunning.
type Engine struct {
	q        *sqlc.Queries
	registry *gateway.Registry
	resolve  CredentialResolver
	logger   *slog.Logger
	batch    int32
}

// NewEngine constructs a billing engine backed by a multi-gateway registry.
func NewEngine(q *sqlc.Queries, registry *gateway.Registry, resolve CredentialResolver, logger *slog.Logger) *Engine {
	return &Engine{q: q, registry: registry, resolve: resolve, logger: logger, batch: 100}
}

// RunOnce processes one batch of due subscriptions. The scheduler calls this on
// a tick; each due subscription is charged for its next period.
func (e *Engine) RunOnce(ctx context.Context) (processed int, err error) {
	subs, err := e.q.ListDueSubscriptions(ctx, e.batch)
	if err != nil {
		return 0, fmt.Errorf("list due subscriptions: %w", err)
	}
	for _, sub := range subs {
		if err := e.processSubscription(ctx, sub); err != nil {
			// Isolate failures: one bad subscription must not stall the batch.
			e.logger.Error("billing: subscription failed",
				"subscription_id", sub.ID, "merchant_id", sub.MerchantID, "error", err)
			continue
		}
		processed++
	}
	return processed, nil
}

// processSubscription bills a single due subscription end-to-end.
func (e *Engine) processSubscription(ctx context.Context, sub sqlc.Subscription) error {
	price, err := e.q.GetPrice(ctx, sqlc.GetPriceParams{ID: sub.PriceID, MerchantID: sub.MerchantID})
	if err != nil {
		return fmt.Errorf("get price: %w", err)
	}
	customer, err := e.q.GetCustomer(ctx, sqlc.GetCustomerParams{ID: sub.CustomerID, MerchantID: sub.MerchantID})
	if err != nil {
		return fmt.Errorf("get customer: %w", err)
	}

	pm, err := e.resolvePaymentMethod(ctx, sub)
	if err != nil {
		return fmt.Errorf("resolve payment method: %w", err)
	}

	acct, err := e.q.GetPrimaryGatewayAccount(ctx, sub.MerchantID)
	if err != nil {
		return fmt.Errorf("get gateway account: %w", err)
	}
	gw, err := e.registry.Get(acct.Provider)
	if err != nil {
		return fmt.Errorf("resolve gateway: %w", err)
	}
	creds, err := e.resolve.Resolve(ctx, acct)
	if err != nil {
		return fmt.Errorf("resolve credentials: %w", err)
	}

	now := time.Now().UTC()
	periodStart, periodEnd, err := PeriodBounds(now, price.IntervalUnit, int(price.IntervalCount))
	if err != nil {
		return err
	}

	amount := price.AmountMinor * int64(sub.Quantity)

	// Create the invoice up front (open), so the charge has something to settle.
	inv, err := e.q.CreateInvoice(ctx, sqlc.CreateInvoiceParams{
		MerchantID:     sub.MerchantID,
		CustomerID:     sub.CustomerID,
		SubscriptionID: pgUUID(sub.ID),
		Status:         "open",
		Currency:       price.Currency,
		SubtotalMinor:  amount,
		DiscountMinor:  0,
		TaxMinor:       0,
		TotalMinor:     amount,
		PeriodStart:    timePtr(periodStart),
		PeriodEnd:      timePtr(periodEnd),
		IssuedAt:       timePtr(now),
	})
	if err != nil {
		return fmt.Errorf("create invoice: %w", err)
	}

	// Idempotency key ties the charge to this subscription+period — a retried
	// run never double-charges.
	idem := fmt.Sprintf("sub_%s_period_%d", sub.ID, periodEnd.Unix())

	res, chargeErr := gw.Charge(ctx, creds, gateway.ChargeParams{
		Amount:          domain.NewMoney(amount, price.Currency),
		GatewayCustomer: customer.GatewayCustomerRef.String,
		GatewayPM:       pm.GatewayPmRef,
		IdempotencyKey:  idem,
		Description:     fmt.Sprintf("Subscription %s", sub.ID),
	})
	if chargeErr != nil {
		return fmt.Errorf("charge: %w", chargeErr)
	}

	// Record the transaction regardless of outcome.
	_, err = e.q.CreateTransaction(ctx, sqlc.CreateTransactionParams{
		MerchantID:     sub.MerchantID,
		InvoiceID:      pgUUID(inv.ID),
		GatewayTxnRef:  pgText(res.GatewayTxnRef),
		Status:         string(res.Status),
		AmountMinor:    amount,
		Currency:       price.Currency,
		FailureReason:  pgText(res.FailureReason),
		IdempotencyKey: pgText(idem),
	})
	if err != nil {
		return fmt.Errorf("record transaction: %w", err)
	}

	if res.Status == gateway.ChargeSucceeded {
		return e.onChargeSucceeded(ctx, sub, inv.ID, periodStart, periodEnd)
	}
	return e.onChargeFailed(ctx, sub, inv.ID, now)
}

func (e *Engine) onChargeSucceeded(ctx context.Context, sub sqlc.Subscription, invoiceID uuid.UUID, periodStart, periodEnd time.Time) error {
	if _, err := e.q.MarkInvoicePaid(ctx, invoiceID); err != nil {
		return fmt.Errorf("mark invoice paid: %w", err)
	}
	if _, err := e.q.AdvanceSubscriptionPeriod(ctx, sqlc.AdvanceSubscriptionPeriodParams{
		ID:                 sub.ID,
		CurrentPeriodStart: timePtr(periodStart),
		CurrentPeriodEnd:   timePtr(periodEnd),
		NextBillingAt:      timePtr(periodEnd), // next cycle bills when this period ends
	}); err != nil {
		return fmt.Errorf("advance subscription: %w", err)
	}
	e.logger.Info("billing: charge succeeded",
		"subscription_id", sub.ID, "merchant_id", sub.MerchantID, "next_billing_at", periodEnd)
	return nil
}

func (e *Engine) onChargeFailed(ctx context.Context, sub sqlc.Subscription, invoiceID uuid.UUID, firstFailure time.Time) error {
	if _, err := e.q.SetSubscriptionStatus(ctx, sqlc.SetSubscriptionStatusParams{
		ID:         sub.ID,
		Status:     "past_due",
		MerchantID: sub.MerchantID,
	}); err != nil {
		return fmt.Errorf("set past_due: %w", err)
	}

	// Schedule the first dunning retry.
	when, ok := NextDunningTime(firstFailure, 1, DefaultRetrySchedule)
	if ok {
		if _, err := e.q.CreateDunningAttempt(ctx, sqlc.CreateDunningAttemptParams{
			MerchantID:  sub.MerchantID,
			InvoiceID:   invoiceID,
			AttemptNo:   1,
			ScheduledAt: pgTimestamptz(when),
			AttemptedAt: nil,
			Result:      pgText("scheduled"),
		}); err != nil {
			return fmt.Errorf("create dunning attempt: %w", err)
		}
	}
	e.logger.Warn("billing: charge failed, entered dunning",
		"subscription_id", sub.ID, "merchant_id", sub.MerchantID, "next_retry", when)
	return nil
}

func (e *Engine) resolvePaymentMethod(ctx context.Context, sub sqlc.Subscription) (sqlc.PaymentMethod, error) {
	if sub.PaymentMethodID.Valid {
		return e.q.GetPaymentMethod(ctx, uuid.UUID(sub.PaymentMethodID.Bytes))
	}
	return e.q.GetDefaultPaymentMethod(ctx, sub.CustomerID)
}
