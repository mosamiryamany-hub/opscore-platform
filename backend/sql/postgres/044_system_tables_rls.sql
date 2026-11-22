-- System-wide operational tables (no organization_id): enable FORCE RLS.
-- The legacy opscore_app role is optional (migration 068 explicitly treats
-- absence as the strongest lockdown). On a fresh chain, use opscore_runtime
-- as the policy target when the legacy role is absent; 059 later normalizes
-- these policies to the runtime role as well.
DO $migration$
DECLARE
  policy_role text;
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_app') THEN
    policy_role := 'opscore_app';
  ELSE
    policy_role := 'opscore_runtime';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'firewall_rate_buckets',
    'login_throttle',
    'worker_guard_system_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('DROP POLICY IF EXISTS opscore_system_table_guard ON public.%I',table_name);
    EXECUTE format(
      'CREATE POLICY opscore_system_table_guard ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
      table_name, policy_role
    );
  END LOOP;

  IF policy_role='opscore_app' AND to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app';
    EXECUTE 'GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app';
  END IF;
END
$migration$;
