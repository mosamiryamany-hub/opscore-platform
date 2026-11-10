-- OpsCore v0.11.57: generalize the service-line external reference field.
-- The endpoint/resource remains service-lines; only the field name is generalized.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='service_lines' AND column_name='network_ref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='service_lines' AND column_name='service_ref'
  ) THEN
    ALTER TABLE service_lines RENAME COLUMN network_ref TO service_ref;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='service_lines' AND column_name='service_ref'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='service_lines'
  ) THEN
    ALTER TABLE service_lines ADD COLUMN service_ref TEXT;
  END IF;
END $$;
