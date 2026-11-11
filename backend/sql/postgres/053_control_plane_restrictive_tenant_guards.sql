-- 053: Correct control-plane tenant policy semantics.
-- Migration 042 created a tenant-filtered policy with the default PERMISSIVE
-- mode. A permissive policy is OR-combined with other permissive policies and
-- therefore is not a future-proof boundary guard. Keep a tenant-scoped
-- permissive policy for grants and add a separate restrictive guard so no
-- wider permissive policy can widen these three tenant-owned tables.
-- No row data is read, inserted, updated, or deleted by this migration.

DO $migration$
DECLARE
  target_schema text := current_schema();
  target_table_name text;
  required_tables text[] := ARRAY[
    'feature_flags',
    'safe_mode_states',
    'control_plane_runs'
  ];
BEGIN
  IF target_schema IS NULL THEN
    RAISE EXCEPTION 'CONTROL_PLANE_POLICY_SCHEMA_UNRESOLVED';
  END IF;

  FOREACH target_table_name IN ARRAY required_tables LOOP
    IF to_regclass(format('%I.%I', target_schema, target_table_name)) IS NULL THEN
      RAISE EXCEPTION 'CONTROL_PLANE_TABLE_MISSING:%', target_table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS cols
      WHERE cols.table_schema = target_schema
        AND cols.table_name = target_table_name
        AND cols.column_name = 'organization_id'
    ) THEN
      RAISE EXCEPTION 'CONTROL_PLANE_TENANT_KEY_MISSING:%', target_table_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target_schema, target_table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', target_schema, target_table_name);

    -- Remove both policy names first so a partial/manual prior attempt is
    -- normalized to exactly one explicit permissive policy + one restrictive guard.
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_permissive ON %I.%I', target_schema, target_table_name);
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON %I.%I', target_schema, target_table_name);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR ALL
       USING (organization_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))
       WITH CHECK (organization_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      'opscore_tenant_permissive', target_schema, target_table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL
       USING (organization_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))
       WITH CHECK (organization_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      'opscore_tenant_boundary_guard', target_schema, target_table_name
    );
  END LOOP;
END
$migration$;
