// Package domain holds core value types shared across the platform.
package domain

import (
	"fmt"
	"strings"
)

// Money represents an amount in minor units (e.g. cents) plus an ISO 4217
// currency. Amounts are always integers — never use floats for money.
type Money struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

// NewMoney builds a Money, normalising the currency to upper case.
func NewMoney(amountMinor int64, currency string) Money {
	return Money{AmountMinor: amountMinor, Currency: strings.ToUpper(currency)}
}

// Add returns the sum of two amounts. It errors on currency mismatch.
func (m Money) Add(other Money) (Money, error) {
	if m.Currency != other.Currency {
		return Money{}, fmt.Errorf("currency mismatch: %s vs %s", m.Currency, other.Currency)
	}
	return Money{AmountMinor: m.AmountMinor + other.AmountMinor, Currency: m.Currency}, nil
}

// Sub returns m minus other. It errors on currency mismatch.
func (m Money) Sub(other Money) (Money, error) {
	if m.Currency != other.Currency {
		return Money{}, fmt.Errorf("currency mismatch: %s vs %s", m.Currency, other.Currency)
	}
	return Money{AmountMinor: m.AmountMinor - other.AmountMinor, Currency: m.Currency}, nil
}

// IsZero reports whether the amount is zero.
func (m Money) IsZero() bool { return m.AmountMinor == 0 }

// String renders the amount with two implied decimal places (display only).
func (m Money) String() string {
	return fmt.Sprintf("%.2f %s", float64(m.AmountMinor)/100, m.Currency)
}
