-- 068_opscore_app_role_privilege_lockdown.sql
-- Retire the legacy app login as a direct connection identity. The production
-- application uses opscore_runtime; opscore_app is retained only as a restricted
-- NOLOGIN role for owner-controlled, rollback-only RLS verification.
BEGIN;

DO $migration$
DECLARE
  app_role_oid oid;
  active_sessions bigint;
  owned_objects bigint;
  unexpected_elevated_memberships text[];
  role_login boolean;
  role_superuser boolean;
  role_bypass_rls boolean;
  role_create_role boolean;
  role_create_db boolean;
BEGIN
  SELECT oid INTO app_role_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_app';

  IF app_role_oid IS NULL THEN
    EXECUTE 'CREATE ROLE opscore_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
    SELECT oid INTO app_role_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_app';
  END IF;

  SELECT count(*) INTO active_sessions
  FROM pg_catalog.pg_stat_activity
  WHERE usename = 'opscore_app';

  IF active_sessions <> 0 THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_HAS_ACTIVE_SESSIONS';
  END IF;

  SELECT count(*) INTO owned_objects
  FROM pg_catalog.pg_shdepend
  WHERE refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass
    AND refobjid = app_role_oid
    AND deptype = 'o';

  IF owned_objects <> 0 THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_OWNS_OBJECTS';
  END IF;

  SELECT COALESCE(array_agg(elevated.rolname ORDER BY elevated.rolname), ARRAY[]::text[])
    INTO unexpected_elevated_memberships
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles elevated ON elevated.oid = membership.roleid
  WHERE membership.member = app_role_oid
    AND (elevated.rolsuper OR elevated.rolbypassrls
         OR elevated.rolcreaterole OR elevated.rolcreatedb)
    AND elevated.rolname <> 'neon_superuser';

  IF cardinality(unexpected_elevated_memberships) <> 0 THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_HAS_UNEXPECTED_ELEVATED_MEMBERSHIP';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'neon_superuser')
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles elevated ON elevated.oid = membership.roleid
       WHERE membership.member = app_role_oid
         AND elevated.rolname = 'neon_superuser'
     ) THEN
    EXECUTE 'REVOKE neon_superuser FROM opscore_app';
  END IF;

  -- NOSUPERUSER is superuser-only even when the role is already non-superuser.
  -- The preflight refuses a true superuser role; this grantor only changes attributes it owns.
  EXECUTE 'ALTER ROLE opscore_app WITH NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';

  SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    INTO role_login, role_superuser, role_bypass_rls, role_create_role, role_create_db
  FROM pg_catalog.pg_roles
  WHERE oid = app_role_oid;

  IF role_login OR role_superuser OR role_bypass_rls OR role_create_role OR role_create_db
     OR (EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'neon_superuser')
         AND pg_catalog.pg_has_role('opscore_app', 'neon_superuser', 'MEMBER')) THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_LOCKDOWN_FAILED';
  END IF;
END
$migration$;

DO $database_acl$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE %I FROM opscore_app',
    pg_catalog.current_database()
  );
END
$database_acl$;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM opscore_app;
GRANT USAGE ON SCHEMA public TO opscore_app;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM opscore_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM opscore_app;

-- Minimal control-plane contract retained for source-controlled RLS gate checks.
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.feature_flags, public.safe_mode_states
  TO opscore_app;
GRANT INSERT ON TABLE public.control_plane_runs TO opscore_app;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_app'
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
      AND NOT rolcreaterole
      AND NOT rolcreatedb
      AND NOT rolinherit
  ) THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_ATTRIBUTE_POSTCONDITION_FAILED';
  END IF;

  -- CONNECT/TEMPORARY may be granted to PUBLIC by PostgreSQL defaults; those
  -- inherited defaults do not create a login path because opscore_app is NOLOGIN.
  IF pg_catalog.has_database_privilege('opscore_app', pg_catalog.current_database(), 'CREATE')
     OR pg_catalog.has_schema_privilege('opscore_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_DATABASE_OR_SCHEMA_PRIVILEGE_REMAINS';
  END IF;

  IF NOT pg_catalog.has_schema_privilege('opscore_app', 'public', 'USAGE')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.feature_flags', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.feature_flags', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.feature_flags', 'UPDATE')
     OR pg_catalog.has_table_privilege('opscore_app', 'public.feature_flags', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.safe_mode_states', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.safe_mode_states', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.safe_mode_states', 'UPDATE')
     OR pg_catalog.has_table_privilege('opscore_app', 'public.safe_mode_states', 'DELETE')
     OR NOT pg_catalog.has_table_privilege('opscore_app', 'public.control_plane_runs', 'INSERT')
     OR pg_catalog.has_table_privilege('opscore_app', 'public.control_plane_runs', 'SELECT')
     OR pg_catalog.has_table_privilege('opscore_app', 'public.control_plane_runs', 'UPDATE')
     OR pg_catalog.has_table_privilege('opscore_app', 'public.control_plane_runs', 'DELETE') THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_CONTROL_PLANE_GRANT_POSTCONDITION_FAILED';
  END IF;
END
$verify$;

COMMIT;
