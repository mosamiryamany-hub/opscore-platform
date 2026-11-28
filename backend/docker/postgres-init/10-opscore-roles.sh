#!/bin/sh
set -eu

: "${OPSCORE_RUNTIME_PASSWORD:?set OPSCORE_RUNTIME_PASSWORD for the application runtime role}"
: "${OPSCORE_MIGRATOR_PASSWORD:?set OPSCORE_MIGRATOR_PASSWORD for the migration role}"
: "${OPSCORE_WORKER_PASSWORD:?set OPSCORE_WORKER_PASSWORD for the worker role}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v runtime_password="$OPSCORE_RUNTIME_PASSWORD" \
  -v migrator_password="$OPSCORE_MIGRATOR_PASSWORD" \
  -v worker_password="$OPSCORE_WORKER_PASSWORD" <<'SQL'
-- psql does not interpolate variables inside a dollar-quoted DO body.
-- Move the secrets into transaction-local custom settings, then quote them
-- with format(%L) when dynamically creating the login roles.
SELECT set_config('opscore.runtime_password', :'runtime_password', false);
SELECT set_config('opscore.migrator_password', :'migrator_password', false);
SELECT set_config('opscore.worker_password', :'worker_password', false);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_owner') THEN
    CREATE ROLE opscore_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_app') THEN
    CREATE ROLE opscore_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'CREATE ROLE neondb_owner NOLOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS INHERIT';
  ELSE
    EXECUTE 'ALTER ROLE neondb_owner WITH NOLOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS INHERIT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_runtime') THEN
    EXECUTE format(
      'CREATE ROLE opscore_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT PASSWORD %L',
      current_setting('opscore.runtime_password')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_migrator') THEN
    EXECUTE format(
      'CREATE ROLE opscore_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS NOINHERIT PASSWORD %L',
      current_setting('opscore.migrator_password')
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE opscore_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS NOINHERIT PASSWORD %L',
      current_setting('opscore.migrator_password')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_worker') THEN
    EXECUTE format(
      'CREATE ROLE opscore_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT PASSWORD %L',
      current_setting('opscore.worker_password')
    );
  END IF;
END
$do$;
SQL

# Self-hosted migrator needs CREATE on the application database and ability to manage
# least-privilege objects. Superuser remains postgres (init only).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v database_name="$POSTGRES_DB" <<'SQL'
-- Install privileged extensions before the non-superuser migrator starts.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
GRANT neondb_owner TO opscore_migrator;
GRANT CREATE, CONNECT ON DATABASE :"database_name" TO neondb_owner;
GRANT CREATE, USAGE ON SCHEMA public TO neondb_owner;
-- Some historical migrations use RESET ROLE after a scoped SET ROLE; PostgreSQL
-- resets to session_user (opscore_migrator), so retain only the schema DDL needed
-- to finish those migration files. The runtime role receives none of these grants.
GRANT CREATE, USAGE ON SCHEMA public TO opscore_migrator;
SQL
