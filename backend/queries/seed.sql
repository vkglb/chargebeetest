-- name: SeedTransaction :exec
-- Insert a backdated transaction (used by the dev seeder to populate charts).
INSERT INTO transactions (merchant_id, mode, status, amount_minor, currency, created_at)
VALUES ($1, $2, $3, $4, $5, $6);
