-- Advanced enterprise value additions: versioned operational configuration.
CREATE TABLE IF NOT EXISTS operational_configs (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text::text,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 config_key text NOT NULL,
 config_value_json jsonb NOT NULL,
 version integer NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','active','retired')),
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 description text NOT NULL DEFAULT '',
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 UNIQUE(organization_id,config_key,version)
);
CREATE INDEX IF NOT EXISTS idx_operational_configs_active ON operational_configs(organization_id,config_key,status);
