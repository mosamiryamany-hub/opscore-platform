-- 066: Pin the temporary schema last in the signed tenant verifier search_path.
-- PostgreSQL searches pg_temp first for relation/type names unless it is explicitly
-- placed in search_path. Keep only trusted schemas ahead of it in this SECURITY DEFINER.
BEGIN;

DO $preflight$
DECLARE
  function_owner text;
  function_is_definer boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef
    INTO function_owner, function_is_definer
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'opscore_security.verified_tenant_context()'::pg_catalog.regprocedure;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_FUNCTION_MISSING';
  END IF;
  IF function_owner IS DISTINCT FROM 'opscore_auth_definer'
     OR function_is_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_OWNER_OR_MODE_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_runtime'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
      AND NOT rolcreaterole
      AND NOT rolcreatedb
  ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_RUNTIME_ROLE_INVALID';
  END IF;
END
$preflight$;

ALTER FUNCTION opscore_security.verified_tenant_context()
  SET search_path TO pg_catalog, opscore_security, pg_temp;

DO $verify$
DECLARE
  function_owner text;
  function_is_definer boolean;
  search_path_setting text;
BEGIN
  SELECT
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    (SELECT config.setting
       FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config(setting)
      WHERE config.setting LIKE 'search_path=%'
      LIMIT 1)
  INTO function_owner, function_is_definer, search_path_setting
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'opscore_security.verified_tenant_context()'::pg_catalog.regprocedure;

  IF function_owner IS DISTINCT FROM 'opscore_auth_definer'
     OR function_is_definer IS DISTINCT FROM true
     OR search_path_setting IS DISTINCT FROM 'search_path=pg_catalog, opscore_security, pg_temp' THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_SEARCH_PATH_HARDENING_FAILED';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'opscore_runtime',
       'opscore_security.verified_tenant_context()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_RUNTIME_EXECUTE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.aclexplode(COALESCE(
      (SELECT p.proacl FROM pg_catalog.pg_proc p
       WHERE p.oid = 'opscore_security.verified_tenant_context()'::pg_catalog.regprocedure),
      pg_catalog.acldefault('f', (
        SELECT p.proowner FROM pg_catalog.pg_proc p
        WHERE p.oid = 'opscore_security.verified_tenant_context()'::pg_catalog.regprocedure
      ))
    )) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_PUBLIC_EXECUTE_REMAINS';
  END IF;

  IF pg_catalog.has_table_privilege(
       'opscore_runtime',
       'opscore_security.context_hmac_keys',
       'SELECT'
     ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_RUNTIME_CAN_READ_HMAC_KEYS';
  END IF;
END
$verify$;

COMMIT;
