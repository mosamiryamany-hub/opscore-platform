-- 075: Expose a signed-context-only spatial viewport read contract.
-- PostgreSQL will not push non-LEAKPROOF PostGIS predicates below an RLS
-- security barrier. Keep FORCE RLS for direct table writes, but route reads
-- through a narrowly scoped SECURITY DEFINER function. The function derives
-- tenant identity only from the HMAC verifier; it accepts no tenant argument.
-- The dedicated owner is deliberately BYPASSRLS and NOLOGIN. Its only spatial
-- table privilege is SELECT, and the
-- function contains the mandatory verified tenant predicate before reading.

BEGIN;

DO $preflight$
DECLARE
  verifier_owner text;
  verifier_is_definer boolean;
  spatial_rls boolean;
  spatial_force_rls boolean;
  gist_valid boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef
    INTO verifier_owner, verifier_is_definer
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('opscore_security.verified_rls_context()');

  IF verifier_owner IS DISTINCT FROM 'opscore_auth_definer'
     OR verifier_is_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_SIGNED_VERIFIER_CONTRACT_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'opscore_auth_definer'
      AND rolbypassrls
      AND NOT rolsuper
      AND NOT rolcanlogin
      AND NOT rolcreatedb
      AND NOT rolcreaterole
  ) THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_DEDICATED_DEFINER_ROLE_INVALID';
  END IF;

  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO spatial_rls, spatial_force_rls
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = pg_catalog.to_regclass('public.spatial_features');

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = pg_catalog.to_regclass('public.spatial_features')
      AND idx.relname = 'idx_spatial_features_geom_gist'
      AND i.indisvalid
      AND i.indisready
      AND i.indisunique = false
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnatts = 1
      AND i.indkey[0] = (
        SELECT a.attnum
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = i.indrelid
          AND a.attname = 'geom'
          AND NOT a.attisdropped
      )
      AND i.indexrelid IN (
        SELECT ix.indexrelid
        FROM pg_catalog.pg_index AS ix
        WHERE ix.indexrelid = i.indexrelid
          AND ix.indexrelid::regclass::text = 'idx_spatial_features_geom_gist'
      )
  ) INTO gist_valid;

  IF spatial_rls IS DISTINCT FROM true
     OR spatial_force_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_FORCE_RLS_REQUIRED';
  END IF;
  IF gist_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_GIST_INDEX_REQUIRED';
  END IF;
END
$preflight$;

GRANT SELECT ON TABLE public.spatial_features TO opscore_auth_definer;
SET LOCAL ROLE opscore_auth_definer;

CREATE OR REPLACE FUNCTION opscore_security.spatial_features_in_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id text,
  entity_type text,
  entity_id text,
  feature_key text,
  geom geometry(Geometry, 4326),
  properties jsonb,
  observed_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO pg_catalog, public, opscore_security, pg_temp
SET row_security = off
AS $function$
DECLARE
  verified_context jsonb;
  verified_tenant_id text;
  viewport geometry;
BEGIN
  verified_context := opscore_security.verified_rls_context();
  IF verified_context IS NULL THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_SIGNED_CONTEXT_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  verified_tenant_id := NULLIF(pg_catalog.btrim(verified_context->>'tenant_id'), '');
  IF verified_tenant_id IS NULL THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_TENANT_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF verified_context->>'access_mode' NOT IN ('field', 'backoffice') THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_ACCESS_MODE_FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  -- Finite geographic bounds and non-empty, non-antimeridian-crossing viewport.
  IF p_west IS NULL OR p_south IS NULL OR p_east IS NULL OR p_north IS NULL
     OR p_west < -180 OR p_west > 180
     OR p_east < -180 OR p_east > 180
     OR p_west >= p_east
     OR p_south < -90 OR p_south > 90
     OR p_north < -90 OR p_north > 90
     OR p_south >= p_north THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_VIEWPORT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_LIMIT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  viewport := public.ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

  -- SECURITY DEFINER owner bypasses the RLS planner barrier. This explicit
  -- equality predicate is the mandatory tenant boundary; the caller cannot
  -- supply or override verified_tenant_id. The bbox operator is indexable by
  -- GiST; ST_Intersects performs the exact geometry test after candidate scan.
  RETURN QUERY
    SELECT sf.id,
           sf.entity_type,
           sf.entity_id,
           sf.feature_key,
           sf.geom,
           sf.properties,
           sf.observed_at,
           sf.updated_at
    FROM public.spatial_features AS sf
    WHERE sf.organization_id = verified_tenant_id
      AND sf.geom && viewport
      AND public.ST_Intersects(sf.geom, viewport)
    ORDER BY sf.id
    LIMIT p_limit;
