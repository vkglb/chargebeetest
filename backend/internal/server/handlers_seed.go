package server

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/chargeebee/platform/internal/billing"
	sqlc "github.com/chargeebee/platform/internal/db/sqlc"
)

// handleSeed populates the current merchant + mode with a realistic demo dataset
// so the dashboard and charts can be exercised. Additive: each call adds more.
func (s *Server) handleSeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	mid := merchantID(r)
	md := mode(r)
	now := time.Now().UTC()

	// ── Catalog ──────────────────────────────────────────────
	type planSpec struct {
		product  string
		nickname string
		amount   int64
		interval string
	}
	specs := []planSpec{
		{"Starter", "Starter Monthly", 900, "month"},
		{"Pro", "Pro Monthly", 2900, "month"},
		{"Pro", "Pro Yearly", 29000, "year"},
		{"Enterprise", "Enterprise Monthly", 9900, "month"},
	}
	var priceIDs []uuid.UUID
	var priceAmt []int64
	productCache := map[string]uuid.UUID{}
	for _, sp := range specs {
		pid, ok := productCache[sp.product]
		if !ok {
			prod, err := s.q.CreateProduct(ctx, sqlc.CreateProductParams{MerchantID: mid, Mode: md, Name: sp.product})
			if err != nil {
				writeError(w, http.StatusInternalServerError, "seed: product")
				return
			}
			pid = prod.ID
			productCache[sp.product] = pid
		}
		price, err := s.q.CreatePrice(ctx, sqlc.CreatePriceParams{
			MerchantID: mid, Mode: md, ProductID: pid, Nickname: pgText(sp.nickname),
			AmountMinor: sp.amount, Currency: "USD", IntervalUnit: sp.interval, IntervalCount: 1, TrialDays: 0,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "seed: price")
			return
		}
		priceIDs = append(priceIDs, price.ID)
		priceAmt = append(priceAmt, sp.amount)
	}

	// ── Customers + subscriptions (varied statuses) ──────────
	names := []string{"Jane Doe", "Sam Park", "Acme Corp", "Globex", "Initech", "Umbrella", "Hooli", "Stark Inc"}
	statuses := []string{"active", "active", "active", "trialing", "past_due", "cancelled"}
	for i, name := range names {
		email := fmt.Sprintf("user%d+%s@example.com", i, uuid.NewString()[:6])
		cust, err := s.q.CreateCustomer(ctx, sqlc.CreateCustomerParams{
			MerchantID: mid, Mode: md, Email: email, Name: pgText(name), GatewayCustomerRef: pgText(""),
		})
		if err != nil {
			continue
		}
		pIdx := i % len(priceIDs)
		status := statuses[i%len(statuses)]
		ps, pe, _ := billing.PeriodBounds(now, "month", 1)
		_, _ = s.q.CreateSubscription(ctx, sqlc.CreateSubscriptionParams{
			MerchantID: mid, Mode: md, CustomerID: cust.ID, PriceID: priceIDs[pIdx],
			PaymentMethodID: pgUUID(uuid.Nil), Status: status, Quantity: 1,
			CurrentPeriodStart: timePtr(ps), CurrentPeriodEnd: timePtr(pe), NextBillingAt: timePtr(pe),
		})
	}

	// ── 30 days of succeeded transactions (fills the revenue chart) ──
	rng := rand.New(rand.NewSource(now.UnixNano()))
	count := 0
	for day := 29; day >= 0; day-- {
		txPerDay := rng.Intn(4) + 1
		for t := 0; t < txPerDay; t++ {
			amt := priceAmt[rng.Intn(len(priceAmt))]
			ts := now.AddDate(0, 0, -day).Add(time.Duration(rng.Intn(86400)) * time.Second)
			if err := s.q.SeedTransaction(ctx, sqlc.SeedTransactionParams{
				MerchantID: mid, Mode: md, Status: "succeeded",
				AmountMinor: amt, Currency: "USD", CreatedAt: pgTimestamptz(ts),
			}); err == nil {
				count++
			}
		}
	}
	// A few failed ones for realism.
	seedFailed(ctx, s, mid, md, now, rng)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "seeded",
		"products":     len(productCache),
		"prices":       len(priceIDs),
		"customers":    len(names),
		"transactions": count,
		"mode":         md,
	})
}

func seedFailed(ctx context.Context, s *Server, mid uuid.UUID, md string, now time.Time, rng *rand.Rand) {
	for i := 0; i < 4; i++ {
		ts := now.AddDate(0, 0, -rng.Intn(30))
		_ = s.q.SeedTransaction(ctx, sqlc.SeedTransactionParams{
			MerchantID: mid, Mode: md, Status: "failed",
			AmountMinor: 2900, Currency: "USD", CreatedAt: pgTimestamptz(ts),
		})
	}
}
