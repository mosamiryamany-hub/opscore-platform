-- Portable runtime privileges for opscore_app on application tables.
-- RLS remains the isolation boundary; without GRANT the role cannot bootstrap
-- or serve HTTP on a clean install (SQLSTATE 42501).
-- Do not rely on provider-specific ALTER DEFAULT PRIVILEGES history.
BEGIN;

-- Migration ledger stays owner-only for everyone except its owner policy.
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM PUBLIC;

DO $legacy_app_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opscore_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opscore_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO opscore_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO opscore_app';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM opscore_app';
    IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app';
      EXECUTE 'GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app';
    END IF;
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.feature_flags, public.safe_mode_states, public.control_plane_runs FROM opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags TO opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.safe_mode_states TO opscore_app';
    EXECUTE 'GRANT INSERT ON TABLE public.control_plane_runs TO opscore_app';
  END IF;
END
$legacy_app_acl$;

COMMIT;
