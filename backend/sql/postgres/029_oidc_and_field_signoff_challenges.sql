
CREATE TABLE IF NOT EXISTS oidc_identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_at_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(issuer,subject)
);
CREATE INDEX IF NOT EXISTS idx_oidc_identities_user ON oidc_identities(user_id,issuer);

CREATE TABLE IF NOT EXISTS field_signoff_challenges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  challenge_hash TEXT NOT NULL UNIQUE,
  document_sha256 TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_field_signoff_challenges_org_wo ON field_signoff_challenges(organization_id,work_order_id,expires_at,consumed_at);
