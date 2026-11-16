-- 069: Persist technician GPS breadcrumbs on PostgreSQL with tenant-safe references.
--
-- The SQLite geofencing adapter creates this table lazily. PostgreSQL must use
-- a versioned migration instead: the signed map-viewport read runs inside a
-- PostgreSQL transaction, and a caught "relation missing" error would leave
-- that transaction aborted. This migration creates the table before the HTTP
-- route can query it, with composite tenant references and forced RLS.

BEGIN;

DO $preflight$
DECLARE
  runtime_login boolean;
  runtime_superuser boolean;
  runtime_bypass_rls boolean;
BEGIN
  IF pg_catalog.to_regprocedure('public.opscore_current_tenant()') IS NULL THEN
    RAISE EXCEPTION 'TECHNICIAN_TRAIL_TENANT_ACCESSOR_MISSING';
  END IF;

  SELECT rolcanlogin, rolsuper, rolbypassrls
    INTO runtime_login, runtime_superuser, runtime_bypass_rls
  FROM pg_catalog.pg_roles
  WHERE rolname = 'opscore_runtime';

  IF runtime_login IS DISTINCT FROM true
     OR runtime_superuser IS DISTINCT FROM false
     OR runtime_bypass_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TECHNICIAN_TRAIL_RUNTIME_ROLE_INVALID';
  END IF;
END
$preflight$;

CREATE TABLE public.technician_location_trail (
  id text PRIMARY KEY,
  organization_id text NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  technician_id text NOT NULL,
  latitude double precision NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision
    CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  recorded_at text NOT NULL,
  appointment_id text,
  work_order_id text,
  source text NOT NULL DEFAULT 'device'
    CHECK (source IN ('device', 'checkin', 'sync')),
  client_event_id text,
  created_at text NOT NULL,

  CONSTRAINT technician_location_trail_technician_tenant_fk
    FOREIGN KEY (technician_id, organization_id)
    REFERENCES public.memberships(user_id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT technician_location_trail_appointment_tenant_fk
    FOREIGN KEY (appointment_id, organization_id)
    REFERENCES public.appointments(id, organization_id)
    ON DELETE SET NULL (appointment_id),

  CONSTRAINT technician_location_trail_work_order_tenant_fk
    FOREIGN KEY (work_order_id, organization_id)
    REFERENCES public.work_orders(id, organization_id)
    ON DELETE SET NULL (work_order_id),

  CONSTRAINT technician_location_trail_natural_key
    UNIQUE (organization_id, technician_id, recorded_at, latitude, longitude),

  CONSTRAINT technician_location_trail_client_event_key
    UNIQUE (organization_id, client_event_id)
);

CREATE INDEX technician_location_trail_org_tech_time_idx
  ON public.technician_location_trail (organization_id, technician_id, recorded_at);

CREATE INDEX technician_location_trail_org_time_idx
  ON public.technician_location_trail (organization_id, recorded_at);

ALTER TABLE public.technician_location_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_location_trail FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_location_trail_runtime_access
  ON public.technician_location_trail;
CREATE POLICY technician_location_trail_runtime_access
  ON public.technician_location_trail
  AS PERMISSIVE
  FOR ALL
  TO opscore_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS technician_location_trail_tenant_guard
  ON public.technician_location_trail;
CREATE POLICY technician_location_trail_tenant_guard
  ON public.technician_location_trail
  AS RESTRICTIVE
  FOR ALL
  TO opscore_runtime
  USING (organization_id = public.opscore_current_tenant())
  WITH CHECK (organization_id = public.opscore_current_tenant());

REVOKE ALL PRIVILEGES ON TABLE public.technician_location_trail FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.technician_location_trail FROM opscore_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.technician_location_trail
  TO opscore_runtime;

DO $verify$
DECLARE
  rls_enabled boolean;
  rls_forced boolean;
  policy_count integer;
  tenant_policy_valid boolean;
  access_policy_valid boolean;
  runtime_select boolean;
  runtime_insert boolean;
  runtime_update boolean;
  runtime_delete boolean;
  fk_technician boolean;
  fk_appointment boolean;
  fk_work_order boolean;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO rls_enabled, rls_forced
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = 'public.technician_location_trail'::regclass;

  SELECT count(*)::integer
    INTO policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'technician_location_trail';

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'technician_location_trail'
      AND policyname = 'technician_location_trail_tenant_guard'
      AND cmd = 'ALL'
      AND COALESCE(qual, '') LIKE '%opscore_current_tenant()%'
      AND COALESCE(with_check, '') LIKE '%opscore_current_tenant()%'
  ) INTO tenant_policy_valid;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'technician_location_trail'
      AND policyname = 'technician_location_trail_runtime_access'
      AND cmd = 'ALL'
      AND 'opscore_runtime' = ANY(roles)
  ) INTO access_policy_valid;

  SELECT
    pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'SELECT'),
    pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'INSERT'),
    pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'UPDATE'),
    pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'DELETE')
  INTO runtime_select, runtime_insert, runtime_update, runtime_delete;

  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.technician_location_trail'::regclass
        AND conname = 'technician_location_trail_technician_tenant_fk'
        AND contype = 'f' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE
          'FOREIGN KEY (technician_id, organization_id) REFERENCES memberships(user_id, organization_id)%'
    ),
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.technician_location_trail'::regclass
        AND conname = 'technician_location_trail_appointment_tenant_fk'
        AND contype = 'f' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE
          'FOREIGN KEY (appointment_id, organization_id) REFERENCES appointments(id, organization_id)%'
    ),
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.technician_location_trail'::regclass
        AND conname = 'technician_location_trail_work_order_tenant_fk'
        AND contype = 'f' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE
          'FOREIGN KEY (work_order_id, organization_id) REFERENCES work_orders(id, organization_id)%'
    )
  INTO fk_technician, fk_appointment, fk_work_order;

  IF rls_enabled IS DISTINCT FROM true
     OR rls_forced IS DISTINCT FROM true
     OR policy_count <> 2
     OR tenant_policy_valid IS DISTINCT FROM true
     OR access_policy_valid IS DISTINCT FROM true
     OR runtime_select IS DISTINCT FROM true
     OR runtime_insert IS DISTINCT FROM true
     OR runtime_update IS DISTINCT FROM true
     OR runtime_delete IS DISTINCT FROM true
     OR fk_technician IS DISTINCT FROM true
     OR fk_appointment IS DISTINCT FROM true
     OR fk_work_order IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TECHNICIAN_TRAIL_TENANT_PERSISTENCE_VERIFY_FAILED';
  END IF;

  IF pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('opscore_runtime', 'public.technician_location_trail', 'TRIGGER') THEN
    RAISE EXCEPTION 'TECHNICIAN_TRAIL_RUNTIME_PRIVILEGE_EXCESS';
  END IF;
END
$verify$;

COMMIT;
