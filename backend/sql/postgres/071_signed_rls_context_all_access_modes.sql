-- 071: Enforce HMAC-only PostgreSQL RLS identity for all application access modes.
-- Raw app.tenant_id/app.user_id/app.access_mode settings remain compatibility metadata,
-- never authorization inputs. Field operations must reference a live server-side session.
BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regprocedure('opscore_security.verified_tenant_context()') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_FIELD_VERIFIER_MISSING';
  END IF;
  IF pg_catalog.to_regclass('opscore_security.context_hmac_keys') IS NULL THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_KEY_STORE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_auth_definer'
      AND rolbypassrls = true AND rolsuper = false AND rolcanlogin = false
      AND rolcreatedb = false AND rolcreaterole = false
  ) THEN
    RAISE EXCEPTION 'OPSC_SIGNED_CONTEXT_DEDICATED_DEFINER_REQUIRED';
  END IF;
END
$preflight$;

SET LOCAL ROLE opscore_auth_definer;

CREATE OR REPLACE FUNCTION opscore_security.verified_rls_context()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO pg_catalog, opscore_security, pg_temp
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
  expected_mode text;
  expected_purpose text;
  expected_scope text;
  transaction_id_claim text;
  session_found boolean := false;
BEGIN
  raw_payload := NULLIF(pg_catalog.current_setting('app.signed_context_payload', true), '');
  signature_hex := NULLIF(pg_catalog.current_setting('app.signed_context_signature', true), '');
  IF raw_payload IS NULL OR signature_hex IS NULL
     OR pg_catalog.octet_length(raw_payload) > 4096
     OR signature_hex !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  claims := raw_payload::jsonb;
  IF pg_catalog.jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;

  -- The route-level field_request assertion already performs a transaction-bound
  -- HMAC, live-session, tenant and user check. Keep that independent contract intact.
  IF claims->>'purpose' = 'field_request' THEN
    claims := opscore_security.verified_tenant_context();
    IF claims IS NULL THEN RETURN NULL; END IF;
    RETURN claims || pg_catalog.jsonb_build_object('access_mode','field');
  END IF;

  expected_mode := CASE claims->>'purpose'
    WHEN 'field_operation' THEN 'field'
    WHEN 'api_key_operation' THEN 'field'
    WHEN 'auth_operation' THEN 'auth'
    WHEN 'system_operation' THEN 'system'
    WHEN 'backoffice_operation' THEN 'backoffice'
    ELSE NULL
  END;
  expected_purpose := CASE expected_mode
    WHEN 'field' THEN CASE WHEN claims->>'identity_kind' = 'api_key' THEN 'api_key_operation' ELSE 'field_operation' END
    WHEN 'auth' THEN 'auth_operation'
    WHEN 'system' THEN 'system_operation'
    WHEN 'backoffice' THEN 'backoffice_operation'
    ELSE NULL
  END;

  IF expected_mode IS NULL
     OR claims->>'v' IS DISTINCT FROM '1'
     OR claims->>'iss' IS DISTINCT FROM 'opscore-api'
     OR claims->>'aud' IS DISTINCT FROM 'opscore-database'
     OR claims->>'purpose' IS DISTINCT FROM expected_purpose
     OR claims->>'access_mode' IS DISTINCT FROM expected_mode
     OR NOT (claims ?& ARRAY[
       'sub','tenant_id','session_id','request_id','binding_scope','identity_kind','api_key_id',
       'transaction_id','iat','nbf','exp','jti','kid','backend_pid'
     ])
     OR pg_catalog.jsonb_typeof(claims->'sub') NOT IN ('string','null')
     OR pg_catalog.jsonb_typeof(claims->'tenant_id') NOT IN ('string','null')
     OR pg_catalog.jsonb_typeof(claims->'session_id') NOT IN ('string','null')
     OR pg_catalog.jsonb_typeof(claims->'identity_kind') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(claims->'api_key_id') NOT IN ('string','null')
     OR pg_catalog.jsonb_typeof(claims->'backend_pid') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(claims->'iat') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(claims->'nbf') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(claims->'exp') IS DISTINCT FROM 'number'
     OR NULLIF(pg_catalog.btrim(claims->>'request_id'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'jti'), '') IS NULL
     OR NULLIF(pg_catalog.btrim(claims->>'kid'), '') IS NULL
     OR claims->>'backend_pid' !~ '^[0-9]{1,10}$'
     OR claims->>'iat' !~ '^[0-9]{1,12}$'
     OR claims->>'nbf' !~ '^[0-9]{1,12}$'
     OR claims->>'exp' !~ '^[0-9]{1,12}$'
     OR (expected_mode <> 'field' AND (claims->>'identity_kind' IS DISTINCT FROM 'session' OR claims->>'api_key_id' IS NOT NULL OR claims->>'session_id' IS NOT NULL))
     OR (expected_mode = 'field' AND (
       NULLIF(pg_catalog.btrim(claims->>'tenant_id'), '') IS NULL
       OR NULLIF(pg_catalog.btrim(claims->>'sub'), '') IS NULL
       OR NOT (
         (claims->>'identity_kind' = 'session' AND NULLIF(pg_catalog.btrim(claims->>'session_id'), '') IS NOT NULL AND NULLIF(pg_catalog.btrim(claims->>'api_key_id'), '') IS NULL)
         OR (claims->>'identity_kind' = 'api_key' AND NULLIF(pg_catalog.btrim(claims->>'api_key_id'), '') IS NOT NULL AND NULLIF(pg_catalog.btrim(claims->>'session_id'), '') IS NULL)
       )
     )) THEN
    RETURN NULL;
  END IF;

  IF claims->>'request_id' IS DISTINCT FROM
     NULLIF(pg_catalog.current_setting('app.signed_context_request_id', true), '') THEN
    RETURN NULL;
  END IF;

  issued_at := (claims->>'iat')::bigint;
  not_before := (claims->>'nbf')::bigint;
  claim_expires_at := (claims->>'exp')::bigint;
  current_epoch := floor(extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
  transaction_id_claim := NULLIF(claims->>'transaction_id','');

  IF issued_at > current_epoch + 2
     OR not_before > current_epoch + 2
     OR not_before < issued_at - 2
     OR claim_expires_at <= current_epoch
     OR claim_expires_at <= issued_at
     OR claim_expires_at - issued_at > 45
     OR claim_expires_at > current_epoch + 45
     OR (claims->>'backend_pid')::integer IS DISTINCT FROM pg_catalog.pg_backend_pid() THEN
    RETURN NULL;
  END IF;

  expected_scope := CASE
    WHEN transaction_id_claim IS NULL THEN 'backend_session'
    ELSE 'transaction'
  END;
  IF claims->>'binding_scope' IS DISTINCT FROM expected_scope THEN
    RETURN NULL;
  END IF;
  IF expected_scope = 'transaction'
     AND (transaction_id_claim !~ '^[0-9]{1,20}$'
       OR transaction_id_claim IS DISTINCT FROM pg_catalog.pg_current_xact_id()::text) THEN
    RETURN NULL;
  END IF;

  SELECT k.secret INTO key_material
  FROM opscore_security.context_hmac_keys AS k
  WHERE k.key_id = claims->>'kid'
    AND k.enabled = true
    AND k.not_before <= pg_catalog.clock_timestamp()
    AND (k.not_after IS NULL OR k.not_after > pg_catalog.clock_timestamp());
  IF key_material IS NULL THEN RETURN NULL; END IF;

  expected_mac := public.hmac(pg_catalog.convert_to(raw_payload,'UTF8'), key_material, 'sha256');
  supplied_mac := pg_catalog.decode(signature_hex,'hex');
  IF pg_catalog.octet_length(expected_mac) <> 32 OR pg_catalog.octet_length(supplied_mac) <> 32 THEN
    RETURN NULL;
  END IF;
  FOR byte_index IN 0..31 LOOP
    difference := difference | (
      pg_catalog.get_byte(expected_mac,byte_index)
      # pg_catalog.get_byte(supplied_mac,byte_index)
    );
  END LOOP;
  IF difference <> 0 THEN RETURN NULL; END IF;

  -- Field purpose is never a self-asserted tenant/user: require a current,
  -- unexpired server session and a matching active membership.
  IF expected_mode = 'field' AND claims->>'identity_kind' = 'session' THEN
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
      AND COALESCE(g.status,'active') = 'active'
    LIMIT 1;
    IF session_found IS DISTINCT FROM true THEN RETURN NULL; END IF;
  ELSIF expected_mode = 'field' AND claims->>'identity_kind' = 'api_key' THEN
    -- The API key is resolved and scope-checked by the application before the
    -- parent process signs this request/backend-bound assertion. The database
    -- trusts only that HMAC; no direct runtime-role API-key table privilege is
    -- granted by this migration.
    session_found := claims->>'api_key_id' IS NOT NULL;
    IF session_found IS DISTINCT FROM true THEN RETURN NULL; END IF;
  END IF;

  RETURN claims;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION opscore_security.verified_rls_context() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION opscore_security.verified_rls_context() FROM opscore_runtime;
GRANT EXECUTE ON FUNCTION opscore_security.verified_rls_context() TO opscore_runtime;
RESET ROLE;


CREATE OR REPLACE FUNCTION public.opscore_current_tenant()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO pg_catalog, public, opscore_security, pg_temp
AS $function$
  SELECT NULLIF(opscore_security.verified_rls_context()->>'tenant_id','');
$function$;

CREATE OR REPLACE FUNCTION public.opscore_current_user()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO pg_catalog, public, opscore_security, pg_temp
AS $function$
  SELECT NULLIF(opscore_security.verified_rls_context()->>'sub','');
$function$;

CREATE OR REPLACE FUNCTION public.opscore_access_mode()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO pg_catalog, public, opscore_security, pg_temp
AS $function$
  SELECT CASE
    WHEN verified.context->>'access_mode' IN ('field','auth','system','backoffice')
      THEN verified.context->>'access_mode'
    ELSE ''
  END
  FROM (SELECT opscore_security.verified_rls_context() AS context) AS verified;
$function$;

CREATE OR REPLACE FUNCTION public.opscore_is_privileged()
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.organization_id::text = public.opscore_current_tenant()
      AND m.user_id::text = public.opscore_current_user()
      AND m.role IN ('owner','admin','manager')
  );
