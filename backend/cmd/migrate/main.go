// Command migrate applies database migrations using the embedded SQL files.
//
// Usage:
//
//	go run ./cmd/migrate up        # apply all pending migrations
//	go run ./cmd/migrate down      # roll back the most recent migration
//	go run ./cmd/migrate status    # show migration status
//	go run ./cmd/migrate reset     # roll back everything
//
// Connection string is read from DATABASE_URL (falls back to the local dev DSN).
// No external tools required — goose runs as a library over the embedded FS.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib" // pgx driver for database/sql
	"github.com/pressly/goose/v3"

	"github.com/chargeebee/platform/internal/config"
	"github.com/chargeebee/platform/migrations"
)

func main() {
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("cannot reach database (%s): %v", cfg.DatabaseURL, err)
	}

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("dialect: %v", err)
	}

	// "." because the embedded FS root is the migrations directory itself.
	const dir = "."
	switch cmd {
	case "up":
		err = goose.Up(db, dir)
	case "down":
		err = goose.Down(db, dir)
	case "reset":
		err = goose.Reset(db, dir)
	case "status":
		err = goose.Status(db, dir)
	case "version":
		err = goose.Version(db, dir)
	default:
		log.Fatalf("unknown command %q (use: up|down|reset|status|version)", cmd)
	}
	if err != nil {
		log.Fatalf("migrate %s: %v", cmd, err)
	}
	fmt.Printf("migrate %s: done\n", cmd)
}
