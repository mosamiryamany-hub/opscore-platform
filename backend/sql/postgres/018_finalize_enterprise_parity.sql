-- OpsCore v0.11.54: finalize PostgreSQL parity for enterprise additions.
-- Ensure tenant GUC helper exists before RLS policies reference it.
CREATE OR REPLACE FUNCTION opscore_current_tenant()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;

CREATE TABLE IF NOT EXISTS gateway_circuit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gateway_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('closed','open','half-open')),
  failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gateway_circuit_events_org_gateway
  ON gateway_circuit_events(organization_id,gateway_name,created_at DESC);

CREATE TABLE IF NOT EXISTS signature_chain_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK(level>0),
  signer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signer_role TEXT NOT NULL DEFAULT 'member',
  payload_sha256 TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  chain_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,document_type,document_id,level)
);
ALTER TABLE signature_chain_events
  ADD COLUMN IF NOT EXISTS signer_role TEXT NOT NULL DEFAULT 'member';
CREATE INDEX IF NOT EXISTS idx_signature_chain_doc
  ON signature_chain_events(organization_id,document_type,document_id,level);

CREATE TABLE IF NOT EXISTS billing_provider_registry (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,provider_name)
);

CREATE TABLE IF NOT EXISTS privacy_purge_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  summary_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gateway_circuit_events',
    'signature_chain_events',
    'billing_provider_registry',
    'privacy_purge_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY opscore_tenant_isolation ON %I USING (organization_id = opscore_current_tenant()) WITH CHECK (organization_id = opscore_current_tenant())', t);
  END LOOP;
END $$;
