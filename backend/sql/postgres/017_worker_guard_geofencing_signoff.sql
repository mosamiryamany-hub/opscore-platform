-- OpsCore v0.11.54: worker resource guard, general geofencing, hierarchical sign-off role evidence.
CREATE TABLE IF NOT EXISTS geofences (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, geometry_json TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,name));
CREATE INDEX IF NOT EXISTS idx_geofences_org_enabled ON geofences(organization_id,enabled);
CREATE TABLE IF NOT EXISTS worker_guard_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_worker_guard_events_org_created ON worker_guard_events(organization_id,created_at);
CREATE TABLE IF NOT EXISTS worker_guard_system_events (id TEXT PRIMARY KEY, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_worker_guard_system_events_created ON worker_guard_system_events(created_at);
ALTER TABLE signature_chain_events ADD COLUMN IF NOT EXISTS signer_role TEXT NOT NULL DEFAULT 'member';
