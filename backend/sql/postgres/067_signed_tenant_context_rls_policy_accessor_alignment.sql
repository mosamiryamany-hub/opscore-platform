-- 067: Route every direct tenant GUC policy predicate through the canonical tenant accessor.
-- The accessor resolves a signed assertion when present and retains the legacy GUC
-- fallback during the staged application cutover. This removes policy-level bypasses
-- of the verifier without prematurely enabling the global hard cutover.
BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regprocedure('public.opscore_current_tenant()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_TENANT_ACCESSOR_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('opscore_security.verified_tenant_context()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_MISSING';
  END IF;
END
$preflight$;

DO $align$
DECLARE
  policy_row record;
  rewritten_using text;
  rewritten_check text;
  alter_sql text;
  changed_count integer := 0;
  residual_count integer := 0;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ILIKE '%current_setting%app.tenant_id%'
        OR COALESCE(with_check, '') ILIKE '%current_setting%app.tenant_id%'
      )
    ORDER BY tablename, policyname
  LOOP
    rewritten_using := CASE
      WHEN policy_row.qual IS NULL THEN NULL
      ELSE pg_catalog.regexp_replace(
        policy_row.qual,
        $$current_setting\('app\.tenant_id'::text,[[:space:]]*true\)$$,
        'opscore_current_tenant()',
        'gi'
      )
    END;
    rewritten_check := CASE
      WHEN policy_row.with_check IS NULL THEN NULL
      ELSE pg_catalog.regexp_replace(
        policy_row.with_check,
        $$current_setting\('app\.tenant_id'::text,[[:space:]]*true\)$$,
        'opscore_current_tenant()',
        'gi'
      )
    END;

    IF rewritten_using IS NOT DISTINCT FROM policy_row.qual
       AND rewritten_check IS NOT DISTINCT FROM policy_row.with_check THEN
      RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_POLICY_EXPRESSION_NOT_REWRITABLE:%.%',
        policy_row.tablename, policy_row.policyname;
    END IF;

    alter_sql := pg_catalog.format(
      'ALTER POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
    IF policy_row.qual IS NOT NULL THEN
      alter_sql := alter_sql || pg_catalog.format(' USING (%s)', rewritten_using);
    END IF;
    IF policy_row.with_check IS NOT NULL THEN
      alter_sql := alter_sql || pg_catalog.format(' WITH CHECK (%s)', rewritten_check);
    END IF;

    EXECUTE alter_sql;
    changed_count := changed_count + 1;
  END LOOP;

  SELECT count(*)::integer
    INTO residual_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND (
      COALESCE(qual, '') ILIKE '%current_setting%app.tenant_id%'
      OR COALESCE(with_check, '') ILIKE '%current_setting%app.tenant_id%'
    );

  IF residual_count <> 0 THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_POLICY_DIRECT_GUC_REMAINS:%', residual_count;
  END IF;

  IF changed_count = 0 THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_POLICY_ALIGNMENT_NO_POLICIES_CHANGED';
  END IF;

  RAISE NOTICE 'OPSC_SIGNED_CONTEXT_POLICY_ALIGNMENT_CHANGED:%', changed_count;
END
$align$;

COMMIT;
