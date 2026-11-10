-- Identity-plane FORCE RLS (auth-mode aware). Safe with login when access_mode=auth.
-- Applied after tenant organization_id policies.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions','organizations','password_reset_tokens','oidc_identities']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS opscore_identity_users ON users;
CREATE POLICY opscore_identity_users ON users FOR ALL
  USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_user())
  WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_user());

DROP POLICY IF EXISTS opscore_identity_sessions ON sessions;
DROP POLICY IF EXISTS opscore_tenant_isolation ON sessions;
CREATE POLICY opscore_identity_sessions ON sessions FOR ALL
  USING (
    opscore_access_mode() = ANY (ARRAY['auth','system','backoffice'])
    OR (
      user_id = opscore_current_user()
      AND (
        NULLIF(current_setting('app.tenant_id', true), '') IS NULL
        OR organization_id = opscore_current_tenant()
      )
    )
  )
  WITH CHECK (
    opscore_access_mode() = ANY (ARRAY['auth','system','backoffice'])
    OR (
      user_id = opscore_current_user()
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND organization_id = opscore_current_tenant()
    )
  );

DROP POLICY IF EXISTS opscore_identity_organizations ON organizations;
CREATE POLICY opscore_identity_organizations ON organizations FOR ALL
  USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_tenant())
  WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_tenant());

DROP POLICY IF EXISTS opscore_identity_password_reset ON password_reset_tokens;
CREATE POLICY opscore_identity_password_reset ON password_reset_tokens FOR ALL
  USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']))
  WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']));

DROP POLICY IF EXISTS opscore_identity_oidc ON oidc_identities;
CREATE POLICY opscore_identity_oidc ON oidc_identities FOR ALL
  USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user())
  WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user());
