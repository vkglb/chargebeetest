-- name: GetGatewayAccount :one
SELECT * FROM gateway_accounts
WHERE merchant_id = $1 AND mode = $2 AND provider = $3;

-- name: GetPrimaryGatewayAccount :one
-- The merchant's active gateway used for charging, for a given mode.
SELECT * FROM gateway_accounts
WHERE merchant_id = $1 AND mode = $2 AND status = 'connected'
ORDER BY created_at DESC
LIMIT 1;

-- name: ListGatewayAccountsByMerchant :many
SELECT id, merchant_id, mode, provider, account_ref, publishable_key, status, created_at
FROM gateway_accounts
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC;

-- name: UpsertGatewayAccount :one
INSERT INTO gateway_accounts (merchant_id, mode, provider, account_ref, encrypted_credentials, publishable_key, status)
VALUES ($1, $2, $3, $4, $5, $6, 'connected')
ON CONFLICT (merchant_id, mode, provider)
DO UPDATE SET account_ref = EXCLUDED.account_ref,
              encrypted_credentials = EXCLUDED.encrypted_credentials,
              publishable_key = EXCLUDED.publishable_key,
              status = 'connected'
RETURNING id, merchant_id, mode, provider, account_ref, publishable_key, status, created_at;

-- name: DeleteGatewayAccount :execrows
-- Disconnect a gateway for a merchant + mode (removes the stored credentials).
DELETE FROM gateway_accounts
WHERE merchant_id = $1 AND mode = $2 AND provider = $3;

-- name: CreateInvoice :one
INSERT INTO invoices (
    merchant_id, mode, customer_id, subscription_id, status, currency,
    subtotal_minor, discount_minor, tax_minor, total_minor,
    period_start, period_end, issued_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: MarkInvoicePaid :one
UPDATE invoices
SET status = 'paid', paid_at = now()
WHERE id = $1
RETURNING *;

-- name: MarkInvoiceStatus :one
UPDATE invoices
SET status = $2
WHERE id = $1
RETURNING *;

-- name: CreateInvoiceLineItem :one
INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_amount_minor, amount_minor)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CreateTransaction :one
INSERT INTO transactions (
    merchant_id, mode, invoice_id, gateway_txn_ref, status,
    amount_minor, currency, failure_reason, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: CreateDunningAttempt :one
INSERT INTO dunning_attempts (merchant_id, mode, invoice_id, attempt_no, scheduled_at, attempted_at, result)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: CountDunningAttempts :one
-- How many dunning retries have already been recorded for a subscription.
SELECT COUNT(*)::bigint AS count
FROM dunning_attempts da
JOIN invoices i ON i.id = da.invoice_id
WHERE i.subscription_id = $1;

-- name: ListInvoicesByMerchant :many
SELECT * FROM invoices
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: ListTransactionsByMerchant :many
SELECT * FROM transactions
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;
