BEGIN;

-- v0.11.56: close PostgreSQL parity gaps exposed by the release candidate gate.
CREATE TABLE IF NOT EXISTS organization_governance(
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('active','read_only','suspended','closed')),
  reason TEXT NOT NULL DEFAULT '',
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS authorization_decisions(
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  actor_user_id TEXT,
  role TEXT,
  source TEXT,
  correlation_id TEXT,
  operation_envelope_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('allow','deny')),
  reason_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_authorization_decisions_org_created
  ON authorization_decisions(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_authorization_decisions_org_resource
  ON authorization_decisions(organization_id,resource_type,resource_id);

CREATE TABLE IF NOT EXISTS operation_envelopes(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT,
  source TEXT NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  idempotency_key TEXT,
  operation TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_hash_sha256 TEXT,
  status TEXT NOT NULL CHECK(status IN ('started','committed','failed')),
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_operation_envelopes_org_started
  ON operation_envelopes(organization_id,started_at);
CREATE INDEX IF NOT EXISTS idx_operation_envelopes_correlation
  ON operation_envelopes(organization_id,correlation_id);

CREATE TABLE IF NOT EXISTS async_idempotency_reservations(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','committed','failed')),
  response_status INTEGER,
  response_json TEXT,
  operation_envelope_id TEXT REFERENCES operation_envelopes(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  UNIQUE(organization_id,actor_user_id,operation,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_async_idempotency_status
  ON async_idempotency_reservations(organization_id,status,started_at);

CREATE TABLE IF NOT EXISTS configuration_change_log(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config_id TEXT,
  config_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','activated')),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  correlation_id TEXT,
  request_hash_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_configuration_change_log_org_key
  ON configuration_change_log(organization_id,config_key,created_at);

COMMIT;
