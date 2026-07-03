-- name: GetUserMetadata :one
SELECT user_id, tour_completed_at, two_factor_enabled, created_at, updated_at
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
