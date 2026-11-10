-- System-wide operational tables (no organization_id): enable FORCE RLS + app policy.
-- spatial_ref_sys remains the sole catalog exception (PostGIS); app may SELECT only.

ALTER TABLE public.firewall_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_rate_buckets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_system_table_guard ON public.firewall_rate_buckets;
CREATE POLICY opscore_system_table_guard ON public.firewall_rate_buckets
  FOR ALL TO opscore_app USING (true) WITH CHECK (true);

ALTER TABLE public.login_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_throttle FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_system_table_guard ON public.login_throttle;
CREATE POLICY opscore_system_table_guard ON public.login_throttle
  FOR ALL TO opscore_app USING (true) WITH CHECK (true);

ALTER TABLE public.worker_guard_system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_guard_system_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_system_table_guard ON public.worker_guard_system_events;
CREATE POLICY opscore_system_table_guard ON public.worker_guard_system_events
  FOR ALL TO opscore_app USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM opscore_app;
GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_app;
