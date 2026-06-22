-- name: GetGatewayAccount :one
SELECT * FROM gateway_accounts
WHERE merchant_id = $1 AND provider = $2;

-- name: GetPrimaryGatewayAccount :one
-- The merchant's active gateway used for charging (most recently connected).
SELECT * FROM gateway_accounts
WHERE merchant_id = $1 AND status = 'connected'
ORDER BY created_at DESC
LIMIT 1;

-- name: ListGatewayAccountsByMerchant :many
SELECT id, merchant_id, provider, account_ref, status, created_at
FROM gateway_accounts
WHERE merchant_id = $1
ORDER BY created_at DESC;

-- name: UpsertGatewayAccount :one
INSERT INTO gateway_accounts (merchant_id, provider, account_ref, encrypted_credentials, status)
VALUES ($1, $2, $3, $4, 'connected')
ON CONFLICT (merchant_id, provider)
DO UPDATE SET account_ref = EXCLUDED.account_ref,
              encrypted_credentials = EXCLUDED.encrypted_credentials,
              status = 'connected'
RETURNING id, merchant_id, provider, account_ref, status, created_at;

-- name: CreateInvoice :one
INSERT INTO invoices (
    merchant_id, customer_id, subscription_id, status, currency,
    subtotal_minor, discount_minor, tax_minor, total_minor,
    period_start, period_end, issued_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
    merchant_id, invoice_id, gateway_txn_ref, status,
    amount_minor, currency, failure_reason, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CreateDunningAttempt :one
INSERT INTO dunning_attempts (merchant_id, invoice_id, attempt_no, scheduled_at, attempted_at, result)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;