$function$;

DO $verify$
DECLARE
  fn_owner text;
  fn_config text[];
  raw_tenant_policy_count bigint;
  raw_user_policy_count bigint;
  raw_mode_policy_count bigint;
  runtime_key_read boolean;
  runtime_verifier_execute boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.proconfig
    INTO fn_owner, fn_config
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'opscore_security.verified_rls_context()'::pg_catalog.regprocedure;

  SELECT count(*) INTO raw_tenant_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND (COALESCE(qual,'') ILIKE '%current_setting%app.tenant_id%'
      OR COALESCE(with_check,'') ILIKE '%current_setting%app.tenant_id%'
      OR COALESCE(qual,'') ILIKE '%current_setting%app.current_tenant_id%'
      OR COALESCE(with_check,'') ILIKE '%current_setting%app.current_tenant_id%'
      OR COALESCE(qual,'') ILIKE '%current_setting%app.organization_id%'
      OR COALESCE(with_check,'') ILIKE '%current_setting%app.organization_id%');

  SELECT count(*) INTO raw_user_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND (COALESCE(qual,'') ILIKE '%current_setting%app.user_id%'
      OR COALESCE(with_check,'') ILIKE '%current_setting%app.user_id%');

  SELECT count(*) INTO raw_mode_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND (COALESCE(qual,'') ILIKE '%current_setting%app.access_mode%'
      OR COALESCE(with_check,'') ILIKE '%current_setting%app.access_mode%');

  SELECT pg_catalog.has_table_privilege('opscore_runtime','opscore_security.context_hmac_keys','SELECT'),
         pg_catalog.has_function_privilege('opscore_runtime','opscore_security.verified_rls_context()','EXECUTE')
    INTO runtime_key_read, runtime_verifier_execute;

  IF fn_owner IS DISTINCT FROM 'opscore_auth_definer'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.unnest(COALESCE(fn_config,ARRAY[]::text[])) AS c
       WHERE c = 'search_path=pg_catalog, opscore_security, pg_temp'
     )
     OR raw_tenant_policy_count <> 0
     OR raw_user_policy_count <> 0
     OR raw_mode_policy_count <> 0
     OR runtime_key_read IS NOT FALSE
     OR runtime_verifier_execute IS NOT TRUE THEN
    RAISE EXCEPTION 'OPSC_SIGNED_RLS_CONTEXT_HARDENING_FAILED';
  END IF;
