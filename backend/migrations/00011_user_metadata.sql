-- +goose Up
-- +goose StatementBegin

-- Per-user onboarding/preferences metadata. Keyed 1:1 to a merchant user so
-- product-tour and similar "show once" flags survive a cleared browser
-- localStorage. Extend with more columns as new onboarding steps are added.
CREATE TABLE user_metadata (
    user_id           UUID PRIMARY KEY REFERENCES merchant_users(id) ON DELETE CASCADE,
    tour_completed_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS user_metadata;

-- +goose StatementEnd
