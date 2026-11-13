-- 061: PostgreSQL persistence parity for governed Operational Autopilot.
-- The SQLite module creates these tables lazily. PostgreSQL deliberately does not,
-- so their production schema must be represented by a versioned migration.
-- The decision-memory FK binds both decision_id and organization_id to prevent
-- a row in one tenant from referencing another tenant's decision.

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_replays_id_org_uq
  ON public.decision_replays (id, organization_id);

CREATE TABLE IF NOT EXISTS public.incident_replays (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_ref TEXT NOT NULL,
  from_at TEXT NOT NULL,
  to_at TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  timeline_sha256 TEXT NOT NULL
    CHECK (timeline_sha256 ~ '^[0-9a-f]{64}$'),
  created_by TEXT NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_replays_org_created
  ON public.incident_replays (organization_id, created_at);

CREATE TABLE IF NOT EXISTS public.decision_memory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,
  learning_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  created_by TEXT NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CONSTRAINT decision_memory_tenant_decision_fkey
    FOREIGN KEY (decision_id, organization_id)
    REFERENCES public.decision_replays (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT decision_memory_tenant_decision_learning_uq
    UNIQUE (organization_id, decision_id, learning_key)
);

CREATE INDEX IF NOT EXISTS idx_decision_memory_org_key
  ON public.decision_memory (organization_id, learning_key, created_at);

CREATE TABLE IF NOT EXISTS public.autopilot_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_ref TEXT,
  action_type TEXT NOT NULL,
  target_json TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  risk TEXT NOT NULL
    CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  approval_required INTEGER NOT NULL DEFAULT 1
    CHECK (approval_required IN (0, 1)),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired')),
  proposal_json TEXT NOT NULL,
  proposal_sha256 TEXT NOT NULL
    CHECK (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  created_by TEXT NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by TEXT
    REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TEXT,
  executed_by TEXT
    REFERENCES public.users(id) ON DELETE SET NULL,
  executed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autopilot_org_status
  ON public.autopilot_proposals (organization_id, status, created_at);

-- Apply the same tenant boundary to every new operational table.
DO $migration$
DECLARE
  table_name TEXT;
  tenant_predicate CONSTANT TEXT :=
    'organization_id = opscore_current_tenant() OR ' ||
    '(organization_id IS NULL AND opscore_access_mode() = ANY ' ||
    '(ARRAY[''system''::text, ''backoffice''::text]))';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'incident_replays',
    'decision_memory',
    'autopilot_proposals'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_permissive ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY opscore_tenant_permissive ON public.%I AS PERMISSIVE FOR ALL USING (%s) WITH CHECK (%s)',
      table_name, tenant_predicate, tenant_predicate
    );
    EXECUTE format(
      'CREATE POLICY opscore_tenant_boundary_guard ON public.%I AS RESTRICTIVE FOR ALL USING (%s) WITH CHECK (%s)',
      table_name, tenant_predicate, tenant_predicate
    );
  END LOOP;
END
$migration$;

-- Do not inherit the legacy app role's access. The actual production runtime
-- is opscore_runtime. Grant only the operations used by the module.
REVOKE ALL PRIVILEGES ON TABLE
  public.incident_replays,
  public.decision_memory,
  public.autopilot_proposals
FROM PUBLIC, opscore_app;

GRANT SELECT, INSERT ON TABLE public.incident_replays, public.decision_memory
  TO opscore_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.autopilot_proposals
  TO opscore_runtime;
