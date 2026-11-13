-- 059: PostgreSQL persistence for governed Operational Autopilot.
-- The SQLite adapter used lazy DDL while the PostgreSQL adapter skips it.
-- Provision this schema through migrations; never through runtime application DDL.

DO $migration$
DECLARE runtime_oid oid;
BEGIN
  IF current_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_MIGRATION_OWNER_REQUIRED';
  END IF;
  SELECT oid INTO runtime_oid
  FROM pg_roles
  WHERE rolname='opscore_runtime' AND rolcanlogin
    AND NOT rolsuper AND NOT rolbypassrls
    AND NOT rolcreaterole AND NOT rolcreatedb;
  IF runtime_oid IS NULL THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED';
  END IF;
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.decision_replays') IS NULL THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_PARENT_TABLES_REQUIRED';
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.incident_replays (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_ref TEXT NOT NULL,
  from_at TEXT NOT NULL,
  to_at TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  timeline_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_replays_org_created
  ON public.incident_replays(organization_id,created_at);

-- Composite keys prevent cross-tenant references even when RLS policies are bypassed
-- by PostgreSQL referential-integrity checks.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.decision_replays'::regclass
      AND conname='decision_replays_id_organization_unique'
  ) THEN
    ALTER TABLE public.decision_replays
      ADD CONSTRAINT decision_replays_id_organization_unique UNIQUE (id,organization_id);
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.decision_memory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,
  learning_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0,1)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CONSTRAINT decision_memory_org_decision_learning_key
    UNIQUE (organization_id,decision_id,learning_key),
  CONSTRAINT decision_memory_decision_tenant_fk
    FOREIGN KEY (decision_id,organization_id)
    REFERENCES public.decision_replays(id,organization_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_decision_memory_org_key
  ON public.decision_memory(organization_id,learning_key,created_at);

CREATE TABLE IF NOT EXISTS public.autopilot_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_ref TEXT,
  action_type TEXT NOT NULL,
  target_json TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','executed','expired')),
  proposal_json TEXT NOT NULL,
  proposal_sha256 TEXT NOT NULL CHECK (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  created_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by TEXT,
  approved_at TEXT,
  executed_by TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT autopilot_proposals_id_organization_unique UNIQUE (id,organization_id)
);
CREATE INDEX IF NOT EXISTS idx_autopilot_org_status
  ON public.autopilot_proposals(organization_id,status,created_at);

DO $migration$
DECLARE target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['incident_replays','decision_memory','autopilot_proposals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',target_table);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_permissive ON public.%I',target_table);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON public.%I',target_table);
    EXECUTE format(
      'CREATE POLICY opscore_tenant_permissive ON public.%I AS PERMISSIVE FOR ALL
       USING (organization_id = NULLIF(current_setting(''app.tenant_id'',true), ''''))
       WITH CHECK (organization_id = NULLIF(current_setting(''app.tenant_id'',true), ''''))',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY opscore_tenant_boundary_guard ON public.%I AS RESTRICTIVE FOR ALL
       USING (organization_id = NULLIF(current_setting(''app.tenant_id'',true), ''''))
       WITH CHECK (organization_id = NULLIF(current_setting(''app.tenant_id'',true), ''''))',
      target_table
    );
  END LOOP;
END
$migration$;

-- Default privileges from historical migrations granted CRUD to opscore_app.
-- Explicitly remove that legacy path and grant only the live NOBYPASSRLS runtime.
REVOKE ALL PRIVILEGES ON TABLE
  public.incident_replays,public.decision_memory,public.autopilot_proposals
FROM PUBLIC,opscore_app;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='opscore_app_least') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.incident_replays,public.decision_memory,public.autopilot_proposals FROM opscore_app_least';
  END IF;
END
$migration$;

GRANT USAGE ON SCHEMA public TO opscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  public.incident_replays,public.decision_memory,public.autopilot_proposals
TO opscore_runtime;

-- Preserve the canonical ai_agent_runs -> autopilot_proposals relationship.
-- Abort without writing if historical proposal references cannot be reconciled.
DO $migration$
DECLARE orphan_count BIGINT;
BEGIN
  IF to_regclass('public.ai_agent_runs') IS NOT NULL THEN
    SELECT count(*) INTO orphan_count
    FROM public.ai_agent_runs runs
    LEFT JOIN public.autopilot_proposals proposals
      ON proposals.id=runs.proposal_id
     AND proposals.organization_id=runs.organization_id
    WHERE runs.proposal_id IS NOT NULL AND proposals.id IS NULL;
    IF orphan_count>0 THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_EXISTING_PROPOSAL_REFERENCES_UNRESOLVED:%',orphan_count;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid='public.ai_agent_runs'::regclass
        AND conname='ai_agent_runs_proposal_tenant_fkey'
    ) THEN
      ALTER TABLE public.ai_agent_runs
        ADD CONSTRAINT ai_agent_runs_proposal_tenant_fkey
        FOREIGN KEY (proposal_id,organization_id)
        REFERENCES public.autopilot_proposals(id,organization_id)
        ON DELETE SET NULL (proposal_id);
    END IF;
  END IF;
END
$migration$;

DO $verify$
DECLARE target_table TEXT;
DECLARE runtime_role RECORD;
BEGIN
  SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb
  INTO runtime_role FROM pg_roles WHERE rolname='opscore_runtime';
  IF runtime_role.rolcanlogin IS DISTINCT FROM TRUE
     OR runtime_role.rolsuper IS DISTINCT FROM FALSE
     OR runtime_role.rolbypassrls IS DISTINCT FROM FALSE
     OR runtime_role.rolcreaterole IS DISTINCT FROM FALSE
     OR runtime_role.rolcreatedb IS DISTINCT FROM FALSE
     OR has_database_privilege('opscore_runtime',current_database(),'CREATE')
     OR has_schema_privilege('opscore_runtime','public','CREATE') THEN
    RAISE EXCEPTION 'OPSC_AUTOPILOT_RUNTIME_PRIVILEGE_POSTCONDITION_FAILED';
  END IF;
  FOREACH target_table IN ARRAY ARRAY['incident_replays','decision_memory','autopilot_proposals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid=format('public.%I',target_table)::regclass
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_RLS_POSTCONDITION_FAILED:%',target_table;
    END IF;
    IF NOT has_table_privilege('opscore_runtime',format('public.%I',target_table),'SELECT')
       OR NOT has_table_privilege('opscore_runtime',format('public.%I',target_table),'INSERT')
       OR NOT has_table_privilege('opscore_runtime',format('public.%I',target_table),'UPDATE')
       OR NOT has_table_privilege('opscore_runtime',format('public.%I',target_table),'DELETE') THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_RUNTIME_DML_GRANT_MISSING:%',target_table;
    END IF;
    IF has_table_privilege('opscore_app',format('public.%I',target_table),'SELECT')
       OR has_table_privilege('opscore_app',format('public.%I',target_table),'INSERT')
       OR has_table_privilege('opscore_app',format('public.%I',target_table),'UPDATE')
       OR has_table_privilege('opscore_app',format('public.%I',target_table),'DELETE') THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_LEGACY_APP_GRANT_PRESENT:%',target_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
        AND p.tablename=target_table AND p.policyname='opscore_tenant_permissive'
        AND p.permissive='PERMISSIVE'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
        AND p.tablename=target_table AND p.policyname='opscore_tenant_boundary_guard'
        AND p.permissive='RESTRICTIVE'
    ) THEN
      RAISE EXCEPTION 'OPSC_AUTOPILOT_TENANT_POLICY_POSTCONDITION_FAILED:%',target_table;
    END IF;
  END LOOP;
END
$verify$;
