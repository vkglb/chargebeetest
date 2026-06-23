-- Bootstrap: create the chargeebee role and database.
-- Run ONCE as a Postgres superuser before migrating:
--
--   psql -U postgres -h localhost -f scripts/bootstrap.sql
--
-- Safe to re-run: each step is guarded.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chargeebee') THEN
    CREATE ROLE chargeebee LOGIN PASSWORD 'chargeebee';
  END IF;
END
$$;

SELECT 'CREATE DATABASE chargeebee OWNER chargeebee'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'chargeebee')\gexec

GRANT ALL PRIVILEGES ON DATABASE chargeebee TO chargeebee;
