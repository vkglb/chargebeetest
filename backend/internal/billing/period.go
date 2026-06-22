// Package billing implements the recurring-billing engine: period math,
// proration, the charge flow, dunning, and the scheduler that drives them.
package billing

import (
	"fmt"
	"time"
)

// IntervalUnit values for a price's billing interval.
const (
	IntervalDay   = "day"
	IntervalWeek  = "week"
	IntervalMonth = "month"
	IntervalYear  = "year"
)

// NextBillingDate advances `from` by count units of the given interval. This is
// the cursor math the scheduler uses to set next_billing_at after each charge.
func NextBillingDate(from time.Time, unit string, count int) (time.Time, error) {
	if count <= 0 {
		count = 1
	}
	switch unit {
	case IntervalDay:
		return from.AddDate(0, 0, count), nil
	case IntervalWeek:
		return from.AddDate(0, 0, 7*count), nil
	case IntervalMonth:
		return from.AddDate(0, count, 0), nil
	case IntervalYear:
		return from.AddDate(count, 0, 0), nil
	default:
		return time.Time{}, fmt.Errorf("unknown interval unit %q", unit)
	}
}

// PeriodBounds returns the [start, end) of the billing period that begins at
// `start` for the given interval.
func PeriodBounds(start time.Time, unit string, count int) (periodStart, periodEnd time.Time, err error) {
	end, err := NextBillingDate(start, unit, count)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start, end, nil
}