END
$function$;

-- Privileges must be adjusted while still running as the function owner.
-- Match migration 071: REVOKE/GRANT before RESET ROLE. Creating the function under
-- SET LOCAL ROLE opscore_auth_definer already sets ownership; a post-RESET
-- ALTER OWNER fails for non-superuser migrators (42501 must be owner of function).
REVOKE ALL PRIVILEGES ON FUNCTION opscore_security.spatial_features_in_viewport(
  double precision, double precision, double precision, double precision, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION opscore_security.spatial_features_in_viewport(
  double precision, double precision, double precision, double precision, integer
) TO opscore_runtime;

RESET ROLE;

-- Force application reads through the signed tenant contract. RLS continues
-- to govern all direct INSERT/UPDATE/DELETE operations on the base table.
REVOKE SELECT ON TABLE public.spatial_features FROM opscore_runtime;

COMMENT ON FUNCTION opscore_security.spatial_features_in_viewport(
  double precision, double precision, double precision, double precision, integer
) IS
  'Signed-context-only tenant-scoped spatial viewport read; no tenant parameter; bounded to 1000 rows; GiST bbox prefilter plus exact ST_Intersects.';

DO $verify$
DECLARE
  function_owner text;
  function_config text[];
  function_is_definer boolean;
  runtime_select boolean;
  runtime_execute boolean;
  public_execute boolean;
  definer_select boolean;
  rls_enabled boolean;
  rls_forced boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.proconfig, p.prosecdef
    INTO function_owner, function_config, function_is_definer
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'opscore_security.spatial_features_in_viewport(double precision,double precision,double precision,double precision,integer)'
  );

  SELECT
    pg_catalog.has_table_privilege('opscore_runtime', 'public.spatial_features', 'SELECT'),
    pg_catalog.has_function_privilege('opscore_runtime',
      'opscore_security.spatial_features_in_viewport(double precision,double precision,double precision,double precision,integer)', 'EXECUTE'),
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        (SELECT p.proacl FROM pg_catalog.pg_proc AS p
         WHERE p.oid = pg_catalog.to_regprocedure(
           'opscore_security.spatial_features_in_viewport(double precision,double precision,double precision,double precision,integer)'
         )),
        pg_catalog.acldefault('f', (
          SELECT p.proowner FROM pg_catalog.pg_proc AS p
          WHERE p.oid = pg_catalog.to_regprocedure(
            'opscore_security.spatial_features_in_viewport(double precision,double precision,double precision,double precision,integer)'
          )
        ))
      )) AS acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ),
    pg_catalog.has_table_privilege('opscore_auth_definer', 'public.spatial_features', 'SELECT')
  INTO runtime_select, runtime_execute, public_execute, definer_select;

  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO rls_enabled, rls_forced
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = 'public.spatial_features'::regclass;

  IF function_owner IS DISTINCT FROM 'opscore_auth_definer'
     OR function_is_definer IS DISTINCT FROM true
     OR NOT ('search_path=pg_catalog, public, opscore_security, pg_temp' = ANY(COALESCE(function_config, ARRAY[]::text[])))
     OR NOT ('row_security=off' = ANY(COALESCE(function_config, ARRAY[]::text[])))
     OR runtime_select IS DISTINCT FROM false
     OR runtime_execute IS DISTINCT FROM true
     OR public_execute IS DISTINCT FROM false
     OR definer_select IS DISTINCT FROM true
     OR rls_enabled IS DISTINCT FROM true
     OR rls_forced IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OPSC_SPATIAL_QUERY_SECURITY_CONTRACT_FAILED';
  END IF;
END
$verify$;

COMMIT;
