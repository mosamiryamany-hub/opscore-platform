-- Controlled password-reset token minting under FORCE RLS.
-- Root cause: opscore_create_password_reset_token requires access_mode=field, while
-- opscore_identity_password_reset only allows auth/system/backoffice writes. On
-- engines without BYPASSRLS for the function owner, INSERT fails closed and the
-- HTTP surface maps the exception to 400 BAD_REQUEST.
-- Fix: recreate the function with SET row_security=off (SECURITY DEFINER only),
-- keep SELECT USING (false) for non-definer sessions, and tighten expiry to <30m.

DO $migration$
DECLARE
  s text := current_schema();
  app_role text := NULLIF(current_setting('opscore.app_role', true), '');
  fn_owner text := NULLIF(current_setting('opscore.fn_owner', true), '');
BEGIN
  IF to_regclass(format('%I.password_reset_tokens', s)) IS NULL THEN
    RAISE EXCEPTION 'password_reset_tokens missing in schema %', s;
  END IF;

  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.opscore_create_password_reset_token(
      p_id text, p_user_id text, p_token_hash text, p_expires_at timestamptz)
    RETURNS TABLE(user_id text, email text)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = %I, pg_temp
    SET row_security = off
    AS $fn$
    DECLARE
      actor_id text := opscore_current_user();
      tenant_id text := opscore_current_tenant();
    BEGIN
      -- field mode only; expiry must be in the future and strictly under 30 minutes
      IF opscore_access_mode() <> 'field'
         OR actor_id IS NULL OR tenant_id IS NULL
         OR p_id IS NULL OR length(p_id) > 128
         OR p_user_id IS NULL OR length(p_user_id) > 128
         OR p_token_hash IS NULL OR length(p_token_hash) > 256
         OR p_expires_at <= clock_timestamp()
         OR p_expires_at >= clock_timestamp() + interval '30 minutes' THEN
        RETURN;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM %I.memberships am
        WHERE am.user_id::text = actor_id
          AND am.organization_id::text = tenant_id
          AND am.role = ANY (ARRAY['owner','admin'])
      ) OR NOT EXISTS (
        SELECT 1
        FROM %I.memberships tm
        JOIN %I.users u ON u.id::text = tm.user_id::text
        WHERE tm.user_id::text = p_user_id
          AND tm.organization_id::text = tenant_id
          AND u.status = 'active'
      ) THEN
        RETURN;
      END IF;

      INSERT INTO %I.password_reset_tokens(id, user_id, token_hash, expires_at, used_at, created_at)
      VALUES (p_id, p_user_id, p_token_hash, p_expires_at::text, NULL, clock_timestamp()::text);

      RETURN QUERY
        SELECT u.id::text, u.email::text
        FROM %I.users u
        WHERE u.id::text = p_user_id AND u.status = 'active'
        LIMIT 1;
    END;
    $fn$
  $ddl$, s, s, s, s, s, s, s);

  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) FROM PUBLIC', s);

  IF fn_owner IS NOT NULL THEN
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) OWNER TO %I', s, fn_owner);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) TO %I', s, app_role);
  END IF;
END
$migration$;
