-- 041_access_mode_guc_hardening.sql
-- Fail-closed contract for the RLS access-mode GUC plane (app.access_mode).
-- No DML, no policy rewrites, no lock escalation. Idempotent; safe on live data.
--
-- WHY: the access-mode GUC is written on pooled sessions (is_local=false). A stale
-- 'system'/'backoffice' value left behind on a reused connection would widen the
-- system-plane branch of every *_tenant_permissive policy. This migration makes the
-- contract explicit: only the four canonical values are honoured, anything else
-- (unknown, uppercase, truncated, stale) resolves to '' => deny.

CREATE OR REPLACE FUNCTION opscore_access_mode() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.access_mode', true) IN ('field','auth','system','backoffice')
      THEN current_setting('app.access_mode', true)
    ELSE ''
  END;
$$;

COMMENT ON FUNCTION opscore_access_mode() IS
  'Fail-closed RLS access-mode contract (041): only field/auth/system/backoffice are honoured; any other or stale value resolves to empty string => deny.';

CREATE OR REPLACE FUNCTION opscore_access_mode_is_valid() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT opscore_access_mode() <> '';
$$;

-- Single atomic reset of the whole RLS context plane (used on pool release / fail-closed paths).
CREATE OR REPLACE FUNCTION opscore_reset_session_context() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.access_mode', '', false);
  PERFORM set_config('app.tenant_id', '', false);
  PERFORM set_config('app.current_tenant_id', '', false);
  PERFORM set_config('app.organization_id', '', false);
  PERFORM set_config('app.user_id', '', false);
END $$;

-- Proof predicate: a connection returned to the pool must satisfy this.
CREATE OR REPLACE FUNCTION opscore_session_context_clean() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.access_mode', true), '') = ''
     AND COALESCE(current_setting('app.tenant_id', true), '') = ''
     AND COALESCE(current_setting('app.current_tenant_id', true), '') = ''
     AND COALESCE(current_setting('app.organization_id', true), '') = ''
     AND COALESCE(current_setting('app.user_id', true), '') = '';
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['opscore_app','opscore_gate']) AS role_name LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION opscore_access_mode() TO %I', r.role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION opscore_access_mode_is_valid() TO %I', r.role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION opscore_reset_session_context() TO %I', r.role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION opscore_session_context_clean() TO %I', r.role_name);
    END IF;
  END LOOP;
END $$;
