-- Allow opscore_app to create temporary schemas used by isolated live RLS gates
-- on disposable preview/acceptance databases only. RLS still enforces row access.
DO $migration$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO opscore_app', current_database());
END
$migration$;

GRANT CREATE, USAGE ON SCHEMA public TO opscore_app;
