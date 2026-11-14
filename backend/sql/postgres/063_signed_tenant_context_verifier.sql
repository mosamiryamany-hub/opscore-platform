-- 063: Add a runtime-unreadable HMAC verifier for transaction-bound tenant context.
-- This migration does not change existing application RLS policies. The first
-- signed-context rollout is limited to an explicitly enabled Preview proof route.
BEGIN;

DO $bootstrap$
DECLARE
  verifier_owner text;
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = 'opscore_auth_definer'
        AND rolbypassrls
        AND NOT rolsuper
        AND NOT rolcanlogin
    ) THEN 'opscore_auth_definer'
    ELSE 'neondb_owner'
  END INTO verifier_owner;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = verifier_owner AND rolbypassrls AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_OWNER_INVALID';
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS opscore_security AUTHORIZATION %I', verifier_owner);
  EXECUTE format('ALTER SCHEMA opscore_security OWNER TO %I', verifier_owner);
END
$bootstrap$;

CREATE TABLE IF NOT EXISTS opscore_security.context_hmac_keys (
  key_id text PRIMARY KEY,
  secret bytea NOT NULL CHECK (octet_length(secret) = 32),
  enabled boolean NOT NULL DEFAULT true,
  not_before timestamptz NOT NULL DEFAULT now(),
  not_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT context_hmac_keys_key_id_length CHECK (length(key_id) BETWEEN 1 AND 64),
  CONSTRAINT context_hmac_keys_validity CHECK (not_after IS NULL OR not_after > not_before)
);

CREATE OR REPLACE FUNCTION opscore_security.verified_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, opscore_security
AS $function$
DECLARE
  raw_payload text;
  signature_hex text;
  claims jsonb;
  key_material bytea;
  expected_mac bytea;
  supplied_mac bytea;
  difference integer := 0;
  byte_index integer;
  issued_at bigint;
  not_before bigint;
  claim_expires_at bigint;
  current_epoch bigint;
  session_found boolean := false;
