-- OpsCore v0.11.61: governed 2026 operational extensions.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS asset_health_snapshots (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, asset_id TEXT NOT NULL,
 risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')),
 risk_score INTEGER NOT NULL CHECK(risk_score BETWEEN 0 AND 100), factors_json TEXT NOT NULL,
 assessment_sha256 TEXT NOT NULL, assessed_at TIMESTAMPTZ NOT NULL, assessed_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_health_org_asset_time ON asset_health_snapshots(organization_id,asset_id,assessed_at DESC);
CREATE TABLE IF NOT EXISTS self_schedule_links (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, work_order_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_self_schedule_org_wo ON self_schedule_links(organization_id,work_order_id,expires_at,revoked_at);
CREATE TABLE IF NOT EXISTS self_schedule_bookings (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, link_id TEXT NOT NULL, work_order_id TEXT NOT NULL,
 appointment_id TEXT, slot_sha256 TEXT NOT NULL, idempotency_key TEXT UNIQUE, start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
 technician_id TEXT, status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','cancelled')), created_at TIMESTAMPTZ NOT NULL,
 UNIQUE(organization_id,slot_sha256)
);
CREATE TABLE IF NOT EXISTS ai_agent_runs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, model TEXT,
 request_sha256 TEXT NOT NULL, response_sha256 TEXT, tool_calls_json TEXT NOT NULL DEFAULT '[]', proposal_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('completed','failed','blocked')), error_code TEXT, created_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS opscore_knowledge_chunks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
 content TEXT NOT NULL, content_sha256 TEXT NOT NULL, embedding vector, metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source_type,source_id,content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_opscore_knowledge_org_source ON opscore_knowledge_chunks(organization_id,source_type,created_at DESC);
