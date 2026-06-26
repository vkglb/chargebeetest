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

	// Connect the sandbox simulator gateway so the seeded subscriptions are
	// billable end-to-end (the scheduler can charge them without real cards).
	_, _ = s.q.UpsertGatewayAccount(ctx, sqlc.UpsertGatewayAccountParams{
		MerchantID: mid, Mode: md, Provider: "sandbox",
		AccountRef: pgText("sandbox-simulator"), EncryptedCredentials: []byte("sandbox"),
	})

	rng := rand.New(rand.NewSource(now.UnixNano()))

	// ── Customers + subscriptions (varied statuses, backdated) ──────────
	// created_at is spread across the last 30 days so the customers-by-day,
	// subscriptions-by-day and MRR-by-day series (and their sparklines) show a
	// realistic shape rather than a single same-day spike.
	names := []string{"Jane Doe", "Sam Park", "Acme Corp", "Globex", "Initech", "Umbrella", "Hooli", "Stark Inc"}
	countries := []string{"US", "GB", "US", "CA", "IN", "DE", "AU", "US"}
	statuses := []string{"active", "active", "active", "trialing", "past_due", "cancelled"}
	for i, name := range names {
		email := fmt.Sprintf("user%d+%s@example.com", i, uuid.NewString()[:6])
		joined := now.AddDate(0, 0, -rng.Intn(30)).Add(time.Duration(rng.Intn(86400)) * time.Second)
		cust, err := s.q.SeedCustomer(ctx, sqlc.SeedCustomerParams{
			MerchantID: mid, Mode: md, Email: email, Name: pgText(name),
			GatewayCustomerRef: pgText("cus_sbx_" + uuid.NewString()[:12]),
			Country:            countries[i%len(countries)],
			CreatedAt:          pgTimestamptz(joined),
		})
		if err != nil {
			continue
		}
		// Give each customer a saved (sandbox) card. Every 4th one gets a card
		// that will be declined, so a billing run shows the dunning path too.
		pmRef := "pm_sbx_" + uuid.NewString()[:12]
		if i%4 == 3 {
			pmRef = "pm_fail_" + uuid.NewString()[:8]
		}
		pm, err := s.q.CreatePaymentMethod(ctx, sqlc.CreatePaymentMethodParams{
			MerchantID: mid, Mode: md, CustomerID: cust.ID, GatewayPmRef: pmRef,
			Brand: pgText("visa"), Last4: pgText("4242"), ExpMonth: pgInt4(12, true), ExpYear: pgInt4(2030, true),
			IsDefault: true,
		})
		pmID := pgUUID(uuid.Nil)
		if err == nil {
			pmID = pgUUID(pm.ID)
		}
		pIdx := i % len(priceIDs)
		status := statuses[i%len(statuses)]
		ps, pe, _ := billing.PeriodBounds(now, "month", 1)
		_, _ = s.q.SeedSubscription(ctx, sqlc.SeedSubscriptionParams{
			MerchantID: mid, Mode: md, CustomerID: cust.ID, PriceID: priceIDs[pIdx],
			PaymentMethodID: pmID, Status: status, Quantity: 1,
			CurrentPeriodStart: timePtr(ps), CurrentPeriodEnd: timePtr(pe), NextBillingAt: timePtr(pe),
			CreatedAt: pgTimestamptz(joined),
		})
	}

	// ── 30 days of succeeded transactions (fills the revenue chart) ──
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
