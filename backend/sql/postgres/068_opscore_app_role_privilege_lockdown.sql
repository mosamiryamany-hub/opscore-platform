-- 068_opscore_app_role_privilege_lockdown.sql
-- Disable the legacy elevated application probe role in place.
--
-- If the role is already absent (stronger than lockdown), treat that as success
-- and do not recreate it. Recreation on Neon can reintroduce managed memberships
-- that the migration owner cannot revoke.
--
-- The sole allowed residual when the role exists is opscore_app -> neon_superuser.
-- Login and inheritance must remain disabled so that residual is inert.

BEGIN;

DO $lockdown$
DECLARE
  app_role_oid oid;
  active_sessions bigint;
  owned_objects bigint;
  app_is_superuser boolean;
  app_can_login boolean;
  app_bypass_rls boolean;
  app_createdb boolean;
  app_createrole boolean;
  app_inherit boolean;
  current_user_admin_option boolean;
  current_user_is_superuser boolean;
BEGIN
  SELECT oid, rolsuper, rolcanlogin, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
    INTO app_role_oid, app_is_superuser, app_can_login, app_bypass_rls,
         app_createdb, app_createrole, app_inherit
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_app';

  IF app_role_oid IS NULL THEN
    RAISE NOTICE 'OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED';
    RETURN;
  END IF;

  IF app_is_superuser THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_SUPERUSER_CANNOT_BE_LOCKED_DOWN';
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
    AND refobjid = app_role_oid AND deptype = 'o';
  IF owned_objects <> 0 THEN
    RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_OWNS_OBJECTS';
  END IF;

  IF app_can_login OR app_bypass_rls OR app_createdb OR app_createrole OR app_inherit THEN
    SELECT rolsuper INTO current_user_is_superuser
    FROM pg_catalog.pg_roles WHERE rolname = current_user;

    SELECT COALESCE(bool_or(membership.admin_option), false)
      INTO current_user_admin_option
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.roleid = app_role_oid
      AND membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user);

    IF NOT COALESCE(current_user_is_superuser, false)
       AND NOT COALESCE(current_user_admin_option, false) THEN
      RAISE EXCEPTION 'OPSC_LEGACY_APP_ROLE_ADMIN_OPTION_REQUIRED';
    END IF;

    ALTER ROLE opscore_app
      WITH NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$lockdown$;

DO $database_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'opscore_app') THEN
    EXECUTE pg_catalog.format(
      'REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE %I FROM opscore_app',
      pg_catalog.current_database()
    );
  END IF;
END
$database_acl$;

DO $schema_table_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'opscore_app') THEN
    REVOKE ALL PRIVILEGES ON SCHEMA public FROM opscore_app;
    GRANT USAGE ON SCHEMA public TO opscore_app;
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM opscore_app;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM opscore_app;
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.feature_flags, public.safe_mode_states
      TO opscore_app;
    GRANT INSERT ON TABLE public.control_plane_runs TO opscore_app;
  END IF;
END
$schema_table_acl$;

DO $verify$
DECLARE
  app_role_oid oid;
  outgoing_memberships bigint;
  unexpected_memberships text[];
BEGIN
  SELECT oid INTO app_role_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_app';

  IF app_role_oid IS NULL THEN
    RAISE NOTICE 'OPSC_LEGACY_APP_ROLE_ABSENT_POSTCONDITION_OK';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE oid = app_role_oid
      AND NOT rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
      AND NOT rolcreaterole
      AND NOT rolcreatedb
      AND NOT rolinherit
  ) THEN
    RAISE EXCEPTION 'OPSC_LOCKED_APP_ROLE_ATTRIBUTE_POSTCONDITION_FAILED';
  END IF;

  SELECT count(*) INTO outgoing_memberships
  FROM pg_catalog.pg_auth_members
  WHERE member = app_role_oid;

  SELECT COALESCE(
    array_agg(granted.rolname ORDER BY granted.rolname),
    ARRAY[]::text[]
  )
    INTO unexpected_memberships
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
  WHERE membership.member = app_role_oid
    AND granted.rolname <> 'neon_superuser';

  IF cardinality(unexpected_memberships) <> 0
     OR outgoing_memberships > 1 THEN
    RAISE EXCEPTION 'OPSC_LOCKED_APP_ROLE_MEMBERSHIP_POSTCONDITION_FAILED';
  END IF;

  IF pg_catalog.has_database_privilege('opscore_app', pg_catalog.current_database(), 'CREATE')
     OR pg_catalog.has_schema_privilege('opscore_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'OPSC_LOCKED_APP_ROLE_DATABASE_OR_SCHEMA_PRIVILEGE_REMAINS';
  END IF;
END
$verify$;

COMMIT;