BEGIN
  raw_payload := NULLIF(pg_catalog.current_setting('app.signed_context_payload', true), '');
  signature_hex := NULLIF(pg_catalog.current_setting('app.signed_context_signature', true), '');

  IF raw_payload IS NULL
     OR signature_hex IS NULL
     OR pg_catalog.octet_length(raw_payload) > 4096
     OR signature_hex !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  claims := raw_payload::jsonb;
  IF pg_catalog.jsonb_typeof(claims) IS DISTINCT FROM 'object'
     OR claims->>'v' IS DISTINCT FROM '1'
     OR claims->>'iss' IS DISTINCT FROM 'opscore-api'
     OR claims->>'aud' IS DISTINCT FROM 'opscore-database'
     OR claims->>'purpose' IS DISTINCT FROM 'field_request'
     OR NOT (claims ?& ARRAY[
       'sub','tenant_id','session_id','iat','nbf','exp','jti','kid','backend_pid','transaction_id'
     ])
     OR NULLIF(pg_catalog.btrim(claims->>'sub'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'tenant_id'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'session_id'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'jti'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'kid'), '') IS NULL
     OR claims->>'backend_pid' !~ '^[0-9]{1,10}$'
     OR claims->>'transaction_id' !~ '^[0-9]{1,20}$'
     OR claims->>'iat' !~ '^[0-9]{1,12}$'
     OR claims->>'nbf' !~ '^[0-9]{1,12}$'
     OR claims->>'exp' !~ '^[0-9]{1,12}$' THEN
    RETURN NULL;
  END IF;

  issued_at := (claims->>'iat')::bigint;
  not_before := (claims->>'nbf')::bigint;
  claim_expires_at := (claims->>'exp')::bigint;
  current_epoch := floor(extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;

  IF issued_at > current_epoch + 2
     OR not_before > current_epoch + 2
     OR not_before < issued_at - 2
     OR claim_expires_at <= current_epoch
     OR claim_expires_at <= issued_at
     OR claim_expires_at - issued_at > 60
     OR claim_expires_at > current_epoch + 60
     OR (claims->>'backend_pid')::integer IS DISTINCT FROM pg_catalog.pg_backend_pid()
     OR claims->>'transaction_id' IS DISTINCT FROM pg_catalog.pg_current_xact_id()::text THEN
    RETURN NULL;
  END IF;

  SELECT k.secret INTO key_material
  FROM opscore_security.context_hmac_keys AS k
  WHERE k.key_id = claims->>'kid'
    AND k.enabled = true
    AND k.not_before <= pg_catalog.clock_timestamp()
    AND (k.not_after IS NULL OR k.not_after > pg_catalog.clock_timestamp());

  IF key_material IS NULL THEN
    RETURN NULL;
  END IF;

  expected_mac := public.hmac(pg_catalog.convert_to(raw_payload, 'UTF8'), key_material, 'sha256');
  supplied_mac := pg_catalog.decode(signature_hex, 'hex');
  IF pg_catalog.octet_length(expected_mac) <> 32
     OR pg_catalog.octet_length(supplied_mac) <> 32 THEN
    RETURN NULL;
  END IF;

  -- Fixed-length comparison loop. This is a constant-work preliminary check,
  -- not a formal constant-time cryptographic certification.
  FOR byte_index IN 0..31 LOOP
    difference := difference | (
      pg_catalog.get_byte(expected_mac, byte_index)
      # pg_catalog.get_byte(supplied_mac, byte_index)
    );
  END LOOP;
  IF difference <> 0 THEN
    RETURN NULL;
  END IF;

  -- The existing schema has no revoked_at column; logout revokes by deleting this row.
  SELECT true INTO session_found
  FROM public.sessions AS s
  JOIN public.users AS u ON u.id = s.user_id
  JOIN public.memberships AS m
    ON m.user_id = s.user_id AND m.organization_id = s.organization_id
  JOIN public.organizations AS o ON o.id = s.organization_id
  LEFT JOIN public.organization_governance AS g
    ON g.organization_id = s.organization_id
  WHERE s.id = claims->>'session_id'
    AND s.user_id = claims->>'sub'
    AND s.organization_id = claims->>'tenant_id'
    AND u.status = 'active'
    AND s.expires_at::timestamptz > pg_catalog.clock_timestamp()
    AND pg_catalog.to_timestamp(claim_expires_at::double precision) <= s.expires_at::timestamptz
    AND COALESCE(g.status, 'active') = 'active'
  LIMIT 1;

  IF session_found IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  RETURN claims;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END
$function$;

DO $ownership_and_grants$
DECLARE
  verifier_owner text;
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = 'opscore_auth_definer'
        AND rolbypassrls
        AND NOT rolsuper
        AND NOT rolcanlogin
    ) THEN 'opscore_auth_definer'
    ELSE 'neondb_owner'
  END INTO verifier_owner;

  EXECUTE format('ALTER TABLE opscore_security.context_hmac_keys OWNER TO %I', verifier_owner);
  EXECUTE format('ALTER FUNCTION opscore_security.verified_tenant_context() OWNER TO %I', verifier_owner);
  EXECUTE format('GRANT USAGE ON SCHEMA opscore_security TO %I', verifier_owner);
  EXECUTE format('GRANT SELECT ON TABLE opscore_security.context_hmac_keys TO %I', verifier_owner);
  EXECUTE format(
    'GRANT SELECT ON TABLE public.sessions, public.users, public.memberships, public.organizations, public.organization_governance TO %I',
    verifier_owner
  );
  GRANT USAGE ON SCHEMA opscore_security TO opscore_runtime;
  GRANT EXECUTE ON FUNCTION opscore_security.verified_tenant_context() TO opscore_runtime;
  REVOKE ALL PRIVILEGES ON TABLE opscore_security.context_hmac_keys FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON TABLE opscore_security.context_hmac_keys FROM opscore_runtime;
  REVOKE ALL PRIVILEGES ON FUNCTION opscore_security.verified_tenant_context() FROM PUBLIC;
END
$ownership_and_grants$;

DO $verify$
DECLARE
  verifier_owner text;
  function_config text[];
  runtime_key_read boolean;
  runtime_execute boolean;
  public_execute boolean;
  runtime_schema_create boolean;
BEGIN
  SELECT pg_get_userbyid(p.proowner), p.proconfig
  INTO verifier_owner, function_config
  FROM pg_proc p
  WHERE p.oid = 'opscore_security.verified_tenant_context()'::regprocedure;

  SELECT has_table_privilege('opscore_runtime', 'opscore_security.context_hmac_keys', 'SELECT'),
         has_function_privilege('opscore_runtime', 'opscore_security.verified_tenant_context()', 'EXECUTE'),
         EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(
             (SELECT p.proacl FROM pg_proc p WHERE p.oid = 'opscore_security.verified_tenant_context()'::regprocedure),
             acldefault('f', (SELECT p.proowner FROM pg_proc p WHERE p.oid = 'opscore_security.verified_tenant_context()'::regprocedure))
           )) a
           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
         ),
         has_schema_privilege('opscore_runtime', 'opscore_security', 'CREATE')
  INTO runtime_key_read, runtime_execute, public_execute, runtime_schema_create;

  IF verifier_owner NOT IN ('opscore_auth_definer', 'neondb_owner')
     OR runtime_key_read IS NOT FALSE
     OR runtime_execute IS NOT TRUE
     OR public_execute IS NOT FALSE
     OR runtime_schema_create IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(function_config, ARRAY[]::text[])) v
       WHERE v = 'search_path=pg_catalog, opscore_security'
     ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_VERIFIER_SECURITY_CONTRACT_FAILED';
  END IF;
END
$verify$;

COMMIT;
