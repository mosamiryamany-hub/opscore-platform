-- 073: Enforce tenant row security on persisted Digital Twin snapshots.
-- The application already scopes snapshot reads by authenticated organization_id;
-- this adds the database boundary so an omitted application predicate cannot
-- expose another tenant's operational state.
BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('public.operational_twin_snapshots') IS NULL THEN
    RAISE EXCEPTION 'OPSC_TWIN_SNAPSHOT_TABLE_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('public.opscore_current_tenant()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_TWIN_TENANT_ACCESSOR_MISSING';
  END IF;
END
$preflight$;

ALTER TABLE public.operational_twin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_twin_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opscore_tenant_isolation ON public.operational_twin_snapshots;
CREATE POLICY opscore_tenant_isolation
  ON public.operational_twin_snapshots
  USING (organization_id = public.opscore_current_tenant())
  WITH CHECK (organization_id = public.opscore_current_tenant());

COMMIT;
