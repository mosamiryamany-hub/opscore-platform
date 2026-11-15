-- 068_opscore_app_role_privilege_lockdown.sql
-- Replace the legacy login role with a new, clean NOLOGIN/NOBYPASSRLS test role.
--
-- Neon does not grant the migration owner ADMIN OPTION on its managed
-- neon_superuser role. Therefore this migration cannot revoke a legacy
-- opscore_app -> neon_superuser membership. The old role is quarantined under
-- a new name, disabled, stripped of public-object grants, and required to have
-- no incoming memberships. The new opscore_app role is created from scratch
-- with no elevated attributes or role memberships.
--
-- Full removal of the quarantined role still requires a Neon administrator
-- with ADMIN OPTION on neon_superuser; do not report that residual as closed.

BEGIN;

DO $quarantine$
DECLARE
  app_role_oid oid;
  quarantine_role_oid oid;
  active_sessions bigint;
  owned_objects bigint;
  incoming_memberships bigint;
  unexpected_memberships text[];
  app_is_superuser boolean;
BEGIN
  SELECT oid, rolsuper
    INTO app_role_oid, app_is_superuser
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_app';

  IF app_role_oid IS NOT NULL THEN
    IF app_is_superuser THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_SUPERUSER_CANNOT_BE_QUARANTINED';
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname = 'opscore_app_quarantined_20261115'
    ) THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_QUARANTINE_NAME_ALREADY_EXISTS';
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

    -- No existing role may be able to SET ROLE into the elevated legacy role.
    SELECT count(*) INTO incoming_memberships
    FROM pg_catalog.pg_auth_members
    WHERE roleid = app_role_oid;

    IF incoming_memberships <> 0 THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_HAS_INCOMING_MEMBERSHIPS';
    END IF;

    SELECT COALESCE(
      array_agg(elevated.rolname ORDER BY elevated.rolname),
      ARRAY[]::text[]
    )
      INTO unexpected_memberships
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles elevated ON elevated.oid = membership.roleid
    WHERE membership.member = app_role_oid
      AND elevated.rolname <> 'neon_superuser';

    IF cardinality(unexpected_memberships) <> 0 THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_HAS_UNEXPECTED_ROLE_MEMBERSHIP';
    END IF;

    EXECUTE 'ALTER ROLE opscore_app RENAME TO opscore_app_quarantined_20261115';
    EXECUTE 'ALTER ROLE opscore_app_quarantined_20261115 WITH NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT';

    SELECT oid INTO quarantine_role_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_app_quarantined_20261115';

    IF quarantine_role_oid IS NULL THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_QUARANTINE_RENAME_FAILED';
    END IF;

    -- Remove the old role's ordinary database/schema/table access. The
    -- managed neon_superuser membership itself is intentionally retained
    -- only as an explicitly reported administrative residual.
    EXECUTE pg_catalog.format(
      'REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE %I FROM %I',
      pg_catalog.current_database(),
      'opscore_app_quarantined_20261115'
    );
    REVOKE ALL PRIVILEGES ON SCHEMA public FROM opscore_app_quarantined_20261115;
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM opscore_app_quarantined_20261115;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM opscore_app_quarantined_20261115;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members
      WHERE roleid = quarantine_role_oid
    ) THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_QUARANTINE_HAS_INCOMING_MEMBERSHIPS';
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE oid = quarantine_role_oid
        AND (rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole)
    ) THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_QUARANTINE_ATTRIBUTES_INVALID';
    END IF;
  END IF;

  -- A fresh identity is used for the rollback-only RLS gate. Never reuse the
  -- legacy role OID or its elevated role memberships.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'opscore_app'
  ) THEN
    EXECUTE 'CREATE ROLE opscore_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS';
  END IF;
END
$quarantine$;

DO $new_role_acl$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE %I FROM opscore_app',
    pg_catalog.current_database()
  );
END
$new_role_acl$;
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
DECLARE
  app_role_oid oid;
  incoming_memberships bigint;
  active_quarantine_sessions bigint;
BEGIN
  SELECT oid INTO app_role_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_app';

  IF app_role_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE oid = app_role_oid
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
      AND NOT rolcreaterole
      AND NOT rolcreatedb
      AND NOT rolinherit
  ) THEN
    RAISE EXCEPTION 'OPSC_NEW_APP_ROLE_ATTRIBUTE_POSTCONDITION_FAILED';
  END IF;

  SELECT count(*) INTO incoming_memberships
  FROM pg_catalog.pg_auth_members
  WHERE roleid = app_role_oid;

  IF incoming_memberships <> 0 THEN
    RAISE EXCEPTION 'OPSC_NEW_APP_ROLE_HAS_INCOMING_MEMBERSHIPS';
  END IF;

  IF pg_catalog.has_database_privilege('opscore_app', pg_catalog.current_database(), 'CREATE')
     OR pg_catalog.has_schema_privilege('opscore_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'OPSC_NEW_APP_ROLE_DATABASE_OR_SCHEMA_PRIVILEGE_REMAINS';
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
    RAISE EXCEPTION 'OPSC_NEW_APP_ROLE_CONTROL_PLANE_GRANT_POSTCONDITION_FAILED';
  END IF;

  IF to_regrole('opscore_app_quarantined_20261115') IS NOT NULL THEN
    SELECT count(*) INTO active_quarantine_sessions
    FROM pg_catalog.pg_stat_activity
    WHERE usename = 'opscore_app_quarantined_20261115';

    IF active_quarantine_sessions <> 0
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_auth_members membership
         WHERE membership.roleid = 'opscore_app_quarantined_20261115'::pg_catalog.regrole
       )
       OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_roles
         WHERE rolname = 'opscore_app_quarantined_20261115'
           AND (rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole)
       ) THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_QUARANTINE_POSTCONDITION_FAILED';
    END IF;
  END IF;
END
$verify$;

COMMIT;
