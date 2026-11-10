-- Portable runtime privileges for opscore_app on application tables.
-- RLS remains the isolation boundary; without GRANT the role cannot bootstrap
-- or serve HTTP on a clean install (SQLSTATE 42501).
-- Do not rely on provider-specific ALTER DEFAULT PRIVILEGES history.
BEGIN;

GRANT USAGE ON SCHEMA public TO opscore_app;

-- Broad DML on existing public tables; RLS policies enforce tenant boundaries.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opscore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opscore_app;

-- Future tables created by the migration owner in this schema.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO opscore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO opscore_app;

-- Migration ledger stays owner-only (reinforces 046).
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM opscore_app;
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM PUBLIC;

-- PostGIS catalog remains read-only for the app role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app;
GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app;

-- Control-plane least privilege (reinforces 047).
REVOKE ALL PRIVILEGES ON TABLE public.feature_flags, public.safe_mode_states, public.control_plane_runs FROM opscore_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags TO opscore_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.safe_mode_states TO opscore_app;
GRANT INSERT ON TABLE public.control_plane_runs TO opscore_app;

COMMIT;
