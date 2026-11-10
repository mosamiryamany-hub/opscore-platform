-- Restrict migration history to the owner/migration operator.
DO $migration$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'public.schema_migrations is required before migration 046';
  END IF;
END
$migration$;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opscore_schema_migrations_owner_only ON public.schema_migrations;
CREATE POLICY opscore_schema_migrations_owner_only
  ON public.schema_migrations
  FOR ALL
  TO neondb_owner
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM opscore_app;
