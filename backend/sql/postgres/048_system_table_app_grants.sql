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

DO $legacy_app_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_throttle TO opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.firewall_rate_buckets TO opscore_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.worker_guard_system_events TO opscore_app';
    IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app';
      EXECUTE 'GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app';
    END IF;
  END IF;
END
$legacy_app_acl$;
COMMIT;
