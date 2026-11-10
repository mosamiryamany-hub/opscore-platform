-- OpsCore v0.11.54 hardening: durable technician geofence assignments and signature-chain seals.
BEGIN;
CREATE TABLE IF NOT EXISTS technician_geofences (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  geofence_id TEXT NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,geofence_id,technician_id)
);
CREATE INDEX IF NOT EXISTS idx_technician_geofences_org_tech ON technician_geofences(organization_id,technician_id);
CREATE TABLE IF NOT EXISTS signature_chain_seals (
  id text PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_id text NOT NULL,
  final_chain_hash text NOT NULL,
  sealed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,document_type,document_id)
);
CREATE INDEX IF NOT EXISTS idx_signature_chain_seals_org_doc ON signature_chain_seals(organization_id,document_type,document_id);
COMMIT;
