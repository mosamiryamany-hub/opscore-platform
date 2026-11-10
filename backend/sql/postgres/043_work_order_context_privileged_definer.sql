-- Controlled SECURITY DEFINER helper for work-order context checks under tenant RLS.
-- Pin the search path and schema-qualify objects to prevent temp/public name shadowing.
CREATE OR REPLACE FUNCTION public.opscore_is_privileged()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.memberships AS m
     WHERE m.organization_id = NULLIF(pg_catalog.current_setting('app.tenant_id', true), '')
       AND m.user_id = public.opscore_current_user()
       AND m.role IN ('owner', 'admin', 'manager')
  );
$function$;

REVOKE ALL ON FUNCTION public.opscore_is_privileged() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opscore_is_privileged() TO opscore_app;

DO $migration$
BEGIN
  IF to_regclass('public.work_orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS opscore_work_order_context ON public.work_orders;
    CREATE POLICY opscore_work_order_context ON public.work_orders AS RESTRICTIVE
    USING (
      organization_id = pg_catalog.current_setting('app.tenant_id', true)
      AND (
        public.opscore_is_privileged()
        OR assigned_to = public.opscore_current_user()
        OR created_by = public.opscore_current_user()
      )
    )
    WITH CHECK (organization_id = pg_catalog.current_setting('app.tenant_id', true));
  END IF;
END
$migration$;
