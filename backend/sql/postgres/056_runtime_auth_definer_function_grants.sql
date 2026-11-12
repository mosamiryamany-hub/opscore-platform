-- 056_runtime_auth_definer_function_grants.sql
-- Give the least-privilege runtime login only the EXECUTE privileges required
-- by the authentication API. These SECURITY DEFINER helpers retain their
-- dedicated BYPASSRLS owner; the runtime login itself must remain NOBYPASSRLS.
--
-- The public ACL is explicitly revoked. No blanket schema/function grant is
-- issued, and opscore_app grants are not changed until production connection
-- identity proves that the legacy role is no longer in use.

DO $migration$
DECLARE
  runtime_oid oid;
  elevated_membership boolean;
  required_functions text[] := ARRAY[
    'opscore_resolve_login_candidate(text)',
    'opscore_list_memberships_for_user(text)',
    'opscore_resolve_session_by_token_hash(text)',
    'opscore_revoke_session_by_token_hash(text)',
    'opscore_count_users()',
    'opscore_resolve_oidc_identity(text,text)',
    'opscore_create_password_reset_token(text,text,text,timestamptz)',
    'opscore_validate_password_reset_token(text)',
    'opscore_consume_password_reset_token(text,text)',
    'opscore_is_privileged()'
  ];
  signature text;
  function_oid oid;
  function_owner_bypass boolean;
  function_is_definer boolean;
  function_config text[];
BEGIN
  SELECT oid INTO runtime_oid
  FROM pg_roles
  WHERE rolname = 'opscore_runtime'
    AND rolcanlogin
    AND NOT rolsuper
    AND NOT rolbypassrls
    AND NOT rolcreaterole
    AND NOT rolcreatedb;

  IF runtime_oid IS NULL THEN
    RAISE EXCEPTION 'OPSC_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_roles elevated
    WHERE (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolcreaterole OR elevated.rolcreatedb)
      AND pg_has_role(runtime_oid, elevated.oid, 'MEMBER')
  ) INTO elevated_membership;

  IF elevated_membership THEN
    RAISE EXCEPTION 'OPSC_RUNTIME_ROLE_HAS_ELEVATED_MEMBERSHIP';
  END IF;

  FOREACH signature IN ARRAY required_functions LOOP
    function_oid := to_regprocedure(format('public.%s', signature));
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'OPSC_REQUIRED_AUTH_FUNCTION_MISSING: %', signature;
    END IF;

    SELECT
      p.prosecdef,
      COALESCE(owner_role.rolsuper OR owner_role.rolbypassrls, false),
      COALESCE(p.proconfig, ARRAY[]::text[])
    INTO function_is_definer, function_owner_bypass, function_config
    FROM pg_proc p
    JOIN pg_roles owner_role ON owner_role.oid = p.proowner
    WHERE p.oid = function_oid;

    IF NOT function_is_definer THEN
      RAISE EXCEPTION 'OPSC_AUTH_FUNCTION_NOT_SECURITY_DEFINER: %', signature;
    END IF;
    IF NOT function_owner_bypass THEN
      RAISE EXCEPTION 'OPSC_AUTH_FUNCTION_OWNER_MUST_BYPASS_RLS: %', signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM unnest(function_config) AS config(setting)
      WHERE config.setting LIKE 'search_path=%'
        AND config.setting ILIKE '%public%'
        AND config.setting ILIKE '%pg_temp%'
    ) THEN
      RAISE EXCEPTION 'OPSC_AUTH_FUNCTION_SEARCH_PATH_NOT_PINNED: %', signature;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO opscore_runtime', function_oid::regprocedure);

    IF NOT has_function_privilege(runtime_oid, function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'OPSC_RUNTIME_AUTH_FUNCTION_GRANT_FAILED: %', signature;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(
        (SELECT p.proacl FROM pg_proc p WHERE p.oid = function_oid),
        acldefault('f', (SELECT p.proowner FROM pg_proc p WHERE p.oid = function_oid))
      )) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'OPSC_AUTH_FUNCTION_PUBLIC_EXECUTE_REMAINS: %', signature;
    END IF;
  END LOOP;
END
$migration$;
