
CREATE TABLE IF NOT EXISTS ai_contact_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('web_chat','browser_voice','phone','email','whatsapp','sms')),
  language_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','waiting_human','resolved','closed','erased')),
  consent_at TIMESTAMPTZ NOT NULL,
  consent_version TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_status_activity ON ai_contact_conversations(organization_id,status,last_activity_at);
CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_language ON ai_contact_conversations(organization_id,language_code,created_at);
CREATE TABLE IF NOT EXISTS ai_contact_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES ai_contact_conversations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('customer','assistant','human','system')),
  content_ciphertext TEXT NOT NULL,
  content_iv TEXT NOT NULL,
  content_auth_tag TEXT NOT NULL,
  content_hmac TEXT NOT NULL,
  encryption_key_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  confidence DOUBLE PRECISION CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
  client_message_id TEXT,
  reply_to_message_id TEXT REFERENCES ai_contact_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id,conversation_id,actor_type,client_message_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_contact_messages_org_conversation_time ON ai_contact_messages(organization_id,conversation_id,created_at);
CREATE TABLE IF NOT EXISTS ai_contact_handoffs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES ai_contact_conversations(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('customer_requested_human','low_confidence','high_risk','policy_refusal','unresolved','repeated_failure','model_requested','voice_review_required','other')),
  reason_detail TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL CHECK(status IN ('queued','claimed','completed','cancelled')),
  requested_by TEXT NOT NULL CHECK(requested_by IN ('customer','ai','policy','system')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_contact_handoffs_org_status_priority ON ai_contact_handoffs(organization_id,status,priority,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_contact_active_handoff ON ai_contact_handoffs(organization_id,conversation_id) WHERE status IN ('queued','claimed');

