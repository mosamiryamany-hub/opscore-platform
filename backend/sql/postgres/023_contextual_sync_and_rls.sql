-- OpsCore v0.11.56 deep hardening: atomic sync blocks + contextual RLS.
-- PostGIS is preferred for spatial context; fall back without it when unavailable.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'postgis extension unavailable: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS sync_blocks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  event_count BIGINT NOT NULL CHECK(event_count >= 0),
  first_client_event_id TEXT,
  last_client_event_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,actor_user_id,block_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_blocks_org_actor_received ON sync_blocks(organization_id,actor_user_id,received_at);

CREATE TABLE IF NOT EXISTS operational_event_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  event_sha256 TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,event_key)
);
CREATE INDEX IF NOT EXISTS idx_operational_event_receipts_org_observed ON operational_event_receipts(organization_id,observed_at);

CREATE OR REPLACE FUNCTION opscore_current_tenant() RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;
CREATE OR REPLACE FUNCTION opscore_current_user() RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$;
CREATE OR REPLACE FUNCTION opscore_actor_lat() RETURNS DOUBLE PRECISION LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_lat', true), '')::DOUBLE PRECISION;
$$;
CREATE OR REPLACE FUNCTION opscore_actor_lon() RETURNS DOUBLE PRECISION LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_lon', true), '')::DOUBLE PRECISION;
$$;
CREATE OR REPLACE FUNCTION opscore_access_mode() RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.access_mode', true) IN ('field','auth','system','backoffice')
      THEN current_setting('app.access_mode', true)
    ELSE ''
  END;
$$;
CREATE OR REPLACE FUNCTION opscore_is_privileged() RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = NULLIF(current_setting('app.tenant_id', true), '')
      AND m.user_id = opscore_current_user()
      AND m.role IN ('owner','admin','manager')
  );
$$;
REVOKE ALL ON FUNCTION opscore_is_privileged() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION opscore_is_privileged() TO opscore_app;
CREATE OR REPLACE FUNCTION opscore_field_context_allows_site(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_start TIMESTAMPTZ DEFAULT NULL,
  p_end TIMESTAMPTZ DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT CASE
    WHEN opscore_access_mode() <> 'field' THEN true
    WHEN opscore_actor_lat() IS NULL OR opscore_actor_lon() IS NULL THEN false
    WHEN p_lat IS NULL OR p_lon IS NULL THEN true
    ELSE (
      abs(opscore_actor_lat() - p_lat) < 0.5
      AND abs(opscore_actor_lon() - p_lon) < 0.5
    )
  END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sync_blocks','operational_event_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY opscore_tenant_isolation ON %I USING (organization_id = current_setting(''app.tenant_id'', true)) WITH CHECK (organization_id = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;
END $$;

-- evidence_upload_chunks may not exist on all chains; guard.
DO $$
BEGIN
  IF to_regclass('public.evidence_upload_chunks') IS NOT NULL THEN
    ALTER TABLE evidence_upload_chunks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE evidence_upload_chunks FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks;
    CREATE POLICY opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks AS RESTRICTIVE
    USING (
      EXISTS (
        SELECT 1 FROM evidence_uploads eu
        WHERE eu.id = evidence_upload_chunks.upload_id
          AND eu.organization_id = current_setting('app.tenant_id', true)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM evidence_uploads eu
        WHERE eu.id = evidence_upload_chunks.upload_id
          AND eu.organization_id = current_setting('app.tenant_id', true)
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.work_orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS opscore_work_order_context ON work_orders;
    CREATE POLICY opscore_work_order_context ON work_orders AS RESTRICTIVE
    USING (
      organization_id = current_setting('app.tenant_id', true) AND (
        opscore_is_privileged()
        OR (assigned_to = opscore_current_user())
        OR (created_by = opscore_current_user())
      )
    )
    WITH CHECK (organization_id = current_setting('app.tenant_id', true));
  END IF;
  IF to_regclass('public.appointments') IS NOT NULL THEN
    DROP POLICY IF EXISTS opscore_appointment_context ON appointments;
    CREATE POLICY opscore_appointment_context ON appointments AS RESTRICTIVE
    USING (
      organization_id = current_setting('app.tenant_id', true) AND (
        opscore_is_privileged()
        OR (technician_id = opscore_current_user())
      )
    )
    WITH CHECK (organization_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
