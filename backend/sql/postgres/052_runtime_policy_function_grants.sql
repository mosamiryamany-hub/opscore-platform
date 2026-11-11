-- 052_runtime_policy_function_grants.sql
-- The production application connects as opscore_runtime (NOBYPASSRLS).
-- Two tenant policies call this SECURITY DEFINER helper; grant only the
-- required function execution privilege to the runtime role, never PUBLIC.
DO $migration$
BEGIN
  IF to_regprocedure('public.opscore_is_privileged()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_RUNTIME_POLICY_FUNCTION_MISSING';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.opscore_is_privileged() TO opscore_runtime';
  END IF;
END
$migration$;
