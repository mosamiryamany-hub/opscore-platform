-- OpsCore runtime performance hardening.
-- This migration is additive and preserves existing identifiers and contracts.

-- Queue workers claim rows in deterministic order without blocking other workers.
CREATE OR REPLACE FUNCTION opscore_claim_operational_jobs(
  p_organization_id TEXT,
  p_queue_name TEXT,
  p_limit INTEGER DEFAULT 25,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS SETOF operational_jobs
LANGUAGE SQL
VOLATILE
AS $$
  WITH candidates AS (
    SELECT id
    FROM operational_jobs
    WHERE organization_id = p_organization_id
      AND queue_name = p_queue_name
      AND status = 'queued'
      AND available_at::timestamptz <= now()
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  UPDATE operational_jobs j
     SET status = 'processing',
         lease_until = (now() + make_interval(secs => GREATEST(1, LEAST(p_lease_seconds, 3600))))::text,
         attempts = j.attempts + 1,
         updated_at = now()
    FROM candidates c
   WHERE j.id = c.id
  RETURNING j.*
$$;

CREATE INDEX IF NOT EXISTS idx_operational_jobs_claim
  ON operational_jobs(organization_id, queue_name, created_at, id)
  WHERE status = 'queued';

ALTER TABLE operational_jobs
  SET (autovacuum_vacuum_scale_factor = 0.05);

-- Stable case-insensitive lookup support for users (email is globally unique in canonical schema).
CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email));
