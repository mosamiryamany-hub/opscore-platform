-- Bridge required before 032 on clean installs: sessions.organization_id
-- Canonical 000 schema predates org-bound sessions; production login requires this column.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(organization_id, expires_at);
