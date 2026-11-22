-- Allow opscore_app to create temporary schemas used by isolated live RLS gates
-- on disposable preview/acceptance databases only. RLS still enforces row access.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='opscore_app') THEN
    EXECUTE format('GRANT CREATE ON DATABASE %I TO opscore_app', current_database());
    EXECUTE 'GRANT CREATE, USAGE ON SCHEMA public TO opscore_app';
  END IF;
END
$migration$;