END
$verify$;

REVOKE ALL ON FUNCTION public.opscore_current_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opscore_current_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opscore_access_mode() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opscore_is_privileged() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opscore_current_tenant() TO opscore_runtime;
GRANT EXECUTE ON FUNCTION public.opscore_current_user() TO opscore_runtime;
GRANT EXECUTE ON FUNCTION public.opscore_access_mode() TO opscore_runtime;
DO $privileged_helper_grants$
DECLARE
  helper_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO helper_owner
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.opscore_is_privileged()'::pg_catalog.regprocedure;
  IF helper_owner IS NULL THEN
    RAISE EXCEPTION 'OPSC_PRIVILEGED_HELPER_OWNER_MISSING';
  END IF;
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION public.opscore_current_tenant() TO %I', helper_owner);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION public.opscore_current_user() TO %I', helper_owner);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION public.opscore_access_mode() TO %I', helper_owner);
END
$privileged_helper_grants$;

GRANT EXECUTE ON FUNCTION public.opscore_is_privileged() TO opscore_runtime;
GRANT EXECUTE ON FUNCTION public.opscore_current_tenant(), public.opscore_current_user(), public.opscore_access_mode() TO opscore_auth_definer;

COMMENT ON FUNCTION public.opscore_current_tenant() IS
  'Tenant identity is returned only from a valid purpose-bound HMAC assertion; raw GUC values are never authorization inputs.';
COMMENT ON FUNCTION public.opscore_current_user() IS
  'User identity is returned only from a valid purpose-bound HMAC assertion; raw GUC values are never authorization inputs.';
COMMENT ON FUNCTION public.opscore_access_mode() IS
  'Access mode is returned only from a valid purpose-bound HMAC assertion; raw GUC values are never authorization inputs.';

COMMIT;
