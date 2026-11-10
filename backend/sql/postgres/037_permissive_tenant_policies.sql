-- 037: Add PERMISSIVE tenant policies where only RESTRICTIVE guards exist.
-- PostgreSQL requires at least one PERMISSIVE policy for access; RESTRICTIVE-only = total deny.
-- Safe on empty or production data: policies only, no DML.

DO $$
DECLARE
  r record;
  has_org boolean;
  polname text;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.permissive = 'PERMISSIVE'
      )
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'organization_id'
    ) INTO has_org;

    polname := 'opscore_tenant_permissive';

    IF has_org THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL
         USING (
           organization_id = opscore_current_tenant()
           OR (organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system''::text, ''backoffice''::text]))
         )
         WITH CHECK (
           organization_id = opscore_current_tenant()
           OR (organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system''::text, ''backoffice''::text]))
         )',
        polname, r.table_name
      );
    ELSIF r.table_name = 'memberships' THEN
      -- memberships uses organization_id (covered by has_org); fallback kept for safety
      NULL;
    ELSE
      -- tables without organization_id: allow only system/backoffice modes (deny field by default)
      EXECUTE format(
        'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL
         USING (opscore_access_mode() = ANY (ARRAY[''system''::text, ''backoffice''::text, ''auth''::text]))
         WITH CHECK (opscore_access_mode() = ANY (ARRAY[''system''::text, ''backoffice''::text, ''auth''::text]))',
        polname, r.table_name
      );
    END IF;
  END LOOP;
END $$;
