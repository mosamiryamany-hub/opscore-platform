-- Correct the session identity/tenant boundary.
-- PostgreSQL permissive policies are OR-combined. The old combination of
-- (auth OR user_id=current_user) with organization_id=current_tenant lets a user-only
-- predicate authorize a session write into another tenant. Replace both with one policy.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

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
