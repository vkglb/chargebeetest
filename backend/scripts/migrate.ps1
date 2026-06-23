# Windows convenience: bootstrap (optional) + run migrations.
#
#   ./scripts/migrate.ps1                 # apply all migrations
#   ./scripts/migrate.ps1 -Bootstrap      # create role/db first (needs superuser)
#   ./scripts/migrate.ps1 -Command down   # roll back last migration
#
# Set $env:DATABASE_URL to override the default local DSN.

param(
    [string]$Command = "up",
    [switch]$Bootstrap
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if ($Bootstrap) {
    Write-Host "Bootstrapping role + database (enter the postgres superuser password)..."
    psql -U postgres -h localhost -f scripts/bootstrap.sql
}

if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgres://chargeebee:chargeebee@localhost:5432/chargeebee?sslmode=disable"
}

Write-Host "Running migrations ($Command) against $($env:DATABASE_URL)"
go run ./cmd/migrate $Command
