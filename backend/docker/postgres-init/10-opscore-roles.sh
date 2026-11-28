#!/bin/sh
set -eu

: "${OPSCORE_RUNTIME_PASSWORD:?set OPSCORE_RUNTIME_PASSWORD for the application runtime role}"
: "${OPSCORE_MIGRATOR_PASSWORD:?set OPSCORE_MIGRATOR_PASSWORD for the migration role}"
: "${OPSCORE_WORKER_PASSWORD:?set OPSCORE_WORKER_PASSWORD for the worker role}"

# Read secrets from the container environment inside psql; never place them in
# psql command-line arguments or SQL source text.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv runtime_password OPSCORE_RUNTIME_PASSWORD
\getenv migrator_password OPSCORE_MIGRATOR_PASSWORD
\getenv worker_password OPSCORE_WORKER_PASSWORD

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_owner') THEN
    CREATE ROLE opscore_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_app') THEN
    CREATE ROLE opscore_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    -- Compatibility owner required by immutable historical migrations; this
    -- is a local NOLOGIN role, not a Neon service or external dependency.
    CREATE ROLE neondb_owner NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_auth_definer') THEN
    CREATE ROLE opscore_auth_definer NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

SELECT format('CREATE ROLE opscore_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_runtime')
\gexec
SELECT format('CREATE ROLE opscore_migrator LOGIN NOSUPERUSER BYPASSRLS NOINHERIT PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_migrator')
\gexec
SELECT format('CREATE ROLE opscore_worker LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD %L', :'worker_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_worker')
\gexec

GRANT neondb_owner TO opscore_migrator WITH INHERIT TRUE, SET TRUE;
GRANT opscore_auth_definer TO neondb_owner WITH INHERIT FALSE, SET TRUE;

CREATE SCHEMA IF NOT EXISTS opscore_security AUTHORIZATION opscore_auth_definer;
ALTER SCHEMA opscore_security OWNER TO opscore_auth_definer;
GRANT USAGE, CREATE ON SCHEMA opscore_security TO neondb_owner;

DO $verify$
DECLARE
  runtime_role pg_roles%ROWTYPE;
  migrator_role pg_roles%ROWTYPE;
  worker_role pg_roles%ROWTYPE;
  owner_role pg_roles%ROWTYPE;
  auth_definer_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO runtime_role FROM pg_roles WHERE rolname = 'opscore_runtime';
  SELECT * INTO migrator_role FROM pg_roles WHERE rolname = 'opscore_migrator';
  SELECT * INTO worker_role FROM pg_roles WHERE rolname = 'opscore_worker';
  SELECT * INTO owner_role FROM pg_roles WHERE rolname = 'neondb_owner';
  SELECT * INTO auth_definer_role FROM pg_roles WHERE rolname = 'opscore_auth_definer';

  IF runtime_role.rolname IS NULL OR NOT runtime_role.rolcanlogin OR runtime_role.rolsuper
     OR runtime_role.rolbypassrls OR runtime_role.rolcreaterole
     OR runtime_role.rolcreatedb OR runtime_role.rolinherit THEN
    RAISE EXCEPTION 'OPSCORE_RUNTIME_ROLE_CONTRACT_FAILED';
  END IF;
  IF migrator_role.rolname IS NULL OR NOT migrator_role.rolcanlogin OR migrator_role.rolsuper
     OR NOT migrator_role.rolbypassrls OR migrator_role.rolcreaterole
     OR migrator_role.rolcreatedb OR migrator_role.rolinherit THEN
    RAISE EXCEPTION 'OPSCORE_MIGRATOR_ROLE_CONTRACT_FAILED';
  END IF;
  IF worker_role.rolname IS NULL OR NOT worker_role.rolcanlogin OR worker_role.rolsuper
     OR worker_role.rolbypassrls OR worker_role.rolcreaterole
     OR worker_role.rolcreatedb OR worker_role.rolinherit THEN
    RAISE EXCEPTION 'OPSCORE_WORKER_ROLE_CONTRACT_FAILED';
  END IF;
  IF owner_role.rolname IS NULL OR owner_role.rolcanlogin OR owner_role.rolsuper
     OR NOT owner_role.rolbypassrls OR owner_role.rolcreaterole
     OR owner_role.rolcreatedb OR owner_role.rolinherit
     OR NOT pg_has_role('opscore_migrator', 'neondb_owner', 'SET')
     OR NOT pg_has_role('opscore_migrator', 'neondb_owner', 'USAGE') THEN
    RAISE EXCEPTION 'OPSCORE_MIGRATION_OWNER_ROLE_CONTRACT_FAILED';
  END IF;
  IF auth_definer_role.rolname IS NULL OR auth_definer_role.rolcanlogin OR auth_definer_role.rolsuper
     OR NOT auth_definer_role.rolbypassrls OR auth_definer_role.rolcreaterole
     OR auth_definer_role.rolcreatedb OR auth_definer_role.rolinherit
     OR NOT pg_has_role('neondb_owner', 'opscore_auth_definer', 'SET')
     OR pg_has_role('neondb_owner', 'opscore_auth_definer', 'USAGE')
     OR NOT has_schema_privilege('neondb_owner', 'opscore_security', 'CREATE') THEN
    RAISE EXCEPTION 'OPSCORE_AUTH_DEFINER_ROLE_CONTRACT_FAILED';
  END IF;
END
$verify$;

-- The no-login migration owner owns this database; the login role can only SET ROLE to it.
SELECT format('ALTER DATABASE %I OWNER TO neondb_owner', current_database()) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO opscore_runtime, opscore_worker, opscore_migrator, neondb_owner', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO opscore_migrator, neondb_owner', current_database()) \gexec
GRANT USAGE, CREATE ON SCHEMA public TO opscore_migrator, neondb_owner;
SQL
