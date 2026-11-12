-- 058_security_definer_search_path_hardening.sql
-- Normalize every public SECURITY DEFINER routine to a catalog-first path.
-- This closes the nine-function gap found during the live Neon audit while
-- preserving each routine's owner, ACL, tenant behavior, and FORCE RLS rules.

DO $migration$
DECLARE
  required_signatures text[] := ARRAY[
    'opscore_attest_migration_056(text)',
    'opscore_consume_password_reset_token(text,text)',
    'opscore_count_users()',
    'opscore_create_password_reset_token(text,text,text,timestamptz)',
    'opscore_is_privileged()',
    'opscore_list_memberships_for_user(text)',
    'opscore_resolve_login_candidate(text)',
    'opscore_resolve_oidc_identity(text,text)',
    'opscore_resolve_session_by_token_hash(text)',
    'opscore_revoke_session_by_token_hash(text)',
    'opscore_validate_password_reset_token(text)'
  ];
  signature text;
  function_oid oid;
  function_owner text;
  owner_bypass boolean;
  owner_superuser boolean;
  definer_count integer;
BEGIN
  IF current_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'OPSC_SECURITY_DEFINER_HARDENING_OWNER_REQUIRED';
  END IF;

  SELECT count(*)::integer
    INTO definer_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef;

  IF definer_count <> cardinality(required_signatures) THEN
    RAISE EXCEPTION 'OPSC_SECURITY_DEFINER_INVENTORY_MISMATCH: expected %, found %',
      cardinality(required_signatures), definer_count;
  END IF;

  FOREACH signature IN ARRAY required_signatures LOOP
    function_oid := to_regprocedure(format('public.%s', signature));
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'OPSC_SECURITY_DEFINER_FUNCTION_MISSING: %', signature;
    END IF;

    SELECT pg_get_userbyid(p.proowner),
           COALESCE(owner_role.rolbypassrls, false),
           COALESCE(owner_role.rolsuper, false),
           p.prosecdef
      INTO function_owner, owner_bypass, owner_superuser, definer_count
    FROM pg_proc p
    JOIN pg_roles owner_role ON owner_role.oid = p.proowner
    WHERE p.oid = function_oid;

    IF function_owner <> 'neondb_owner'
       OR owner_bypass IS NOT TRUE
       OR owner_superuser IS NOT FALSE
       OR definer_count IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'OPSC_SECURITY_DEFINER_OWNER_CONTRACT_FAILED: %', signature;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp',
      function_oid::regprocedure
    );
  END LOOP;

  SELECT count(*)::integer
    INTO definer_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
      WHERE settings.setting_value = 'search_path=pg_catalog, public, pg_temp'
    );

  IF definer_count <> cardinality(required_signatures) THEN
    RAISE EXCEPTION 'OPSC_SECURITY_DEFINER_SEARCH_PATH_HARDENING_FAILED: expected %, found %',
      cardinality(required_signatures), definer_count;
  END IF;
END
$migration$;
