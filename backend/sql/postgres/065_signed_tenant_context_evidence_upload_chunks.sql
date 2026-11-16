-- 065: bind evidence upload chunk RLS to the verified signed tenant context.
-- evidence_uploads and attachments already carry organization_id and are
-- bounded by migration 034 through opscore_current_tenant(). The child chunks
-- table has no organization_id, so migration 023 used a raw tenant GUC inside
-- an EXISTS policy and migration 037 supplied an access-mode permissive policy.
-- Replace both policies with parent-row checks through the signed-aware accessor.
BEGIN;

DO $preflight$
DECLARE
  tenant_definition text;
  uploads_rls boolean;
  uploads_force_rls boolean;
BEGIN
  IF to_regprocedure('public.opscore_current_tenant()') IS NULL
     OR to_regprocedure('opscore_security.verified_tenant_context()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_TENANT_CONTEXT_MIGRATIONS_063_064_REQUIRED';
  END IF;

  SELECT pg_get_functiondef('public.opscore_current_tenant()'::regprocedure)
  INTO tenant_definition;

  IF tenant_definition NOT LIKE '%verified_tenant_context%' THEN
    RAISE EXCEPTION 'OPSC_SIGNED_TENANT_CONTEXT_TENANT_ACCESSOR_NOT_ACTIVE';
  END IF;

  IF to_regclass('public.evidence_uploads') IS NULL
     OR to_regclass('public.evidence_upload_chunks') IS NULL THEN
    RAISE EXCEPTION 'OPSC_EVIDENCE_UPLOAD_TABLES_REQUIRED';
  END IF;

  SELECT c.relrowsecurity, c.relforcerowsecurity
  INTO uploads_rls, uploads_force_rls
  FROM pg_class c
  WHERE c.oid = 'public.evidence_uploads'::regclass;

  IF COALESCE(uploads_rls, false) IS NOT TRUE
     OR COALESCE(uploads_force_rls, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'OPSC_EVIDENCE_UPLOAD_PARENT_RLS_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.evidence_upload_chunks'::regclass
      AND attname = 'upload_id'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'OPSC_EVIDENCE_UPLOAD_CHUNK_PARENT_KEY_REQUIRED';
  END IF;
END
$preflight$;

ALTER TABLE public.evidence_upload_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_upload_chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opscore_tenant_permissive ON public.evidence_upload_chunks;
DROP POLICY IF EXISTS opscore_evidence_upload_chunks_tenant ON public.evidence_upload_chunks;
DROP POLICY IF EXISTS opscore_evidence_upload_chunks_signed_tenant ON public.evidence_upload_chunks;

CREATE POLICY opscore_evidence_upload_chunks_signed_tenant
ON public.evidence_upload_chunks
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  EXISTS (
    SELECT 1
    FROM public.evidence_uploads AS eu
    WHERE eu.id = evidence_upload_chunks.upload_id
      AND eu.organization_id = public.opscore_current_tenant()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.evidence_uploads AS eu
    WHERE eu.id = evidence_upload_chunks.upload_id
      AND eu.organization_id = public.opscore_current_tenant()
  )
);

CREATE POLICY opscore_evidence_upload_chunks_signed_guard
ON public.evidence_upload_chunks
AS RESTRICTIVE
FOR ALL
TO PUBLIC
USING (
  EXISTS (
    SELECT 1
    FROM public.evidence_uploads AS eu
    WHERE eu.id = evidence_upload_chunks.upload_id
      AND eu.organization_id = public.opscore_current_tenant()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.evidence_uploads AS eu
    WHERE eu.id = evidence_upload_chunks.upload_id
      AND eu.organization_id = public.opscore_current_tenant()
  )
);

DO $verify$
DECLARE
  permissive_policy text;
  restrictive_policy text;
  chunk_rls boolean;
  chunk_force_rls boolean;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
  INTO chunk_rls, chunk_force_rls
  FROM pg_class c
  WHERE c.oid = 'public.evidence_upload_chunks'::regclass;

  SELECT COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
  INTO permissive_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'evidence_upload_chunks'
    AND policyname = 'opscore_evidence_upload_chunks_signed_tenant'
    AND permissive = 'PERMISSIVE';

  SELECT COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
  INTO restrictive_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'evidence_upload_chunks'
    AND policyname = 'opscore_evidence_upload_chunks_signed_guard'
    AND permissive = 'RESTRICTIVE';

  IF chunk_rls IS NOT TRUE
     OR chunk_force_rls IS NOT TRUE
     OR permissive_policy IS NULL
     OR restrictive_policy IS NULL
     OR permissive_policy NOT LIKE '%opscore_current_tenant%'
     OR restrictive_policy NOT LIKE '%opscore_current_tenant%'
     OR permissive_policy LIKE '%current_setting%'
     OR restrictive_policy LIKE '%current_setting%'
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'evidence_upload_chunks'
         AND policyname IN ('opscore_tenant_permissive','opscore_evidence_upload_chunks_tenant')
     ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_EVIDENCE_UPLOAD_CHUNK_RLS_CONTRACT_FAILED';
  END IF;
END
$verify$;

COMMIT;
