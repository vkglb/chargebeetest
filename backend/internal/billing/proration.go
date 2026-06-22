package billing

import (
	"time"

	"github.com/shopspring/decimal"
)

// Prorate computes the prorated amount (in minor units) for a mid-cycle change.
//
// It returns the portion of fullAmountMinor corresponding to the unused time
// remaining in the period [periodStart, periodEnd) as of `at`. This is the math
// most billing clones get wrong, so it is isolated and exact via decimal.
//
// Example: switching plans halfway through a monthly cycle yields ~50% credit.
func Prorate(fullAmountMinor int64, periodStart, periodEnd, at time.Time) int64 {
	total := periodEnd.Sub(periodStart)
	if total <= 0 {
		return 0
	}
	if at.Before(periodStart) {
		at = periodStart
	}
	if at.After(periodEnd) {
		at = periodEnd
	}

	remaining := periodEnd.Sub(at)
	if remaining <= 0 {
		return 0
	}

	fraction := decimal.NewFromInt(int64(remaining)).
		Div(decimal.NewFromInt(int64(total)))

	prorated := decimal.NewFromInt(fullAmountMinor).Mul(fraction)
	return prorated.Round(0).IntPart()
}

// ApplyCoupon reduces amountMinor by a coupon. discountType is "percentage"
// (value 0-100) or "fixed" (value in minor units). The result never goes below 0.
func ApplyCoupon(amountMinor, value int64, discountType string) (newAmount, discount int64) {
	switch discountType {
	case "percentage":
		discount = decimal.NewFromInt(amountMinor).
			Mul(decimal.NewFromInt(value)).
			Div(decimal.NewFromInt(100)).
			Round(0).IntPart()
	case "fixed":
		discount = value
	default:
		discount = 0
	}
	if discount > amountMinor {
		discount = amountMinor
	}
	return amountMinor - discount, discount
}
