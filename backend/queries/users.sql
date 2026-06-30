-- name: GetUserMetadata :one
SELECT user_id, tour_completed_at, created_at, updated_at
FROM user_metadata
WHERE user_id = $1;

-- name: MarkTourCompleted :exec
INSERT INTO user_metadata (user_id, tour_completed_at)
VALUES ($1, now())
ON CONFLICT (user_id)
DO UPDATE SET tour_completed_at = now(), updated_at = now();
