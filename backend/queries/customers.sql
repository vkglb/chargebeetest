-- name: CreateCustomer :one
INSERT INTO customers (merchant_id, mode, email, name, gateway_customer_ref, country)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: SeedCustomer :one
-- Insert a customer with a backdated created_at (used by the dev seeder so the
-- customers-by-day series has a realistic spread).
INSERT INTO customers (merchant_id, mode, email, name, gateway_customer_ref, country, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetCustomer :one
SELECT * FROM customers
WHERE id = $1 AND merchant_id = $2;

-- name: ListCustomersByMerchant :many
SELECT * FROM customers
WHERE merchant_id = $1 AND mode = $2
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: SetCustomerGatewayRef :one
UPDATE customers
SET gateway_customer_ref = $2
WHERE id = $1
RETURNING *;

-- name: CreatePaymentMethod :one
INSERT INTO payment_methods (
    merchant_id, mode, customer_id, gateway_pm_ref, brand, last4, exp_month, exp_year, is_default
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetDefaultPaymentMethod :one
SELECT * FROM payment_methods
WHERE customer_id = $1 AND is_default = true
LIMIT 1;

-- name: GetPaymentMethod :one
SELECT * FROM payment_methods
WHERE id = $1;
