-- 062: Enforce least-privilege DML for operational autopilot persistence.
-- Migration 059 grants general DML to the runtime role on all public tables.
-- Narrow the three tables introduced by 061 to the operations actually used
-- by operational-autopilot.js: incident/decision history is append-only;
-- proposals may be updated through their approval/execution lifecycle.

DO $preflight$
DECLARE
  target_name text;
  runtime_role oid;
  policy_total integer;
  tenant_rls boolean;
BEGIN
  SELECT oid INTO runtime_role
  FROM pg_roles
  WHERE rolname = 'opscore_runtime'
    AND rolcanlogin
    AND NOT rolsuper
    AND NOT rolbypassrls
    AND NOT rolcreaterole
    AND NOT rolcreatedb;

  IF runtime_role IS NULL THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED';
  END IF;

  FOREACH target_name IN ARRAY ARRAY[
    'incident_replays',
    'decision_memory',
    'autopilot_proposals'
  ] LOOP
    IF to_regclass(format('public.%I', target_name)) IS NULL THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_PRIVILEGE_TABLE_MISSING:%', target_name;
    END IF;

    SELECT c.relrowsecurity AND c.relforcerowsecurity
      INTO tenant_rls
    FROM pg_class c
    WHERE c.oid = to_regclass(format('public.%I', target_name));

    SELECT count(*)::integer
      INTO policy_total
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = target_name
      AND p.policyname IN ('opscore_tenant_permissive', 'opscore_tenant_boundary_guard');

    IF tenant_rls IS DISTINCT FROM true OR policy_total <> 2 THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_TENANT_RLS_CONTRACT_FAILED:%', target_name;
    END IF;
  END LOOP;
END
$preflight$;

-- incident_replays and decision_memory are INSERT/SELECT-only.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.incident_replays, public.decision_memory
  FROM opscore_runtime;
GRANT SELECT, INSERT
  ON TABLE public.incident_replays, public.decision_memory
  TO opscore_runtime;

-- Proposal state changes are required; destructive deletion is not.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.autopilot_proposals
  FROM opscore_runtime;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.autopilot_proposals
  TO opscore_runtime;

DO $verify$
BEGIN
  IF NOT has_table_privilege('opscore_runtime', 'public.incident_replays', 'SELECT')
     OR NOT has_table_privilege('opscore_runtime', 'public.incident_replays', 'INSERT')
     OR has_table_privilege('opscore_runtime', 'public.incident_replays', 'UPDATE')
     OR has_table_privilege('opscore_runtime', 'public.incident_replays', 'DELETE')
     OR has_table_privilege('opscore_runtime', 'public.incident_replays', 'TRUNCATE')
     OR has_table_privilege('opscore_runtime', 'public.incident_replays', 'REFERENCES')
     OR has_table_privilege('opscore_runtime', 'public.incident_replays', 'TRIGGER') THEN
    RAISE EXCEPTION 'OPSC_INCIDENT_REPLAYS_RUNTIME_PRIVILEGE_CONTRACT_FAILED';
  END IF;

  IF NOT has_table_privilege('opscore_runtime', 'public.decision_memory', 'SELECT')
     OR NOT has_table_privilege('opscore_runtime', 'public.decision_memory', 'INSERT')
     OR has_table_privilege('opscore_runtime', 'public.decision_memory', 'UPDATE')
     OR has_table_privilege('opscore_runtime', 'public.decision_memory', 'DELETE')
     OR has_table_privilege('opscore_runtime', 'public.decision_memory', 'TRUNCATE')
     OR has_table_privilege('opscore_runtime', 'public.decision_memory', 'REFERENCES')
     OR has_table_privilege('opscore_runtime', 'public.decision_memory', 'TRIGGER') THEN
    RAISE EXCEPTION 'OPSC_DECISION_MEMORY_RUNTIME_PRIVILEGE_CONTRACT_FAILED';
  END IF;

  IF NOT has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'SELECT')
     OR NOT has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'INSERT')
     OR NOT has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'UPDATE')
     OR has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'DELETE')
     OR has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'TRUNCATE')
     OR has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'REFERENCES')
     OR has_table_privilege('opscore_runtime', 'public.autopilot_proposals', 'TRIGGER') THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_PROPOSALS_RUNTIME_PRIVILEGE_CONTRACT_FAILED';
  END IF;
END
$verify$;
