-- Runtime application credentials need DML privileges, not database/schema DDL.
-- 050 temporarily granted CREATE so the old live RLS gate could create its own schema.
-- The gate now bootstraps its rollback-only schema using the owner URL and SET LOCAL ROLE opscore_app.
DO $migration$
BEGIN
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM opscore_app', current_database());
END
$migration$;

REVOKE CREATE ON SCHEMA public FROM opscore_app;
