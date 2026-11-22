-- 047_control_plane_runtime_privileges.sql
-- Make control-plane table permissions explicit and portable across PostgreSQL providers.
-- Do not depend on provider-specific ALTER DEFAULT PRIVILEGES state.
BEGIN;
DO $migration$
BEGIN
  IF to_regclass('public.feature_flags') IS NULL
     OR to_regclass('public.safe_mode_states') IS NULL
     OR to_regclass('public.control_plane_runs') IS NULL THEN
    RAISE EXCEPTION 'CONTROL_PLANE_TABLES_REQUIRED_BEFORE_047';
  END IF;
END
$migration$;

REVOKE ALL PRIVILEGES ON TABLE public.feature_flags, public.safe_mode_states, public.control_plane_runs FROM PUBLIC;

DO $legacy_app_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_app') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.feature_flags, public.safe_mode_states, public.control_plane_runs FROM opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags TO opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.safe_mode_states TO opscore_app';
    EXECUTE 'GRANT INSERT ON TABLE public.control_plane_runs TO opscore_app';
  END IF;
END
$legacy_app_acl$;
COMMIT;
