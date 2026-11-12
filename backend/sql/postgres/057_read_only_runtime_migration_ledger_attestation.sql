-- 057_read_only_runtime_migration_ledger_attestation.sql
-- Keep schema_migrations inaccessible to the application role. Expose only a
-- narrowly scoped, read-only proof for the one migration whose source digest
-- is part of the production release contract.
--
-- The function is owned by neondb_owner (the existing migration operator),
-- runs with a pinned search_path and row_security=off, and accepts calls only
-- from a direct opscore_runtime login. It never returns the ledger contents.

DO $migration$
DECLARE
  owner_role oid;
BEGIN
  IF current_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_ATTESTATION_OWNER_REQUIRED';
  END IF;

  SELECT oid INTO owner_role
  FROM pg_roles
  WHERE rolname = 'neondb_owner'
    AND rolbypassrls
    AND NOT rolsuper;

  IF owner_role IS NULL THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_ATTESTATION_OWNER_NOT_LEAST_PRIVILEGED';
  END IF;

  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('public.schema_migrations')
      AND attname = 'filename' AND attnum > 0 AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('public.schema_migrations')
      AND attname = 'sha256' AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_SCHEMA_UNSUPPORTED';
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.opscore_attest_migration_056(p_expected_sha256 text)
RETURNS TABLE (
  migration_056_recorded boolean,
  migration_056_hash_matches boolean,
  latest_filename text,
  migration_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
SET row_security = off
AS $function$
DECLARE
  recorded_sha256 text;
  current_latest_filename text;
  current_migration_count integer;
BEGIN
  IF session_user <> 'opscore_runtime' THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_ATTESTATION_CALLER_FORBIDDEN';
  END IF;

  IF p_expected_sha256 IS NULL
     OR p_expected_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_ATTESTATION_DIGEST_INVALID';
  END IF;

  SELECT
    (
      SELECT lower(sm.sha256)
      FROM public.schema_migrations AS sm
      WHERE sm.filename = '056_runtime_auth_definer_function_grants.sql'
      LIMIT 1
    ),
    (SELECT max(sm.filename) FROM public.schema_migrations AS sm),
    (SELECT count(*)::integer FROM public.schema_migrations AS sm)
  INTO recorded_sha256, current_latest_filename, current_migration_count;

  RETURN QUERY
  SELECT
    recorded_sha256 IS NOT NULL,
    recorded_sha256 IS NOT NULL AND recorded_sha256 = p_expected_sha256,
    current_latest_filename,
    current_migration_count;
END
$function$;

ALTER FUNCTION public.opscore_attest_migration_056(text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.opscore_attest_migration_056(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opscore_attest_migration_056(text) TO opscore_runtime;

DO $verify$
DECLARE
  function_oid oid := to_regprocedure('public.opscore_attest_migration_056(text)');
  function_owner text;
  owner_bypass boolean;
  runtime_execute boolean;
  public_execute boolean;
  search_path_pinned boolean;
  row_security_disabled boolean;
BEGIN
  SELECT
    owner_role.rolname,
    owner_role.rolbypassrls,
    has_function_privilege('opscore_runtime', p.oid, 'EXECUTE'),
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ),
    EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
      WHERE settings.setting_value ILIKE 'search_path=%'
        AND settings.setting_value ILIKE '%pg_catalog%'
        AND settings.setting_value ILIKE '%public%'
        AND settings.setting_value ILIKE '%pg_temp%'
    ),
    EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
      WHERE settings.setting_value = 'row_security=off'
    )
  INTO function_owner, owner_bypass, runtime_execute, public_execute,
       search_path_pinned, row_security_disabled
  FROM pg_proc p
  JOIN pg_roles owner_role ON owner_role.oid = p.proowner
  WHERE p.oid = function_oid;

  IF function_oid IS NULL
     OR function_owner <> 'neondb_owner'
     OR owner_bypass IS NOT TRUE
     OR runtime_execute IS NOT TRUE
     OR public_execute IS NOT FALSE
     OR search_path_pinned IS NOT TRUE
     OR row_security_disabled IS NOT TRUE THEN
    RAISE EXCEPTION 'OPSC_MIGRATION_LEDGER_ATTESTATION_SECURITY_CONTRACT_FAILED';
  END IF;
END
$verify$;
