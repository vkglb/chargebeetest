package billing

import (
	"context"
	"time"
)

// Scheduler drives the billing engine on a fixed tick. It is the platform's
// "clock" — the brain Chargebee runs server-side. In production the same RunOnce
// can be driven by a River periodic job for horizontal scaling; this in-process
// ticker is the simplest correct default.
type Scheduler struct {
	engine   *Engine
	interval time.Duration
}

// NewScheduler builds a scheduler. interval defaults to 1 minute if non-positive.
func NewScheduler(engine *Engine, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = time.Minute
	}
	return &Scheduler{engine: engine, interval: interval}
}

// Run ticks until the context is cancelled, processing due subscriptions each
// tick. It runs one pass immediately on start.
func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	s.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	n, err := s.engine.RunOnce(ctx)
	if err != nil {
		s.engine.logger.Error("scheduler tick failed", "error", err)
		return
	}
	if n > 0 {
		s.engine.logger.Info("scheduler tick complete", "processed", n)
	}
}
