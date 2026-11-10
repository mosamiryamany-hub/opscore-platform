-- Grant least-privilege DML on system operational tables to opscore_app.
-- RLS policies from 044 already constrain access; without GRANT the role cannot
-- cleanup synthetic acceptance rows (SQLSTATE 42501).
BEGIN;
DO $migration$
BEGIN
  IF to_regclass('public.login_throttle') IS NULL
     OR to_regclass('public.firewall_rate_buckets') IS NULL
     OR to_regclass('public.worker_guard_system_events') IS NULL THEN
    RAISE EXCEPTION 'SYSTEM_TABLES_REQUIRED_BEFORE_048';
  END IF;
END
$migration$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_throttle TO opscore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.firewall_rate_buckets TO opscore_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.worker_guard_system_events TO opscore_app;

-- Keep PostGIS catalog read-only for the app role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app;
GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app;
COMMIT;
