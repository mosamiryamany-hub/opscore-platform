-- 038: Ensure audit_log chain columns exist (required by backend/src/audit.js)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS previous_hash text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_hash text;
