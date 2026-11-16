-- 064: Route signed tenant context into the real work-order RLS read path.
-- Legacy callers without a signed assertion retain their current GUC behavior.
-- Once signed assertion GUCs are present, they are authoritative: invalid or
-- expired assertions return NULL and never fall back to caller-settable GUCs.
BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('opscore_security.verified_tenant_context()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_TENANT_CONTEXT_VERIFIER_063_REQUIRED';
  END IF;
  IF to_regclass('public.work_orders') IS NULL THEN
    RAISE EXCEPTION 'OPSC_WORK_ORDERS_TABLE_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.work_orders'::regclass
      AND relrowsecurity
      AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'OPSC_WORK_ORDERS_FORCE_RLS_REQUIRED';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.opscore_current_tenant()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public, opscore_security
AS $function$
  SELECT CASE
    WHEN NULLIF(pg_catalog.current_setting('app.signed_context_payload', true), '') IS NOT NULL
      THEN NULLIF(opscore_security.verified_tenant_context()->>'tenant_id', '')
    ELSE NULLIF(pg_catalog.current_setting('app.tenant_id', true), '')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.opscore_current_user()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public, opscore_security
AS $function$
  SELECT CASE
    WHEN NULLIF(pg_catalog.current_setting('app.signed_context_payload', true), '') IS NOT NULL
      THEN NULLIF(opscore_security.verified_tenant_context()->>'sub', '')
    ELSE NULLIF(pg_catalog.current_setting('app.user_id', true), '')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.opscore_access_mode()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public, opscore_security
AS $function$
  SELECT CASE
    WHEN NULLIF(pg_catalog.current_setting('app.signed_context_payload', true), '') IS NOT NULL
      THEN CASE
        WHEN opscore_security.verified_tenant_context()->>'purpose' = 'field_request' THEN 'field'
        ELSE ''
      END
    WHEN pg_catalog.current_setting('app.access_mode', true) IN ('field','auth','system','backoffice')
      THEN pg_catalog.current_setting('app.access_mode', true)
    ELSE ''
  END;
$function$;

CREATE OR REPLACE FUNCTION public.opscore_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships AS m
    WHERE m.organization_id = public.opscore_current_tenant()
      AND m.user_id = public.opscore_current_user()
      AND m.role IN ('owner', 'admin', 'manager')
  );
$function$;

DROP POLICY IF EXISTS opscore_work_order_context ON public.work_orders;
CREATE POLICY opscore_work_order_context
ON public.work_orders
AS RESTRICTIVE
FOR ALL
TO PUBLIC
USING (
  organization_id = public.opscore_current_tenant()
  AND (
    public.opscore_is_privileged()
    OR assigned_to = public.opscore_current_user()
    OR created_by = public.opscore_current_user()
  )
)
WITH CHECK (
  organization_id = public.opscore_current_tenant()
);

DO $verify$
DECLARE
  tenant_definition text;
  user_definition text;
  access_definition text;
  privileged_definition text;
  work_order_policy text;
  work_order_owner text;
BEGIN
  SELECT pg_get_functiondef('public.opscore_current_tenant()'::regprocedure),
         pg_get_functiondef('public.opscore_current_user()'::regprocedure),
         pg_get_functiondef('public.opscore_access_mode()'::regprocedure),
         pg_get_functiondef('public.opscore_is_privileged()'::regprocedure)
  INTO tenant_definition, user_definition, access_definition, privileged_definition;

  SELECT pg_get_userbyid(c.relowner)
  INTO work_order_owner
  FROM pg_class c
  WHERE c.oid = 'public.work_orders'::regclass;

  SELECT COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
  INTO work_order_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'work_orders'
    AND policyname = 'opscore_work_order_context';

  IF tenant_definition NOT LIKE '%verified_tenant_context%'
     OR user_definition NOT LIKE '%verified_tenant_context%'
     OR access_definition NOT LIKE '%verified_tenant_context%'
     OR privileged_definition NOT LIKE '%opscore_current_tenant%'
     OR privileged_definition NOT LIKE '%opscore_current_user%'
     OR work_order_policy NOT LIKE '%opscore_current_tenant%'
     OR work_order_policy LIKE '%current_setting%'
     OR work_order_policy LIKE '%app.tenant_id%'
     OR work_order_owner IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_WORK_ORDER_RLS_CONTRACT_FAILED';
  END IF;
END
$verify$;

COMMIT;
