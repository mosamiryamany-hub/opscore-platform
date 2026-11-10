-- 042_control_plane_tables.sql
-- Reproducible, idempotent schema for tenant-scoped control-plane state.
BEGIN;
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  enabled integer NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  reason text NOT NULL DEFAULT '',
  updated_by text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CONSTRAINT feature_flags_organization_id_flag_key_key UNIQUE (organization_id, flag_key)
);
CREATE TABLE IF NOT EXISTS public.safe_mode_states (
  organization_id text PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled integer NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  reason text NOT NULL DEFAULT '',
  updated_by text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.control_plane_runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  result_json text NOT NULL,
  result_sha256 text NOT NULL,
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_organization_id_flag_key_key
  ON public.feature_flags (organization_id, flag_key);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON public.feature_flags;
CREATE POLICY opscore_tenant_boundary_guard ON public.feature_flags
  USING (organization_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE public.safe_mode_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_mode_states FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON public.safe_mode_states;
CREATE POLICY opscore_tenant_boundary_guard ON public.safe_mode_states
  USING (organization_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE public.control_plane_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_plane_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON public.control_plane_runs;
CREATE POLICY opscore_tenant_boundary_guard ON public.control_plane_runs
  USING (organization_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.tenant_id', true), ''));
COMMIT;
