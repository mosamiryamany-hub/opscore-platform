-- 074: Tenant-scoped native PostGIS feature storage.
-- Existing JSON/text GIS columns are intentionally preserved. This table is an
-- additive spatial source of truth; ingestion and backfill are separate gates.
DO $migration$
DECLARE
  target_schema text := current_schema();
BEGIN
  IF target_schema IS NULL THEN
    RAISE EXCEPTION 'SPATIAL_SCHEMA_UNRESOLVED';
  END IF;
  IF to_regtype('geometry') IS NULL OR to_regprocedure('st_isvalid(geometry)') IS NULL
     OR to_regprocedure('st_intersects(geometry,geometry)') IS NULL THEN
    RAISE EXCEPTION 'POSTGIS_GEOMETRY_SUPPORT_REQUIRED';
  END IF;
  IF to_regprocedure(format('%I.opscore_current_tenant()', target_schema)) IS NULL THEN
    RAISE EXCEPTION 'SPATIAL_TENANT_ACCESSOR_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_runtime') THEN
    RAISE EXCEPTION 'SPATIAL_RUNTIME_ROLE_REQUIRED';
  END IF;
END
$migration$;

CREATE TABLE spatial_features (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  entity_id TEXT NOT NULL,
  feature_key TEXT NOT NULL DEFAULT 'primary',
  geom geometry(Geometry, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 128),
  source_ref TEXT,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  observed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spatial_features_geom_valid CHECK (
    NOT ST_IsEmpty(geom) AND ST_IsValid(geom) AND ST_NDims(geom) = 2
  ),
  CONSTRAINT spatial_features_expiry_valid CHECK (expires_at IS NULL OR observed_at IS NULL OR expires_at > observed_at),
  CONSTRAINT spatial_features_created_by_membership_fkey FOREIGN KEY (created_by, organization_id) REFERENCES memberships(user_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT spatial_features_entity_key_unique UNIQUE (organization_id, entity_type, entity_id, feature_key)
);

CREATE INDEX idx_spatial_features_geom_gist
  ON spatial_features USING GIST (geom);
CREATE INDEX idx_spatial_features_org_updated
  ON spatial_features (organization_id, updated_at DESC);
CREATE INDEX idx_spatial_features_org_entity
  ON spatial_features (organization_id, entity_type, entity_id);

ALTER TABLE spatial_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE spatial_features FORCE ROW LEVEL SECURITY;
CREATE POLICY opscore_tenant_permissive ON spatial_features
  AS PERMISSIVE FOR ALL
  USING (organization_id = NULLIF(opscore_current_tenant(), ''))
  WITH CHECK (organization_id = NULLIF(opscore_current_tenant(), ''));
CREATE POLICY opscore_tenant_boundary_guard ON spatial_features
  AS RESTRICTIVE FOR ALL
  USING (organization_id = NULLIF(opscore_current_tenant(), ''))
  WITH CHECK (organization_id = NULLIF(opscore_current_tenant(), ''));

GRANT EXECUTE ON FUNCTION opscore_current_tenant() TO opscore_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON spatial_features TO opscore_runtime;
