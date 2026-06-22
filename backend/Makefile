.PHONY: help build run tidy db-up db-down migrate-up migrate-down sqlc tools

DATABASE_URL ?= postgres://chargeebee:chargeebee@localhost:5432/chargeebee?sslmode=disable

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Compile the API binary
	go build -o bin/api ./cmd/api

run: ## Run the API server
	go run ./cmd/api

tidy: ## Tidy go modules
	go mod tidy

db-up: ## Start Postgres (docker compose)
	docker compose -f ../docker-compose.yml up -d postgres

db-down: ## Stop Postgres
	docker compose -f ../docker-compose.yml down

migrate-up: ## Apply all migrations
	goose -dir migrations postgres "$(DATABASE_URL)" up

migrate-down: ## Roll back the last migration
	goose -dir migrations postgres "$(DATABASE_URL)" down

migrate-status: ## Show migration status
	goose -dir migrations postgres "$(DATABASE_URL)" status

sqlc: ## Generate type-safe DB code from SQL
	sqlc generate

tools: ## Install dev tools (goose, sqlc)
	go install github.com/pressly/goose/v3/cmd/goose@latest
	go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
