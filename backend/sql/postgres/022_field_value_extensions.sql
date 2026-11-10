BEGIN;

CREATE TABLE IF NOT EXISTS dynamic_geofence_events(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  geofence_id TEXT REFERENCES geofences(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('hazard','restriction','clear')),
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m DOUBLE PRECISION NOT NULL CHECK(radius_m > 0 AND radius_m <= 100000),
  reason TEXT NOT NULL,
  source_event_id TEXT,
  active_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  event_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dynamic_geofence_org_active
  ON dynamic_geofence_events(organization_id,active_from,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dynamic_geofence_source_event
  ON dynamic_geofence_events(organization_id,source,source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS field_signoff_assurance(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assurance_mode TEXT NOT NULL CHECK(assurance_mode IN ('os_local_biometric_gate','device_pin_gate','none')),
  verified_at TIMESTAMPTZ,
  client_reference TEXT,
  document_sha256 TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_field_signoff_assurance_org_wo
  ON field_signoff_assurance(organization_id,work_order_id,created_at);

COMMIT;
