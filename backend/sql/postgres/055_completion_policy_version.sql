-- 055: Add the version column required by completion-policy history.
-- Store reads, increments and writes this value when a policy is changed.
-- Additive and repeat-safe for preview databases with partial schema drift.

ALTER TABLE public.completion_policies
  ADD COLUMN IF NOT EXISTS version INTEGER;

UPDATE public.completion_policies
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.completion_policies
  ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE public.completion_policies
  ALTER COLUMN version SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.completion_policies'::regclass
      AND conname = 'completion_policies_version_positive'
  ) THEN
    ALTER TABLE public.completion_policies
      ADD CONSTRAINT completion_policies_version_positive
      CHECK (version >= 1) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE public.completion_policies
  VALIDATE CONSTRAINT completion_policies_version_positive;
