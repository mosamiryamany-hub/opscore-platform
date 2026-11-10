-- 036_identity_auth_access_mode_guard.sql
-- Close direct cross-tenant reads of users/sessions/OIDC identities in auth mode.
-- Password-reset tokens are handled only through narrow helpers. Auth-mode write
-- compatibility remains a documented residual and is not a blanket certification.
DO $migration$
DECLARE
  s text := current_schema();
  app_role text;
  fn_owner text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='opscore_app') THEN app_role := 'opscore_app'; END IF;
  SELECT pg_get_userbyid(p.proowner) INTO fn_owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=s AND p.proname='opscore_resolve_login_candidate'
    AND pg_get_function_identity_arguments(p.oid)='p_email_normalized text'
  LIMIT 1;

  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.opscore_count_users()
    RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=%I, pg_temp
    AS $fn$ SELECT count(*) FROM %I.users $fn$
  $ddl$,s,s,s);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_count_users() FROM PUBLIC',s);

  EXECUTE format('DROP FUNCTION IF EXISTS %I.opscore_resolve_oidc_identity(text,text)',s);
  EXECUTE format($ddl$
    CREATE FUNCTION %I.opscore_resolve_oidc_identity(p_issuer text,p_subject text)
    RETURNS TABLE(user_id text,email_at_link text,email text,status text)
    LANGUAGE sql SECURITY DEFINER SET search_path=%I,pg_temp
    AS $fn$
      SELECT i.user_id::text,i.email_at_link::text,u.email::text,u.status::text
      FROM %I.oidc_identities i JOIN %I.users u ON u.id::text=i.user_id::text
      WHERE p_issuer IS NOT NULL AND p_subject IS NOT NULL
        AND length(p_issuer)<=2048 AND length(p_subject)<=1024
        AND i.issuer=p_issuer AND i.subject=p_subject LIMIT 1
    $fn$
  $ddl$,s,s,s,s);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_resolve_oidc_identity(text,text) FROM PUBLIC',s);

  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.opscore_create_password_reset_token(
      p_id text,p_user_id text,p_token_hash text,p_expires_at timestamptz)
    RETURNS TABLE(user_id text,email text)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=%I,pg_temp
    AS $fn$
    DECLARE actor_id text:=opscore_current_user(); tenant_id text:=opscore_current_tenant();
    BEGIN
      IF opscore_access_mode()<>'field' OR actor_id IS NULL OR tenant_id IS NULL
        OR p_id IS NULL OR length(p_id)>128 OR p_user_id IS NULL OR length(p_user_id)>128
        OR p_token_hash IS NULL OR length(p_token_hash)>256
        OR p_expires_at<=clock_timestamp()
        OR p_expires_at>clock_timestamp()+interval '30 minutes' THEN RETURN; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM %I.memberships am WHERE am.user_id::text=actor_id
          AND am.organization_id::text=tenant_id AND am.role=ANY(ARRAY['owner','admin'])
      ) OR NOT EXISTS (
        SELECT 1 FROM %I.memberships tm JOIN %I.users u ON u.id::text=tm.user_id::text
        WHERE tm.user_id::text=p_user_id AND tm.organization_id::text=tenant_id AND u.status='active'
      ) THEN RETURN; END IF;
      INSERT INTO %I.password_reset_tokens(id,user_id,token_hash,expires_at,used_at,created_at)
      VALUES(p_id,p_user_id,p_token_hash,p_expires_at::text,NULL,clock_timestamp()::text);
      RETURN QUERY SELECT u.id::text,u.email::text FROM %I.users u
        WHERE u.id::text=p_user_id AND u.status='active' LIMIT 1;
    END;
    $fn$
  $ddl$,s,s,s,s,s,s,s);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) FROM PUBLIC',s);

  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.opscore_validate_password_reset_token(p_token_hash text)
    RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=%I,pg_temp
    AS $fn$
      SELECT CASE WHEN p_token_hash IS NULL OR length(p_token_hash)>256 THEN false
        ELSE EXISTS(SELECT 1 FROM %I.password_reset_tokens t
          WHERE t.token_hash=p_token_hash AND t.used_at IS NULL
            AND t.expires_at::timestamptz>clock_timestamp()) END
    $fn$
  $ddl$,s,s,s);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_validate_password_reset_token(text) FROM PUBLIC',s);

  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.opscore_consume_password_reset_token(p_token_hash text,p_password_hash text)
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=%I,pg_temp
    AS $fn$
    DECLARE target_id text; target_user text; claimed integer;
    BEGIN
      IF p_token_hash IS NULL OR length(p_token_hash)>256 OR p_password_hash IS NULL
        OR length(p_password_hash)>1024 OR left(p_password_hash,7)<>'scrypt$' THEN RETURN false; END IF;
      SELECT t.id::text,t.user_id::text INTO target_id,target_user
      FROM %I.password_reset_tokens t
      WHERE t.token_hash=p_token_hash AND t.used_at IS NULL AND t.expires_at::timestamptz>clock_timestamp()
      ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE;
      IF target_id IS NULL OR target_user IS NULL THEN RETURN false; END IF;
      UPDATE %I.users SET password_hash=p_password_hash WHERE id::text=target_user;
      IF NOT FOUND THEN RETURN false; END IF;
      UPDATE %I.password_reset_tokens SET used_at=clock_timestamp()::text
        WHERE id::text=target_id AND used_at IS NULL;
      GET DIAGNOSTICS claimed=ROW_COUNT;
      IF claimed<>1 THEN RETURN false; END IF;
      DELETE FROM %I.sessions WHERE user_id::text=target_user;
      RETURN true;
    END;
    $fn$
  $ddl$,s,s,s,s,s,s);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.opscore_consume_password_reset_token(text,text) FROM PUBLIC',s);

  IF fn_owner IS NOT NULL THEN
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.opscore_count_users() OWNER TO %I',s,fn_owner);
      EXECUTE format('ALTER FUNCTION %I.opscore_resolve_oidc_identity(text,text) OWNER TO %I',s,fn_owner);
      EXECUTE format('ALTER FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) OWNER TO %I',s,fn_owner);
      EXECUTE format('ALTER FUNCTION %I.opscore_validate_password_reset_token(text) OWNER TO %I',s,fn_owner);
      EXECUTE format('ALTER FUNCTION %I.opscore_consume_password_reset_token(text,text) OWNER TO %I',s,fn_owner);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  IF app_role IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_count_users() TO %I',s,app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_resolve_oidc_identity(text,text) TO %I',s,app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_create_password_reset_token(text,text,text,timestamptz) TO %I',s,app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_validate_password_reset_token(text) TO %I',s,app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.opscore_consume_password_reset_token(text,text) TO %I',s,app_role);
  END IF;

  -- Users: self or the explicitly bound tenant only; never all rows merely due to auth mode.
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users ON %I.users',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users_select ON %I.users',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users_insert ON %I.users',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users_update ON %I.users',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users_delete ON %I.users',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_users_select_guard ON %I.users',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_users_select ON %I.users FOR SELECT USING (' ||
    'id::text=opscore_current_user() OR (NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=users.id::text ' ||
    'AND m.organization_id::text=opscore_current_tenant())))',s,s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_users_select_guard ON %I.users AS RESTRICTIVE FOR SELECT USING (' ||
    'id::text=opscore_current_user() OR (NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=users.id::text ' ||
    'AND m.organization_id::text=opscore_current_tenant())))',s,s);
  -- INSERT/UPDATE/DELETE retain compatibility branches for bootstrap and invitation flows.
  EXECUTE format('CREATE POLICY opscore_identity_users_insert ON %I.users FOR INSERT WITH CHECK (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR id::text=opscore_current_user())',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_users_update ON %I.users FOR UPDATE USING (' ||
    'opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR id::text=opscore_current_user() OR ' ||
    'EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=users.id::text AND m.organization_id::text=opscore_current_tenant())) ' ||
    'WITH CHECK (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR id::text=opscore_current_user() OR ' ||
    'EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=users.id::text AND m.organization_id::text=opscore_current_tenant()))',s,s,s);
  EXECUTE format('CREATE POLICY opscore_identity_users_delete ON %I.users FOR DELETE USING (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR id::text=opscore_current_user())',s);

  -- Sessions: direct access always requires both the same user and the same tenant.
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions_select ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions_insert ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions_update ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions_delete ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_sessions_select_guard ON %I.sessions',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_session_boundary_guard ON %I.sessions',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_sessions_select ON %I.sessions FOR SELECT USING (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_sessions_select_guard ON %I.sessions AS RESTRICTIVE FOR SELECT USING (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);
  EXECUTE format(
    'CREATE POLICY opscore_session_boundary_guard ON %I.sessions AS RESTRICTIVE FOR ALL USING (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant()) WITH CHECK (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_sessions_insert ON %I.sessions FOR INSERT WITH CHECK (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_sessions_update ON %I.sessions FOR UPDATE USING (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant()) WITH CHECK (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_sessions_delete ON %I.sessions FOR DELETE USING (' ||
    'user_id::text=opscore_current_user() AND NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND organization_id::text=opscore_current_tenant())',s);

  -- OIDC direct reads are self/same-tenant only. Mutation auth-mode compatibility remains disclosed.
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc ON %I.oidc_identities',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc_select ON %I.oidc_identities',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc_insert ON %I.oidc_identities',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc_update ON %I.oidc_identities',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc_delete ON %I.oidc_identities',s);
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_oidc_select_guard ON %I.oidc_identities',s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_oidc_select ON %I.oidc_identities FOR SELECT USING (' ||
    'user_id::text=opscore_current_user() OR (NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=oidc_identities.user_id::text ' ||
    'AND m.organization_id::text=opscore_current_tenant())))',s,s);
  EXECUTE format(
    'CREATE POLICY opscore_identity_oidc_select_guard ON %I.oidc_identities AS RESTRICTIVE FOR SELECT USING (' ||
    'user_id::text=opscore_current_user() OR (NULLIF(current_setting(''app.tenant_id'',true),'''') IS NOT NULL ' ||
    'AND EXISTS(SELECT 1 FROM %I.memberships m WHERE m.user_id::text=oidc_identities.user_id::text ' ||
    'AND m.organization_id::text=opscore_current_tenant())))',s,s);
  EXECUTE format('CREATE POLICY opscore_identity_oidc_insert ON %I.oidc_identities FOR INSERT WITH CHECK (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR user_id::text=opscore_current_user())',s);
  EXECUTE format('CREATE POLICY opscore_identity_oidc_update ON %I.oidc_identities FOR UPDATE USING (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR user_id::text=opscore_current_user()) WITH CHECK (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR user_id::text=opscore_current_user())',s);
  EXECUTE format('CREATE POLICY opscore_identity_oidc_delete ON %I.oidc_identities FOR DELETE USING (opscore_access_mode()=ANY(ARRAY[''auth'',''system'',''backoffice'']) OR user_id::text=opscore_current_user())',s);

  -- Reset-token hashes are not directly readable, regardless of access-mode GUC.
  EXECUTE format('DROP POLICY IF EXISTS opscore_password_reset_select_guard ON %I.password_reset_tokens',s);
  EXECUTE format('CREATE POLICY opscore_password_reset_select_guard ON %I.password_reset_tokens AS RESTRICTIVE FOR SELECT USING (false)',s);
END
$migration$;
