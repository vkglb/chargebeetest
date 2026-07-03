-- name: GetUserMetadata :one
SELECT user_id, tour_completed_at, two_factor_enabled, two_factor_secret, created_at, updated_at
FROM user_metadata
WHERE user_id = $1;

-- name: MarkTourCompleted :exec
INSERT INTO user_metadata (user_id, tour_completed_at)
VALUES ($1, now())
ON CONFLICT (user_id)
DO UPDATE SET tour_completed_at = now(), updated_at = now();

-- name: UpdateTwoFactor :exec
INSERT INTO user_metadata (user_id, two_factor_enabled)
VALUES ($1, $2)
ON CONFLICT (user_id)
DO UPDATE SET two_factor_enabled = $2, updated_at = now();

-- name: SetTwoFactorSecret :exec
-- Store a pending TOTP secret during setup (not yet enabled until confirmed).
INSERT INTO user_metadata (user_id, two_factor_secret, two_factor_enabled)
VALUES ($1, $2, false)
ON CONFLICT (user_id)
DO UPDATE SET two_factor_secret = $2, two_factor_enabled = false, updated_at = now();

-- name: EnableTwoFactor :exec
UPDATE user_metadata
SET two_factor_enabled = true, updated_at = now()
WHERE user_id = $1;

-- name: DisableTwoFactor :exec
INSERT INTO user_metadata (user_id, two_factor_secret, two_factor_enabled)
VALUES ($1, '', false)
ON CONFLICT (user_id)
DO UPDATE SET two_factor_secret = '', two_factor_enabled = false, updated_at = now();
