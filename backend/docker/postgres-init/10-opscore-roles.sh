#!/bin/sh
set -eu

: "${OPSCORE_RUNTIME_PASSWORD:?set OPSCORE_RUNTIME_PASSWORD for the application runtime role}"
: "${OPSCORE_MIGRATOR_PASSWORD:?set OPSCORE_MIGRATOR_PASSWORD for the migration role}"
: "${OPSCORE_WORKER_PASSWORD:?set OPSCORE_WORKER_PASSWORD for the worker role}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v runtime_password="$OPSCORE_RUNTIME_PASSWORD" \
  -v migrator_password="$OPSCORE_MIGRATOR_PASSWORD" \
  -v worker_password="$OPSCORE_WORKER_PASSWORD" <<'SQL'
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_owner') THEN
    CREATE ROLE opscore_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_app') THEN
    CREATE ROLE opscore_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_runtime') THEN
    CREATE ROLE opscore_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD :'runtime_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_migrator') THEN
    CREATE ROLE opscore_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD :'migrator_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_worker') THEN
    CREATE ROLE opscore_worker LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD :'worker_password';
  END IF;
END
$do$;
SQL
