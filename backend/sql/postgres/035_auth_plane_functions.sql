-- 035_auth_plane_functions.sql
-- SECURITY DEFINER auth-plane helpers for pre-tenant identity resolution.
-- Schema-neutral. Under FORCE RLS the function owner MUST have BYPASSRLS
-- (or be superuser). We create opscore_auth_definer WITH BYPASSRLS when permitted.

DO $migration$
DECLARE
  target_schema text := current_schema();
  app_role text;
  definer_role text := 'opscore_auth_definer';
  has_gov boolean;
  owner_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opscore_app') THEN
    app_role := 'opscore_app';
  ELSE
    app_role := NULL;
  END IF;

  -- Prefer a dedicated BYPASSRLS owner so FORCE RLS does not hide rows from DEFINER body.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = definer_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS', definer_role);
    ELSE
      -- Ensure BYPASSRLS stays on if we can alter it.
      BEGIN
        EXECUTE format('ALTER ROLE %I WITH BYPASSRLS', definer_role);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    EXECUTE format('GRANT %I TO CURRENT_USER', definer_role);
    owner_name := definer_role;
  EXCEPTION WHEN OTHERS THEN
    -- Cannot create BYPASSRLS role (not superuser). Fall back to current user;
    -- production neondb_owner already has BYPASSRLS and works.
    owner_name := NULL;
  END;

  has_gov := to_regclass(format('%I.organization_governance', target_schema)) IS NOT NULL;

  -- Grant table privileges to definer role when it exists
  IF owner_name IS NOT NULL THEN
    BEGIN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', target_schema, owner_name);
      EXECUTE format('GRANT SELECT ON TABLE %I.users, %I.memberships, %I.organizations, %I.sessions TO %I',
        target_schema, target_schema, target_schema, target_schema, owner_name);
      EXECUTE format('GRANT SELECT, DELETE ON TABLE %I.sessions TO %I', target_schema, owner_name);
      IF has_gov THEN
        EXECUTE format('GRANT SELECT ON TABLE %I.organization_governance TO %I', target_schema, owner_name);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.opscore_resolve_login_candidate(p_email_normalized text)
     RETURNS TABLE (id text, email text, status text, password_hash text)
     LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $body$
     BEGIN
       IF p_email_normalized IS NULL OR length(btrim(p_email_normalized)) = 0 OR length(p_email_normalized) > 320 THEN RETURN; END IF;
       RETURN QUERY SELECT u.id, u.email, u.status, u.password_hash FROM %I.users u
         WHERE lower(u.email) = lower(btrim(p_email_normalized)) LIMIT 1;
     END; $body$',
    target_schema, target_schema, target_schema);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_resolve_login_candidate(text) FROM PUBLIC', target_schema);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_resolve_login_candidate(text) TO CURRENT_USER', target_schema);
  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_resolve_login_candidate(text) TO %I', target_schema, app_role);
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.opscore_list_memberships_for_user(p_user_id text)
     RETURNS TABLE (organization_id text, role text, org_name text, created_at text)
     LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $body$
     BEGIN
       IF p_user_id IS NULL OR length(btrim(p_user_id)) = 0 OR length(p_user_id) > 128 THEN RETURN; END IF;
       RETURN QUERY
         SELECT m.organization_id, m.role, o.name AS org_name, m.created_at
         FROM %I.memberships m
         INNER JOIN %I.organizations o ON o.id = m.organization_id
         WHERE m.user_id = btrim(p_user_id)
         ORDER BY m.created_at, m.organization_id;
     END; $body$',
    target_schema, target_schema, target_schema, target_schema);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_list_memberships_for_user(text) FROM PUBLIC', target_schema);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_list_memberships_for_user(text) TO CURRENT_USER', target_schema);
  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_list_memberships_for_user(text) TO %I', target_schema, app_role);
  END IF;

  IF has_gov THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.opscore_resolve_session_by_token_hash(p_token_hash text)
       RETURNS TABLE (session_id text, expires_at text, user_id text, email text, organization_id text, role text, org_name text, organization_status text)
       LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $body$
       BEGIN
         IF p_token_hash IS NULL OR length(btrim(p_token_hash)) = 0 OR length(p_token_hash) > 256 THEN RETURN; END IF;
         RETURN QUERY
           SELECT s.id, s.expires_at, u.id, u.email, s.organization_id, m.role, o.name, COALESCE(g.status, ''active'')
           FROM %I.sessions s
           INNER JOIN %I.users u ON u.id = s.user_id
           INNER JOIN %I.memberships m ON m.user_id = s.user_id AND m.organization_id = s.organization_id
           INNER JOIN %I.organizations o ON o.id = s.organization_id
           LEFT JOIN %I.organization_governance g ON g.organization_id = s.organization_id
           WHERE s.token_hash = btrim(p_token_hash) AND u.status = ''active'' LIMIT 1;
       END; $body$',
      target_schema, target_schema, target_schema, target_schema, target_schema, target_schema, target_schema);
  ELSE
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.opscore_resolve_session_by_token_hash(p_token_hash text)
       RETURNS TABLE (session_id text, expires_at text, user_id text, email text, organization_id text, role text, org_name text, organization_status text)
       LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $body$
       BEGIN
         IF p_token_hash IS NULL OR length(btrim(p_token_hash)) = 0 OR length(p_token_hash) > 256 THEN RETURN; END IF;
         RETURN QUERY
           SELECT s.id, s.expires_at, u.id, u.email, s.organization_id, m.role, o.name, ''active''::text
           FROM %I.sessions s
           INNER JOIN %I.users u ON u.id = s.user_id
           INNER JOIN %I.memberships m ON m.user_id = s.user_id AND m.organization_id = s.organization_id
           INNER JOIN %I.organizations o ON o.id = s.organization_id
           WHERE s.token_hash = btrim(p_token_hash) AND u.status = ''active'' LIMIT 1;
       END; $body$',
      target_schema, target_schema, target_schema, target_schema, target_schema, target_schema);
  END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_resolve_session_by_token_hash(text) FROM PUBLIC', target_schema);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_resolve_session_by_token_hash(text) TO CURRENT_USER', target_schema);
  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_resolve_session_by_token_hash(text) TO %I', target_schema, app_role);
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.opscore_revoke_session_by_token_hash(p_token_hash text)
     RETURNS TABLE (session_id text, user_id text, organization_id text)
     LANGUAGE plpgsql SECURITY DEFINER SET search_path = %I, pg_temp AS $body$
     BEGIN
       IF p_token_hash IS NULL OR length(btrim(p_token_hash)) = 0 OR length(p_token_hash) > 256 THEN RETURN; END IF;
       RETURN QUERY
         WITH deleted AS (
           DELETE FROM %I.sessions s WHERE s.token_hash = btrim(p_token_hash)
           RETURNING s.id, s.user_id, s.organization_id
         )
         SELECT d.id, d.user_id, d.organization_id FROM deleted d;
     END; $body$',
    target_schema, target_schema, target_schema);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_revoke_session_by_token_hash(text) FROM PUBLIC', target_schema);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_revoke_session_by_token_hash(text) TO CURRENT_USER', target_schema);
  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_revoke_session_by_token_hash(text) TO %I', target_schema, app_role);
  END IF;

  -- Transfer ownership to BYPASSRLS definer role when available
  IF owner_name IS NOT NULL THEN
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.opscore_resolve_login_candidate(text) OWNER TO %I', target_schema, owner_name);
      EXECUTE format('ALTER FUNCTION %I.opscore_list_memberships_for_user(text) OWNER TO %I', target_schema, owner_name);
      EXECUTE format('ALTER FUNCTION %I.opscore_resolve_session_by_token_hash(text) OWNER TO %I', target_schema, owner_name);
      EXECUTE format('ALTER FUNCTION %I.opscore_revoke_session_by_token_hash(text) OWNER TO %I', target_schema, owner_name);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- keep CURRENT_USER ownership (production neondb_owner is BYPASSRLS)
    END;
  END IF;
END
$migration$;
