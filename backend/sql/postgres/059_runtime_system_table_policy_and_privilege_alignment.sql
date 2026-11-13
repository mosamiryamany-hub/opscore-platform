-- 059_runtime_system_table_policy_and_privilege_alignment.sql
-- The production application connects as opscore_runtime, not opscore_app.
-- Align grants and RLS policies with that exact non-bypass runtime identity.
-- System tables are intentionally unscoped; only the runtime role receives
-- their required operations, with narrower grants for append-only worker logs.

BEGIN;

GRANT USAGE ON SCHEMA public TO opscore_runtime;

-- Runtime DML is explicit and source-controlled. RLS remains the tenant boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opscore_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opscore_runtime;

-- Future application tables created by the migration owner retain the same
-- baseline permissions. New non-tenant tables must still add their own policy.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO opscore_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO opscore_runtime;

-- The migration ledger stays owner-only; the runtime uses the narrow
-- SECURITY DEFINER attestation function established by migration 057.
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM opscore_runtime;
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM PUBLIC;

-- PostGIS reference data and metadata are read-only for the runtime.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.spatial_ref_sys FROM opscore_runtime;
GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_runtime;
REVOKE ALL PRIVILEGES ON TABLE public.geometry_columns, public.geography_columns
  FROM opscore_runtime;
GRANT SELECT ON TABLE public.geometry_columns, public.geography_columns
  TO opscore_runtime;

-- Control-plane permissions remain narrowly scoped.
REVOKE ALL PRIVILEGES ON TABLE public.feature_flags, public.safe_mode_states, public.control_plane_runs
  FROM opscore_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags, public.safe_mode_states
  TO opscore_runtime;
GRANT INSERT ON TABLE public.control_plane_runs TO opscore_runtime;

-- Login and shared firewall rate limits are required by production HTTP paths.
REVOKE ALL PRIVILEGES ON TABLE public.login_throttle, public.firewall_rate_buckets
  FROM opscore_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_throttle, public.firewall_rate_buckets
  TO opscore_runtime;

-- Worker system events are append-only from the application runtime.
REVOKE ALL PRIVILEGES ON TABLE public.worker_guard_system_events FROM opscore_runtime;
GRANT INSERT ON TABLE public.worker_guard_system_events TO opscore_runtime;

-- Replace the legacy opscore_app-only RLS guards with the actual runtime role.
ALTER POLICY opscore_system_table_guard ON public.login_throttle TO opscore_runtime;
ALTER POLICY opscore_system_table_guard ON public.firewall_rate_buckets TO opscore_runtime;
ALTER POLICY opscore_system_table_guard ON public.worker_guard_system_events TO opscore_runtime;

COMMIT;
