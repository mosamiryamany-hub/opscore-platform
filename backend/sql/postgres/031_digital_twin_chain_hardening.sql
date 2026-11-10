-- Digital Twin chain persistence parity and database-level integrity constraints.
-- This migration does not claim protection against a database superuser rewriting the entire chain.
CREATE TABLE IF NOT EXISTS operational_twin_chain_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_no BIGINT NOT NULL CHECK (sequence_no > 0),
  event_type TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  previous_hash TEXT NOT NULL CHECK (previous_hash = 'GENESIS' OR previous_hash ~ '^[0-9a-f]{64}$'),
  event_json TEXT NOT NULL,
  event_hash TEXT NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sequence_no),
  UNIQUE (organization_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_twin_chain_org_sequence
  ON operational_twin_chain_events(organization_id, sequence_no);

CREATE OR REPLACE FUNCTION opscore_current_tenant() RETURNS TEXT
LANGUAGE SQL STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;

ALTER TABLE operational_twin_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_twin_chain_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_tenant_isolation ON operational_twin_chain_events;
CREATE POLICY opscore_tenant_isolation ON operational_twin_chain_events
  USING (organization_id = opscore_current_tenant())
  WITH CHECK (organization_id = opscore_current_tenant());
