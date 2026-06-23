// Package migrations embeds the SQL migration files so they can be applied by
// the cmd/migrate runner without needing the goose CLI installed.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
