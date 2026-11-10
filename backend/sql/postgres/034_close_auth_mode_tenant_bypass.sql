-- Tenant-boundary hardening for PostgreSQL RLS.
-- Restrictive policies are AND-combined with permissive policies, preventing an
-- app.access_mode='auth' condition from overriding organization_id boundaries.
DO $migration$
DECLARE
  target_schema text := current_schema();
  tenant_table record;
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS opscore_identity_organizations ON %I.organizations', target_schema);
  EXECUTE format(
    'CREATE POLICY opscore_identity_organizations ON %I.organizations FOR ALL ' ||
    'USING (id::text = opscore_current_tenant()) ' ||
    'WITH CHECK (id::text = opscore_current_tenant())',
    target_schema
  );
  EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON %I.organizations', target_schema);
  EXECUTE format(
    'CREATE POLICY opscore_tenant_boundary_guard ON %I.organizations AS RESTRICTIVE FOR ALL ' ||
    'USING (id::text = opscore_current_tenant()) ' ||
    'WITH CHECK (id::text = opscore_current_tenant())',
    target_schema
  );

  FOR tenant_table IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = target_schema
      AND c.relkind IN ('r','p')
      AND a.attname = 'organization_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> 'sessions'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target_schema, tenant_table.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', target_schema, tenant_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON %I.%I', target_schema, tenant_table.relname);
    EXECUTE format(
      'CREATE POLICY opscore_tenant_boundary_guard ON %I.%I AS RESTRICTIVE FOR ALL ' ||
      'USING (organization_id::text = opscore_current_tenant() OR ' ||
      '(organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system'',''backoffice'']))) ' ||
      'WITH CHECK (organization_id::text = opscore_current_tenant() OR ' ||
      '(organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system'',''backoffice''])))',
      target_schema, tenant_table.relname
    );
  END LOOP;
END
$migration$;
