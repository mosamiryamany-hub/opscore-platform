'use strict';
const {warn}=require('./observability');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const { CURRENT_SCHEMA_VERSION } = require('./schema-version');
const config = require('./config');
function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}
function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${ table })`).all().map(x => x.name);
  if (!cols.includes(column))
    db.exec(`ALTER TABLE ${ table } ADD COLUMN ${ column } ${ definition }`);
}
const schema = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organization_governance (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('active','read_only','suspended','closed')), reason TEXT NOT NULL DEFAULT '', changed_by TEXT REFERENCES users(id) ON DELETE SET NULL, changed_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','member','viewer')), created_at TEXT NOT NULL, PRIMARY KEY(user_id, organization_id));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oidc_identities (id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email_at_link TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(issuer,subject));
CREATE INDEX IF NOT EXISTS idx_oidc_identities_user ON oidc_identities(user_id,issuer);
CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','member','viewer')), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, accepted_at TEXT, invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT, phone TEXT, external_ref TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, name TEXT NOT NULL, address TEXT, latitude REAL, longitude REAL, geojson TEXT, external_ref TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));
CREATE TABLE IF NOT EXISTS work_orders (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, number TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','completed','cancelled')), priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')), customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, site_id TEXT REFERENCES sites(id) ON DELETE SET NULL, assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL, team_name TEXT, due_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completion_policy_id TEXT, completion_policy_version INTEGER);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, asset_type TEXT NOT NULL, external_ref TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','retired')), site_id TEXT REFERENCES sites(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL, event_type TEXT NOT NULL CHECK(event_type IN ('installed','inspection','service','failure','repair','retired','note')), occurred_at TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, latitude REAL, longitude REAL, geojson TEXT, created_at TEXT NOT NULL, CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));
CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL, message TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT REFERENCES work_orders(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, storage_provider TEXT NOT NULL CHECK(storage_provider IN ('local')), storage_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, media_type TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes >= 0), sha256 TEXT NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel TEXT NOT NULL CHECK(channel IN ('in_app','email','webhook')), event_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','accepted','delivered','failed','read')), created_at TEXT NOT NULL, read_at TEXT);
CREATE TABLE IF NOT EXISTS webhook_endpoints (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, url TEXT NOT NULL, secret_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_deliveries (id TEXT PRIMARY KEY, endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','accepted','delivered','failed')), attempts INTEGER NOT NULL DEFAULT 0, response_code INTEGER, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS integration_outbox (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, event_key TEXT NOT NULL, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','processing','delivered','failed')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, delivered_at TEXT, UNIQUE(organization_id,event_key));
CREATE INDEX IF NOT EXISTS idx_integration_outbox_status_created ON integration_outbox(organization_id,status,created_at);
CREATE TABLE IF NOT EXISTS evidence_uploads (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, file_name TEXT NOT NULL, media_type TEXT NOT NULL, total_bytes INTEGER NOT NULL CHECK(total_bytes > 0), expected_sha256 TEXT NOT NULL, received_bytes INTEGER NOT NULL DEFAULT 0 CHECK(received_bytes >= 0), chunk_size INTEGER NOT NULL CHECK(chunk_size > 0), total_chunks INTEGER NOT NULL CHECK(total_chunks > 0), status TEXT NOT NULL CHECK(status IN ('initiated','uploading','ready','committed','failed','expired')), storage_key TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, committed_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL, last_error TEXT);
CREATE INDEX IF NOT EXISTS idx_evidence_uploads_org_wo_status ON evidence_uploads(organization_id,work_order_id,status);
CREATE TABLE IF NOT EXISTS evidence_upload_chunks (upload_id TEXT NOT NULL REFERENCES evidence_uploads(id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0), bytes INTEGER NOT NULL CHECK(bytes > 0), sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, PRIMARY KEY(upload_id,chunk_index));
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, organization_id TEXT, actor_user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS authorization_decisions (id TEXT PRIMARY KEY, organization_id TEXT, actor_user_id TEXT, role TEXT, source TEXT, correlation_id TEXT, operation_envelope_id TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, decision TEXT NOT NULL CHECK(decision IN ('allow','deny')), reason_code TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_authorization_decisions_org_created ON authorization_decisions(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_authorization_decisions_org_resource ON authorization_decisions(organization_id,resource_type,resource_id);
CREATE TABLE IF NOT EXISTS operation_envelopes (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, role TEXT, source TEXT NOT NULL, correlation_id TEXT, causation_id TEXT, idempotency_key TEXT, operation TEXT NOT NULL, resource_type TEXT, resource_id TEXT, request_hash_sha256 TEXT, status TEXT NOT NULL CHECK(status IN ('started','committed','failed')), error_code TEXT, started_at TEXT NOT NULL, completed_at TEXT, UNIQUE(organization_id,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_operation_envelopes_org_started ON operation_envelopes(organization_id,started_at);
CREATE INDEX IF NOT EXISTS idx_operation_envelopes_correlation ON operation_envelopes(organization_id,correlation_id);
CREATE TABLE IF NOT EXISTS pdf_signatures (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, document_type TEXT NOT NULL, document_id TEXT NOT NULL, document_sha256 TEXT NOT NULL, algorithm TEXT NOT NULL, signer_id TEXT NOT NULL, signature_base64url TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,document_type,document_id,document_sha256));
CREATE INDEX IF NOT EXISTS idx_pdf_signatures_doc ON pdf_signatures(organization_id,document_type,document_id,created_at);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, scopes_json TEXT NOT NULL DEFAULT '[]', expires_at TEXT, revoked_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE IF NOT EXISTS rate_limit_buckets (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, api_key_id TEXT REFERENCES api_keys(id) ON DELETE CASCADE, bucket_key TEXT NOT NULL, window_start TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, UNIQUE(organization_id, bucket_key, window_start));
CREATE TABLE IF NOT EXISTS entitlements (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, plan TEXT NOT NULL, limits_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage_counters (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, metric TEXT NOT NULL, period_start TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id, metric, period_start));
CREATE TABLE IF NOT EXISTS stripe_billing (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, stripe_customer_id TEXT UNIQUE, stripe_subscription_id TEXT UNIQUE, status TEXT NOT NULL, plan TEXT NOT NULL, price_id TEXT, current_period_end TEXT, last_event_created INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stripe_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, organization_id TEXT, created_at TEXT NOT NULL, event_created INTEGER NOT NULL DEFAULT 0, payload_sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stripe_events_org_created ON stripe_events(organization_id, created_at);
CREATE TABLE IF NOT EXISTS custom_fields (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, field_key TEXT NOT NULL, label TEXT NOT NULL, field_type TEXT NOT NULL CHECK(field_type IN ('text','number','boolean','date','select')), options_json TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id, entity_type, field_key));
CREATE TABLE IF NOT EXISTS custom_field_values (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE, value_text TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id, entity_type, entity_id, field_id));
CREATE TABLE IF NOT EXISTS saved_views (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, entity_type TEXT NOT NULL, filters_json TEXT NOT NULL DEFAULT '{}', columns_json TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deleted_records (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, deleted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, deleted_at TEXT NOT NULL, restored_at TEXT);
CREATE TABLE IF NOT EXISTS password_reset_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);



CREATE TABLE IF NOT EXISTS workflow_definitions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, entity_type TEXT NOT NULL CHECK(entity_type='work_order'), statuses_json TEXT NOT NULL, transitions_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workflow_transition_log (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE, entity_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, reason TEXT, workflow_version INTEGER, decision_hash TEXT);
CREATE TABLE IF NOT EXISTS workflow_versions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(workflow_id,version));
CREATE TABLE IF NOT EXISTS completion_policies (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, work_type TEXT NOT NULL DEFAULT '*', require_customer_signoff INTEGER NOT NULL DEFAULT 0 CHECK(require_customer_signoff IN (0,1)), require_safety_acknowledgement INTEGER NOT NULL DEFAULT 0 CHECK(require_safety_acknowledgement IN (0,1)), require_procedure_completion INTEGER NOT NULL DEFAULT 0 CHECK(require_procedure_completion IN (0,1)), require_evidence INTEGER NOT NULL DEFAULT 0 CHECK(require_evidence IN (0,1)), require_first_time_right INTEGER NOT NULL DEFAULT 0 CHECK(require_first_time_right IN (0,1)), min_evidence_count INTEGER NOT NULL DEFAULT 0 CHECK(min_evidence_count >= 0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(organization_id,work_type));
CREATE TABLE IF NOT EXISTS completion_policy_versions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, completion_policy_id TEXT NOT NULL REFERENCES completion_policies(id) ON DELETE CASCADE, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(completion_policy_id,version));
CREATE INDEX IF NOT EXISTS idx_completion_policy_versions_org ON completion_policy_versions(organization_id,completion_policy_id,version);
CREATE INDEX IF NOT EXISTS idx_completion_policy_org ON completion_policies(organization_id,active,work_type);
CREATE TABLE IF NOT EXISTS escalation_rules (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, trigger_type TEXT NOT NULL CHECK(trigger_type IN ('sla_at_risk','sla_breached','stuck_work_order')), threshold_minutes INTEGER NOT NULL DEFAULT 0 CHECK(threshold_minutes >= 0), priority TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS escalations (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, rule_id TEXT REFERENCES escalation_rules(id) ON DELETE SET NULL, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, trigger_type TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('warning','critical')), status TEXT NOT NULL CHECK(status IN ('open','acknowledged','resolved')), reason TEXT NOT NULL, created_at TEXT NOT NULL, acknowledged_at TEXT, resolved_at TEXT, UNIQUE(organization_id,work_order_id,trigger_type,status));
CREATE TABLE IF NOT EXISTS procedure_definitions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, work_type TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, steps_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS procedure_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, procedure_id TEXT NOT NULL REFERENCES procedure_definitions(id) ON DELETE RESTRICT, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, status TEXT NOT NULL CHECK(status IN ('in_progress','completed','failed')), completed_steps INTEGER NOT NULL DEFAULT 0, evidence_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_workflow_org ON workflow_definitions(organization_id,active);
CREATE INDEX IF NOT EXISTS idx_escalation_org ON escalations(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_procedure_org ON procedure_definitions(organization_id,active);
CREATE INDEX IF NOT EXISTS idx_procedure_runs_wo ON procedure_runs(organization_id,work_order_id,started_at);

CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_org_status ON work_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_events_org_asset ON asset_events(organization_id,asset_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_asset_events_wo ON asset_events(organization_id,work_order_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_wo ON comments(organization_id, work_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(organization_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(organization_id, endpoint_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_log(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_usage_org_metric ON usage_counters(organization_id, metric, period_start);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org ON custom_fields(organization_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_saved_views_org ON saved_views(organization_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_deleted_records_org ON deleted_records(organization_id, entity_type, deleted_at);

CREATE TABLE IF NOT EXISTS technician_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, working_from_lat REAL, working_from_lon REAL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK((working_from_lat IS NULL AND working_from_lon IS NULL) OR (working_from_lat BETWEEN -90 AND 90 AND working_from_lon BETWEEN -180 AND 180)));
CREATE TABLE IF NOT EXISTS technician_skills (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, skill TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 5), created_at TEXT NOT NULL, UNIQUE(organization_id,user_id,skill));
CREATE TABLE IF NOT EXISTS sla_policies (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('low','normal','high','urgent')), response_minutes INTEGER, resolution_minutes INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,priority));
CREATE TABLE IF NOT EXISTS work_order_sla (work_order_id TEXT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, policy_id TEXT REFERENCES sla_policies(id) ON DELETE SET NULL, due_at TEXT, breached_at TEXT, status TEXT NOT NULL CHECK(status IN ('on_track','at_risk','breached','met')), started_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, technician_id TEXT REFERENCES users(id) ON DELETE SET NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('scheduled','confirmed','en_route','completed','cancelled','no_show')), customer_confirmed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, checkin_latitude REAL, checkin_longitude REAL, checkin_accuracy_m REAL, checked_in_at TEXT, checked_in_by TEXT REFERENCES users(id) ON DELETE SET NULL, CHECK(end_at > start_at), CHECK(checkin_latitude IS NULL OR checkin_latitude BETWEEN -90 AND 90), CHECK(checkin_longitude IS NULL OR checkin_longitude BETWEEN -180 AND 180), CHECK(checkin_accuracy_m IS NULL OR checkin_accuracy_m >= 0), UNIQUE(work_order_id,start_at));
CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, sku TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'unit', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,sku));
CREATE TABLE IF NOT EXISTS inventory_locations (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS inventory_stock (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE, location_id TEXT NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE, quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0), updated_at TEXT NOT NULL, UNIQUE(organization_id,part_id,location_id));
CREATE TABLE IF NOT EXISTS work_order_parts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE RESTRICT, location_id TEXT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL CHECK(quantity > 0), status TEXT NOT NULL CHECK(status IN ('reserved','consumed','returned')), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portal_access_tokens (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE IF NOT EXISTS customer_signoffs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, signer_name TEXT NOT NULL, acknowledgement TEXT NOT NULL, signed_at TEXT NOT NULL, ip_hint TEXT, signature_sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS field_signoff_challenges (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, challenge_hash TEXT NOT NULL UNIQUE, document_sha256 TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_field_signoff_challenges_org_wo ON field_signoff_challenges(organization_id,work_order_id,expires_at,consumed_at);
CREATE TABLE IF NOT EXISTS org_units (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, parent_id TEXT REFERENCES org_units(id) ON DELETE RESTRICT, name TEXT NOT NULL, unit_type TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS unit_memberships (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, unit_id TEXT NOT NULL REFERENCES org_units(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, unit_role TEXT NOT NULL CHECK(unit_role IN ('head','lead','member','viewer')), created_at TEXT NOT NULL, PRIMARY KEY(unit_id,user_id));
CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(organization_id,parent_id);
CREATE INDEX IF NOT EXISTS idx_unit_memberships_user ON unit_memberships(organization_id,user_id);
CREATE TABLE IF NOT EXISTS idempotency_records (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_status INTEGER NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,actor_user_id,operation,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_records(organization_id,created_at);
CREATE TABLE IF NOT EXISTS async_idempotency_reservations (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('started','committed','failed')), response_status INTEGER, response_json TEXT, operation_envelope_id TEXT REFERENCES operation_envelopes(id) ON DELETE SET NULL, started_at TEXT NOT NULL, completed_at TEXT, error_code TEXT, UNIQUE(organization_id,actor_user_id,operation,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_async_idempotency_status ON async_idempotency_reservations(organization_id,status,started_at);
CREATE TABLE IF NOT EXISTS login_throttle (throttle_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_records(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_login_throttle_updated ON login_throttle(updated_at);
CREATE TABLE IF NOT EXISTS sync_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_event_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('status_update','comment','appointment_on_my_way','appointment_checkin','signoff','attachment')), payload_json TEXT NOT NULL, applied_at TEXT NOT NULL, UNIQUE(organization_id,actor_user_id,client_event_id));
CREATE TABLE IF NOT EXISTS sync_blocks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, block_id TEXT NOT NULL, block_hash TEXT NOT NULL, event_count INTEGER NOT NULL CHECK(event_count >= 0), first_client_event_id TEXT, last_client_event_id TEXT, received_at TEXT NOT NULL, UNIQUE(organization_id,actor_user_id,block_id));
CREATE INDEX IF NOT EXISTS idx_sync_blocks_org_actor_received ON sync_blocks(organization_id,actor_user_id,received_at);

CREATE INDEX IF NOT EXISTS idx_tech_profiles_org ON technician_profiles(organization_id,active);
CREATE INDEX IF NOT EXISTS idx_tech_skills_org_user ON technician_skills(organization_id,user_id);
CREATE INDEX IF NOT EXISTS idx_sla_org_priority ON sla_policies(organization_id,priority);
CREATE INDEX IF NOT EXISTS idx_work_order_sla_org_status ON work_order_sla(organization_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_appt_org_tech_time ON appointments(organization_id,technician_id,start_at,end_at);
CREATE INDEX IF NOT EXISTS idx_parts_org ON parts(organization_id,sku);
CREATE INDEX IF NOT EXISTS idx_inventory_org_location ON inventory_stock(organization_id,location_id);
CREATE INDEX IF NOT EXISTS idx_wop_org_wo ON work_order_parts(organization_id,work_order_id,status);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_org_customer ON portal_access_tokens(organization_id,customer_id,revoked_at);
CREATE INDEX IF NOT EXISTS idx_signoffs_org_wo ON customer_signoffs(organization_id,work_order_id,signed_at);
CREATE INDEX IF NOT EXISTS idx_sync_org_actor ON sync_events(organization_id,actor_user_id,applied_at);
CREATE TABLE IF NOT EXISTS operational_financial_settings (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, currency TEXT NOT NULL DEFAULT 'USD', labor_cost_per_hour REAL, updated_at TEXT NOT NULL, CHECK(labor_cost_per_hour IS NULL OR labor_cost_per_hour >= 0));
CREATE TABLE IF NOT EXISTS work_order_financials (work_order_id TEXT PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, labor_hours REAL, revenue REAL, repeat_visit INTEGER NOT NULL DEFAULT 0 CHECK(repeat_visit IN (0,1)), updated_at TEXT NOT NULL, CHECK(labor_hours IS NULL OR labor_hours >= 0), CHECK(revenue IS NULL OR revenue >= 0));
CREATE TABLE IF NOT EXISTS estimates (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL, number TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','sent','accepted','rejected','expired','cancelled')), currency TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0 CHECK(subtotal >= 0), discount REAL NOT NULL DEFAULT 0 CHECK(discount >= 0), tax REAL NOT NULL DEFAULT 0 CHECK(tax >= 0), total REAL NOT NULL DEFAULT 0 CHECK(total >= 0), valid_until TEXT, notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,number));
CREATE TABLE IF NOT EXISTS estimate_lines (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE, description TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity > 0), unit_price REAL NOT NULL CHECK(unit_price >= 0), line_total REAL NOT NULL CHECK(line_total >= 0), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL, work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL, estimate_id TEXT REFERENCES estimates(id) ON DELETE SET NULL, number TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','issued','partially_paid','paid','void','overdue')), currency TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0 CHECK(subtotal >= 0), discount REAL NOT NULL DEFAULT 0 CHECK(discount >= 0), tax REAL NOT NULL DEFAULT 0 CHECK(tax >= 0), total REAL NOT NULL DEFAULT 0 CHECK(total >= 0), amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0), due_at TEXT, notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,number));
CREATE TABLE IF NOT EXISTS invoice_lines (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, description TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity > 0), unit_price REAL NOT NULL CHECK(unit_price >= 0), line_total REAL NOT NULL CHECK(line_total >= 0), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoice_payments (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, amount REAL NOT NULL CHECK(amount > 0), source TEXT NOT NULL CHECK(source IN ('local_manual','stripe')), provider_reference TEXT, idempotency_key TEXT, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_invoice_payments_org_invoice ON invoice_payments(organization_id,invoice_id,created_at);
CREATE INDEX IF NOT EXISTS idx_estimates_org_customer ON estimates(organization_id,customer_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_estimate_lines_org_estimate ON estimate_lines(organization_id,estimate_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_customer ON invoices(organization_id,customer_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_org_invoice ON invoice_lines(organization_id,invoice_id);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, name TEXT NOT NULL, reference TEXT, starts_at TEXT NOT NULL, ends_at TEXT, sla_priority TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset_warranties (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, provider TEXT, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, terms TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS maintenance_plans (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, name TEXT NOT NULL, interval_days INTEGER NOT NULL CHECK(interval_days > 0), next_due_at TEXT NOT NULL, procedure_id TEXT REFERENCES procedure_definitions(id) ON DELETE SET NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS maintenance_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE, work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL, due_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(plan_id,due_at));
CREATE TABLE IF NOT EXISTS safety_checklists (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, work_type TEXT NOT NULL, items_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS safety_acknowledgements (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, checklist_id TEXT NOT NULL REFERENCES safety_checklists(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, answers_json TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '[]', measurements_json TEXT NOT NULL DEFAULT '{}', acknowledged_at TEXT NOT NULL, UNIQUE(checklist_id,work_order_id,actor_user_id));
CREATE INDEX IF NOT EXISTS idx_financials_org ON operational_financial_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_wo_financials_org ON work_order_financials(organization_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_contracts_org_customer ON contracts(organization_id,customer_id,active);
CREATE INDEX IF NOT EXISTS idx_warranty_org_asset ON asset_warranties(organization_id,asset_id,active,ends_at);
CREATE INDEX IF NOT EXISTS idx_pm_org_due ON maintenance_plans(organization_id,active,next_due_at);
CREATE INDEX IF NOT EXISTS idx_pm_runs_org ON maintenance_runs(organization_id,due_at);
CREATE TABLE IF NOT EXISTS asset_health_snapshots (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')), risk_score INTEGER NOT NULL CHECK(risk_score BETWEEN 0 AND 100), factors_json TEXT NOT NULL, assessment_sha256 TEXT NOT NULL, assessed_at TEXT NOT NULL, assessed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, UNIQUE(organization_id,asset_id,assessed_at));
CREATE INDEX IF NOT EXISTS idx_asset_health_org_asset_time ON asset_health_snapshots(organization_id,asset_id,assessed_at);
CREATE TABLE IF NOT EXISTS self_schedule_links (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE INDEX IF NOT EXISTS idx_self_schedule_org_wo ON self_schedule_links(organization_id,work_order_id,expires_at,revoked_at);
CREATE TABLE IF NOT EXISTS self_schedule_bookings (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, link_id TEXT NOT NULL REFERENCES self_schedule_links(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL, slot_sha256 TEXT NOT NULL, idempotency_key TEXT UNIQUE, start_at TEXT NOT NULL, end_at TEXT NOT NULL, technician_id TEXT REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','cancelled')), created_at TEXT NOT NULL, UNIQUE(organization_id,slot_sha256));
CREATE TABLE IF NOT EXISTS ai_agent_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, model TEXT, request_sha256 TEXT NOT NULL, response_sha256 TEXT, tool_calls_json TEXT NOT NULL DEFAULT '[]', proposal_id TEXT REFERENCES autopilot_proposals(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('completed','failed','blocked')), error_code TEXT, created_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS opscore_knowledge_chunks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, source_type TEXT NOT NULL, source_id TEXT NOT NULL, content TEXT NOT NULL, content_sha256 TEXT NOT NULL, embedding_text TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,source_type,source_id,content_sha256));

CREATE TABLE IF NOT EXISTS ai_contact_conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('web_chat','browser_voice','phone','email','whatsapp','sms')),
  language_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','waiting_human','resolved','closed','erased')),
  consent_at TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  escalation_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
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
  confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
  client_message_id TEXT,
  reply_to_message_id TEXT REFERENCES ai_contact_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
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
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_contact_handoffs_org_status_priority ON ai_contact_handoffs(organization_id,status,priority,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_contact_active_handoff ON ai_contact_handoffs(organization_id,conversation_id) WHERE status IN ('queued','claimed');


CREATE INDEX IF NOT EXISTS idx_safety_org ON safety_checklists(organization_id,active);
CREATE INDEX IF NOT EXISTS idx_safety_ack_org_wo ON safety_acknowledgements(organization_id,work_order_id,acknowledged_at);
CREATE TABLE IF NOT EXISTS approval_requests (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')), requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, decided_by TEXT REFERENCES users(id) ON DELETE SET NULL, decision_reason TEXT, created_at TEXT NOT NULL, decided_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_pending ON approval_requests(organization_id,entity_type,entity_id,action,status);
CREATE INDEX IF NOT EXISTS idx_approval_org_status ON approval_requests(organization_id,status,created_at);
CREATE TABLE IF NOT EXISTS inventory_ledger (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE RESTRICT, location_id TEXT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT, work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL, source_type TEXT NOT NULL, source_id TEXT, quantity_delta INTEGER NOT NULL, balance_after INTEGER NOT NULL CHECK(balance_after >= 0), reason TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_org_part ON inventory_ledger(organization_id,part_id,location_id,created_at);
CREATE TABLE IF NOT EXISTS business_calendars (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, timezone TEXT NOT NULL, week_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_calendar_name ON business_calendars(organization_id,name);
CREATE TABLE IF NOT EXISTS business_calendar_exceptions (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, calendar_id TEXT NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE, date TEXT NOT NULL, is_working INTEGER NOT NULL CHECK(is_working IN (0,1)), start_minutes INTEGER, end_minutes INTEGER, reason TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(calendar_id,date));
CREATE TABLE IF NOT EXISTS work_order_bulk_jobs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, operation TEXT NOT NULL, requested_count INTEGER NOT NULL, affected_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK(status IN ('completed','partial','failed')), request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_org_created ON work_order_bulk_jobs(organization_id,created_at);
CREATE TABLE IF NOT EXISTS configuration_change_log (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, config_id TEXT REFERENCES operational_configs(id) ON DELETE SET NULL, config_key TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('created','activated')), actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reason TEXT NOT NULL, correlation_id TEXT, request_hash_sha256 TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_configuration_change_log_org_key ON configuration_change_log(organization_id,config_key,created_at);
CREATE TABLE IF NOT EXISTS operational_configs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, config_key TEXT NOT NULL, config_value_json TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','active','retired')), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, description TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, activated_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_config_version ON operational_configs(organization_id,config_key,version);
CREATE INDEX IF NOT EXISTS idx_operational_configs_active ON operational_configs(organization_id,config_key,status);
CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_event_id TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, error_code TEXT NOT NULL, retryable INTEGER NOT NULL CHECK(retryable IN (0,1)), status TEXT NOT NULL CHECK(status IN ('open','resolved','superseded')), resolution_json TEXT, resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL, resolved_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_org_status ON sync_conflicts(organization_id,status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_conflict_event_error ON sync_conflicts(organization_id,actor_user_id,client_event_id,error_code);
CREATE TABLE IF NOT EXISTS time_entries (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL CHECK(status IN ('running','stopped','void')), minutes INTEGER CHECK(minutes IS NULL OR (minutes >= 1 AND minutes <= 1440)), note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_time_entries_org_tech_status ON time_entries(organization_id,technician_id,status,started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_org_wo_started ON time_entries(organization_id,work_order_id,started_at);
CREATE TABLE IF NOT EXISTS first_time_right_checks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, ready INTEGER NOT NULL CHECK(ready IN (0,1)), blockers_json TEXT NOT NULL, assessment_hash TEXT NOT NULL, checked_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, checked_at TEXT NOT NULL, UNIQUE(organization_id,work_order_id));
CREATE INDEX IF NOT EXISTS idx_first_time_right_org_ready ON first_time_right_checks(organization_id,ready,checked_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entry_running_technician ON time_entries(organization_id,technician_id) WHERE status='running';

CREATE TABLE IF NOT EXISTS closure_sheets (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, sheet_date TEXT NOT NULL, technician_id TEXT REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('ready','blocked')), item_count INTEGER NOT NULL DEFAULT 0 CHECK(item_count >= 0), blocked_count INTEGER NOT NULL DEFAULT 0 CHECK(blocked_count >= 0), sheet_sha256 TEXT NOT NULL, rows_json TEXT NOT NULL, compiled_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,sheet_date,technician_id));
CREATE INDEX IF NOT EXISTS idx_closure_sheets_org_date ON closure_sheets(organization_id,sheet_date,status);
CREATE TABLE IF NOT EXISTS operational_jobs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, queue_name TEXT NOT NULL CHECK(queue_name IN ('support','billing','incident','general')), job_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','dead_letter')), attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20), available_at TEXT NOT NULL, lease_until TEXT, last_error TEXT, result_json TEXT, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
CREATE TABLE IF NOT EXISTS operational_event_receipts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, event_key TEXT NOT NULL, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, payload_json TEXT NOT NULL, event_sha256 TEXT NOT NULL, observed_at TEXT NOT NULL, UNIQUE(organization_id,event_key));
CREATE INDEX IF NOT EXISTS idx_operational_event_receipts_org_observed ON operational_event_receipts(organization_id,observed_at);
CREATE INDEX IF NOT EXISTS idx_operational_jobs_queue ON operational_jobs(organization_id,queue_name,status,available_at,created_at);
CREATE INDEX IF NOT EXISTS idx_operational_jobs_lease ON operational_jobs(status,lease_until);
CREATE TABLE IF NOT EXISTS service_lines (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, code TEXT NOT NULL, name TEXT NOT NULL, service_ref TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,code));
CREATE TABLE IF NOT EXISTS customer_service_lines (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, line_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE RESTRICT, assigned_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(organization_id,customer_id));
CREATE INDEX IF NOT EXISTS idx_customer_service_lines_line ON customer_service_lines(organization_id,line_id);
CREATE TABLE IF NOT EXISTS line_migration_jobs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, from_line_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE RESTRICT, to_line_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE RESTRICT, status TEXT NOT NULL CHECK(status IN ('preflight','ready','running','completed','rolled_back','failed')), preflight_hash TEXT NOT NULL, before_hash TEXT, after_hash TEXT, rollback_json TEXT, error_code TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
DROP INDEX IF EXISTS uq_line_migration_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_migration_active ON line_migration_jobs(organization_id,customer_id) WHERE status IN ('preflight','ready','running');
CREATE INDEX IF NOT EXISTS idx_line_migration_org_status ON line_migration_jobs(organization_id,status,created_at);
CREATE TABLE IF NOT EXISTS payment_reconciliation_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, provider TEXT NOT NULL CHECK(provider IN ('local','stripe')), scope_json TEXT NOT NULL, matched_count INTEGER NOT NULL, mismatch_count INTEGER NOT NULL, unmatched_count INTEGER NOT NULL, report_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('completed','failed')), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, memory_type TEXT NOT NULL, content_ciphertext TEXT NOT NULL, content_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_agent_memories_subject ON agent_memories(organization_id,subject_type,subject_id,created_at);
CREATE TABLE IF NOT EXISTS tenant_domains (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, hostname TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('pending','verified','active','disabled')), verification_token TEXT NOT NULL, verified_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_org ON tenant_domains(organization_id,status);
CREATE TABLE IF NOT EXISTS operational_dependencies (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, depends_on_work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, dependency_type TEXT NOT NULL CHECK(dependency_type IN ('blocks','relates')), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,work_order_id,depends_on_work_order_id,dependency_type), CHECK(work_order_id<>depends_on_work_order_id));
CREATE INDEX IF NOT EXISTS idx_operational_dependencies_org_wo ON operational_dependencies(organization_id,work_order_id);
CREATE TABLE IF NOT EXISTS tenant_crypto_profiles (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, key_version TEXT NOT NULL, algorithm TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS parity_heartbeat_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('pass','degraded','fail')), checks_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS geofences (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, geometry_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,name));
CREATE INDEX IF NOT EXISTS idx_geofences_org_enabled ON geofences(organization_id,enabled);
CREATE TABLE IF NOT EXISTS worker_guard_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_worker_guard_events_org_created ON worker_guard_events(organization_id,created_at);
CREATE TABLE IF NOT EXISTS worker_guard_system_events (id TEXT PRIMARY KEY, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_worker_guard_system_events_created ON worker_guard_system_events(created_at);


CREATE INDEX IF NOT EXISTS idx_parity_heartbeat_org_created ON parity_heartbeat_runs(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_report_chunks_org_created ON closure_sheets(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_recon_org_created ON payment_reconciliation_runs(organization_id,created_at);

    CREATE TABLE IF NOT EXISTS dynamic_geofence_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, geofence_id TEXT REFERENCES geofences(id) ON DELETE CASCADE, source TEXT NOT NULL, event_type TEXT NOT NULL CHECK(event_type IN ('hazard','restriction','clear')), severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')), latitude REAL NOT NULL, longitude REAL NOT NULL, radius_m REAL NOT NULL CHECK(radius_m > 0 AND radius_m <= 100000), reason TEXT NOT NULL, source_event_id TEXT, active_from TEXT NOT NULL, expires_at TEXT NOT NULL, event_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS field_signoff_assurance (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, assurance_mode TEXT NOT NULL CHECK(assurance_mode IN ('os_local_biometric_gate','device_pin_gate','none')), verified_at TEXT, client_reference TEXT, document_sha256 TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
`;
function migrate14(db, storedVersion) {
  if (storedVersion >= 14) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_dependencies (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, depends_on_work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, dependency_type TEXT NOT NULL CHECK(dependency_type IN ('blocks','relates')), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,work_order_id,depends_on_work_order_id,dependency_type), CHECK(work_order_id<>depends_on_work_order_id));
    CREATE INDEX IF NOT EXISTS idx_operational_dependencies_org_wo ON operational_dependencies(organization_id,work_order_id);
    CREATE TABLE IF NOT EXISTS tenant_crypto_profiles (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, key_version TEXT NOT NULL, algorithm TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS parity_heartbeat_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('pass','degraded','fail')), checks_json TEXT NOT NULL, created_at TEXT NOT NULL);



    CREATE INDEX IF NOT EXISTS idx_parity_heartbeat_org_created ON parity_heartbeat_runs(organization_id,created_at);
  `);
}

function migrate15(db, storedVersion) {
  if (storedVersion >= 15) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_circuit_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, gateway_name TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gateway_circuit_states (gateway_name TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS firewall_rate_buckets (bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, requests INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);

    CREATE INDEX IF NOT EXISTS idx_gateway_circuit_events_org_gateway ON gateway_circuit_events(organization_id,gateway_name,created_at);
    CREATE TABLE IF NOT EXISTS signature_chain_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, document_type TEXT NOT NULL, document_id TEXT NOT NULL, level INTEGER NOT NULL CHECK(level>0), signer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, signer_role TEXT NOT NULL DEFAULT 'member', payload_sha256 TEXT NOT NULL, previous_hash TEXT NOT NULL, chain_hash TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,document_type,document_id,level));
    CREATE INDEX IF NOT EXISTS idx_signature_chain_doc ON signature_chain_events(organization_id,document_type,document_id,level);
    CREATE TABLE IF NOT EXISTS billing_provider_registry (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, provider_name TEXT NOT NULL, adapter_version TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,provider_name));
    CREATE TABLE IF NOT EXISTS privacy_purge_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, summary_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_privacy_purge_runs_org_created ON privacy_purge_runs(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS technician_geofences (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, geofence_id TEXT NOT NULL REFERENCES geofences(id) ON DELETE CASCADE, technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, PRIMARY KEY (organization_id,geofence_id,technician_id));
    CREATE INDEX IF NOT EXISTS idx_technician_geofences_org_tech ON technician_geofences(organization_id,technician_id);
    CREATE TABLE IF NOT EXISTS signature_chain_seals (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, document_type TEXT NOT NULL, document_id TEXT NOT NULL, final_chain_hash TEXT NOT NULL, sealed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, sealed_at TEXT NOT NULL, UNIQUE(organization_id,document_type,document_id));

  `);
}

function migrate17(db, storedVersion) {
  if (storedVersion >= 17) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS technician_geofences (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      geofence_id TEXT NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
      technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id,geofence_id,technician_id)
    );
    CREATE INDEX IF NOT EXISTS idx_technician_geofences_org_tech ON technician_geofences(organization_id,technician_id);
    CREATE TABLE IF NOT EXISTS signature_chain_seals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      final_chain_hash TEXT NOT NULL,
      sealed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      sealed_at TEXT NOT NULL,
      UNIQUE(organization_id,document_type,document_id)
    );
  `);
}
function migrate21(db, storedVersion) {
  if (storedVersion >= 21) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_twin_snapshots (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, snapshot_kind TEXT NOT NULL CHECK(snapshot_kind IN ('on_demand','scenario')), state_json TEXT NOT NULL, state_sha256 TEXT NOT NULL, source_counts_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_twin_org_created ON operational_twin_snapshots(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS operational_twin_chain_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, sequence_no INTEGER NOT NULL, event_type TEXT NOT NULL, snapshot_id TEXT NOT NULL, previous_hash TEXT NOT NULL, event_json TEXT NOT NULL, event_hash TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,sequence_no), UNIQUE(organization_id,snapshot_id));
    CREATE INDEX IF NOT EXISTS idx_twin_chain_org_sequence ON operational_twin_chain_events(organization_id,sequence_no);
    CREATE TABLE IF NOT EXISTS decision_replays (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, decision_type TEXT NOT NULL, input_json TEXT NOT NULL, rules_json TEXT NOT NULL, outcome_json TEXT NOT NULL, decision_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, replayed_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_decision_replays_org_created ON decision_replays(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS scenario_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, scenario_json TEXT NOT NULL, baseline_sha256 TEXT NOT NULL, result_json TEXT NOT NULL, result_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_scenario_runs_org_created ON scenario_runs(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS skill_certifications (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, skill TEXT NOT NULL, certificate_ref TEXT NOT NULL, issuer TEXT NOT NULL, issued_at TEXT, expires_at TEXT, status TEXT NOT NULL CHECK(status IN ('active','expired','revoked')), evidence_sha256 TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,user_id,certificate_ref));
    CREATE INDEX IF NOT EXISTS idx_skill_cert_org_user ON skill_certifications(organization_id,user_id,status,expires_at);
    CREATE TABLE IF NOT EXISTS capacity_plans (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, plan_date TEXT NOT NULL, parameters_json TEXT NOT NULL, result_json TEXT NOT NULL, result_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(organization_id,plan_date));
    CREATE INDEX IF NOT EXISTS idx_capacity_plans_org_date ON capacity_plans(organization_id,plan_date);
  `);
}
function migrate22(db, storedVersion) {
  if (storedVersion >= 22) return;
  // Bind every session to the organization selected at authentication time.
  // Older databases did not persist this value and therefore re-derived an arbitrary
  // membership on each request. Backfill deterministically for those legacy sessions.
  addColumn(db, 'sessions', 'organization_id', 'TEXT REFERENCES organizations(id) ON DELETE CASCADE');
  db.exec(`
    UPDATE sessions AS s
    SET organization_id = (
      SELECT m.organization_id
      FROM memberships m
      WHERE m.user_id = s.user_id
      ORDER BY m.created_at, m.organization_id
      LIMIT 1
    )
    WHERE s.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(organization_id,expires_at);
  `);
}

function migrate20(db, storedVersion) {
  if (storedVersion >= 20) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_circuit_states (gateway_name TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS firewall_rate_buckets (bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, requests INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
  `);
}

function migrate19(db, storedVersion) {
  if (storedVersion >= 19) return;
  db.exec(`CREATE INDEX IF NOT EXISTS idx_signature_chain_seals_org_doc ON signature_chain_seals(organization_id,document_type,document_id);`);
}
function migrate18(db, storedVersion) {
  if (storedVersion >= 18) return;
  db.exec(`CREATE INDEX IF NOT EXISTS idx_privacy_purge_runs_org_created ON privacy_purge_runs(organization_id,created_at);`);
}
function migrate16(db, storedVersion) {
  if (storedVersion >= 16) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS geofences (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, geometry_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,name));
    CREATE INDEX IF NOT EXISTS idx_geofences_org_enabled ON geofences(organization_id,enabled);
    CREATE TABLE IF NOT EXISTS worker_guard_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_worker_guard_events_org_created ON worker_guard_events(organization_id,created_at);
    CREATE TABLE IF NOT EXISTS worker_guard_system_events (id TEXT PRIMARY KEY, queue_name TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_worker_guard_system_events_created ON worker_guard_system_events(created_at);
  `);
  addColumn(db, 'signature_chain_events', 'signer_role', "TEXT NOT NULL DEFAULT 'member'");
}

function migrate13(db, storedVersion) {
  if (storedVersion >= 13) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, memory_type TEXT NOT NULL, content_ciphertext TEXT NOT NULL, content_sha256 TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_subject ON agent_memories(organization_id,subject_type,subject_id,created_at);
    CREATE TABLE IF NOT EXISTS tenant_domains (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, hostname TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('pending','verified','active','disabled')), verification_token TEXT NOT NULL, verified_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tenant_domains_org ON tenant_domains(organization_id,status);
  `);
}

function migrateCompatibility(db) {
  const cols = db.prepare('PRAGMA table_info(webhook_endpoints)').all().map(x => x.name);
  if (!cols.includes('secret_ciphertext'))
    db.exec('ALTER TABLE webhook_endpoints ADD COLUMN secret_ciphertext TEXT');
}
function migrateSyncEvents(db, storedVersion) {
  if (storedVersion >= 4)
    return;
  const sql = db.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=\'sync_events\'').get()?.sql || '';
  if (!sql || sql.includes('appointment_on_my_way'))
    return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      ALTER TABLE sync_events RENAME TO sync_events_legacy_v3;
      CREATE TABLE sync_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_event_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('status_update','comment','appointment_on_my_way','appointment_checkin','signoff','attachment')), payload_json TEXT NOT NULL, applied_at TEXT NOT NULL, UNIQUE(organization_id,actor_user_id,client_event_id));
      INSERT INTO sync_events (id,organization_id,actor_user_id,client_event_id,entity_type,entity_id,operation,payload_json,applied_at)
        SELECT id,organization_id,actor_user_id,client_event_id,entity_type,entity_id,operation,payload_json,applied_at FROM sync_events_legacy_v3;
      DROP TABLE sync_events_legacy_v3;
    `);
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      warn('transaction.rollback_failed', { operation: 'migrate_sync_events', error: rollbackError });
    }
    throw e;
  }
}

function migrate27(db, storedVersion) {
  if (storedVersion >= 27) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_contact_conversations (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK(channel IN ('web_chat','browser_voice','phone','email','whatsapp','sms')),
      language_code TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','waiting_human','resolved','closed','erased')),
      consent_at TEXT NOT NULL, consent_version TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL, escalation_reason TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, last_activity_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_status_activity ON ai_contact_conversations(organization_id,status,last_activity_at);
    CREATE INDEX IF NOT EXISTS idx_ai_contact_conversations_org_language ON ai_contact_conversations(organization_id,language_code,created_at);
    CREATE TABLE IF NOT EXISTS ai_contact_messages (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES ai_contact_conversations(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('customer','assistant','human','system')),
      content_ciphertext TEXT NOT NULL, content_iv TEXT NOT NULL, content_auth_tag TEXT NOT NULL, content_hmac TEXT NOT NULL,
      encryption_key_id TEXT NOT NULL, language_code TEXT NOT NULL, provider TEXT, model TEXT,
      confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1), client_message_id TEXT,
      reply_to_message_id TEXT REFERENCES ai_contact_messages(id) ON DELETE SET NULL, created_at TEXT NOT NULL,
      UNIQUE(organization_id,conversation_id,actor_type,client_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_contact_messages_org_conversation_time ON ai_contact_messages(organization_id,conversation_id,created_at);
    CREATE TABLE IF NOT EXISTS ai_contact_handoffs (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES ai_contact_conversations(id) ON DELETE CASCADE,
      reason_code TEXT NOT NULL CHECK(reason_code IN ('customer_requested_human','low_confidence','high_risk','policy_refusal','unresolved','repeated_failure','model_requested','voice_review_required','other')),
      reason_detail TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL CHECK(priority IN ('low','normal','high','urgent')),
      status TEXT NOT NULL CHECK(status IN ('queued','claimed','completed','cancelled')),
      requested_by TEXT NOT NULL CHECK(requested_by IN ('customer','ai','policy','system')),
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, claimed_at TEXT,
      completed_at TEXT, resolution_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_contact_handoffs_org_status_priority ON ai_contact_handoffs(organization_id,status,priority,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_contact_active_handoff ON ai_contact_handoffs(organization_id,conversation_id) WHERE status IN ('queued','claimed');
  `);
}

function migrate26(db, storedVersion) {
  if (storedVersion >= 26) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS oidc_identities (id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email_at_link TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(issuer,subject));
    CREATE INDEX IF NOT EXISTS idx_oidc_identities_user ON oidc_identities(user_id,issuer);
    CREATE TABLE IF NOT EXISTS field_signoff_challenges (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, challenge_hash TEXT NOT NULL UNIQUE, document_sha256 TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_field_signoff_challenges_org_wo ON field_signoff_challenges(organization_id,work_order_id,expires_at,consumed_at);
  `);
}

function migrate25(db, storedVersion) {
  if (storedVersion >= 25) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_health_snapshots (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')), risk_score INTEGER NOT NULL CHECK(risk_score BETWEEN 0 AND 100), factors_json TEXT NOT NULL, assessment_sha256 TEXT NOT NULL, assessed_at TEXT NOT NULL, assessed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, UNIQUE(organization_id,asset_id,assessed_at));
    CREATE INDEX IF NOT EXISTS idx_asset_health_org_asset_time ON asset_health_snapshots(organization_id,asset_id,assessed_at);
    CREATE TABLE IF NOT EXISTS self_schedule_links (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, last_used_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_self_schedule_org_wo ON self_schedule_links(organization_id,work_order_id,expires_at,revoked_at);
    CREATE TABLE IF NOT EXISTS self_schedule_bookings (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, link_id TEXT NOT NULL REFERENCES self_schedule_links(id) ON DELETE CASCADE, work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE, appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL, slot_sha256 TEXT NOT NULL, idempotency_key TEXT UNIQUE, start_at TEXT NOT NULL, end_at TEXT NOT NULL, technician_id TEXT REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','cancelled')), created_at TEXT NOT NULL, UNIQUE(organization_id,slot_sha256));
    CREATE TABLE IF NOT EXISTS ai_agent_runs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, model TEXT, request_sha256 TEXT NOT NULL, response_sha256 TEXT, tool_calls_json TEXT NOT NULL DEFAULT '[]', proposal_id TEXT REFERENCES autopilot_proposals(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('completed','failed','blocked')), error_code TEXT, created_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS opscore_knowledge_chunks (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, source_type TEXT NOT NULL, source_id TEXT NOT NULL, content TEXT NOT NULL, content_sha256 TEXT NOT NULL, embedding_text TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,source_type,source_id,content_sha256));
  `);
}

function migrate24(db, storedVersion) {
  if (storedVersion >= 24) return;
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='service_lines'").get();
  if (!exists) return;
  const cols = db.prepare('PRAGMA table_info(service_lines)').all().map(x => x.name);
  if (cols.includes('network_ref') && !cols.includes('service_ref'))
    db.exec('ALTER TABLE service_lines RENAME COLUMN network_ref TO service_ref');
}

function migrate23(db, storedVersion) {
  if (storedVersion >= 23) return;
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gateway_circuit_states'").get();
  if (!exists) {
    db.exec("CREATE TABLE gateway_circuit_states (organization_id TEXT NOT NULL, gateway_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (organization_id,gateway_name))");
    return;
  }
  const cols = db.prepare("PRAGMA table_info(gateway_circuit_states)").all().map(x => x.name);
  if (!cols.includes('organization_id')) {
    db.exec(`
      ALTER TABLE gateway_circuit_states RENAME TO gateway_circuit_states_legacy;
      CREATE TABLE gateway_circuit_states (organization_id TEXT NOT NULL, gateway_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('closed','open','half-open')), failures INTEGER NOT NULL DEFAULT 0, opened_at INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (organization_id,gateway_name));
      DROP TABLE gateway_circuit_states_legacy;
    `);
  }
}

function migrate28(db, storedVersion) {
  if (storedVersion >= 28) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_twin_chain_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_json TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id,sequence_no),
      UNIQUE(organization_id,snapshot_id)
    );
    CREATE INDEX IF NOT EXISTS idx_twin_chain_org_sequence ON operational_twin_chain_events(organization_id,sequence_no);
  `);
}

function openDb(dbPath = config.sqlitePath) {
  if (dbPath !== ':memory:')
    ensureDir(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(schema);
  const storedVersion = Number(db.prepare('PRAGMA user_version').get().user_version || 0);
  if (storedVersion > CURRENT_SCHEMA_VERSION)
    throw new Error(`DB_SCHEMA_NEWER_THAN_CODE:${ storedVersion }:${ CURRENT_SCHEMA_VERSION }`);
  migrateSyncEvents(db, storedVersion);
  migrate13(db, storedVersion);
  migrate14(db, storedVersion);
  migrate15(db, storedVersion);
  migrate16(db, storedVersion);
  migrate17(db, storedVersion);
  migrate18(db, storedVersion);
  migrate19(db, storedVersion);
  migrate20(db, storedVersion);
  migrate21(db, storedVersion);
  migrate22(db, storedVersion);
  migrate23(db, storedVersion);
  migrate24(db, storedVersion);
  migrate25(db, storedVersion);
  migrate26(db, storedVersion);
  migrate27(db, storedVersion);
  migrate28(db, storedVersion);
  // Existing very old/imported databases may not have reached migration 15 yet.
  // Add the housekeeping index only after the shared limiter table exists.
  const rateBucketsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='firewall_rate_buckets'").get();
  if (rateBucketsTable) db.exec('CREATE INDEX IF NOT EXISTS idx_firewall_rate_buckets_updated_at ON firewall_rate_buckets(updated_at)');
  addColumn(db, 'stripe_billing', 'last_event_created', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'stripe_events', 'event_created', 'INTEGER NOT NULL DEFAULT 0');
  // Backward-compatible local upgrade from the first 0.1 schema.
  addColumn(db, 'webhook_endpoints', 'secret_ciphertext', 'TEXT');
  addColumn(db, 'audit_log', 'previous_hash', 'TEXT NOT NULL DEFAULT \'\'');
  addColumn(db, 'audit_log', 'event_hash', 'TEXT NOT NULL DEFAULT \'\'');
  addColumn(db, 'work_orders', 'number', 'TEXT DEFAULT NULL');
  addColumn(db, 'work_orders', 'customer_id', 'TEXT REFERENCES customers(id) ON DELETE SET NULL');
  addColumn(db, 'work_orders', 'site_id', 'TEXT REFERENCES sites(id) ON DELETE SET NULL');
  addColumn(db, 'work_orders', 'team_name', 'TEXT');
  addColumn(db, 'work_orders', 'due_at', 'TEXT');
  addColumn(db, 'work_orders', 'completion_policy_id', 'TEXT');
  addColumn(db, 'work_orders', 'completion_policy_version', 'INTEGER');
  addColumn(db, 'completion_policies', 'version', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'completion_policies', 'require_first_time_right', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'workflow_definitions', 'version', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'workflow_transition_log', 'reason', 'TEXT');
  addColumn(db, 'workflow_transition_log', 'workflow_version', 'INTEGER');
  addColumn(db, 'workflow_transition_log', 'decision_hash', 'TEXT');
  addColumn(db, 'safety_acknowledgements', 'evidence_json', 'TEXT NOT NULL DEFAULT \'[]\'');
  addColumn(db, 'safety_acknowledgements', 'measurements_json', 'TEXT NOT NULL DEFAULT \'{}\'');
  addColumn(db, 'assets', 'site_id', 'TEXT REFERENCES sites(id) ON DELETE SET NULL');
  addColumn(db, 'assets', 'updated_at', 'TEXT');
  addColumn(db, 'work_orders', 'asset_id', 'TEXT REFERENCES assets(id) ON DELETE SET NULL');
  addColumn(db, 'parts', 'unit_cost', 'REAL');
  addColumn(db, 'appointments', 'checkin_latitude', 'REAL');
  addColumn(db, 'appointments', 'checkin_longitude', 'REAL');
  addColumn(db, 'appointments', 'checkin_accuracy_m', 'REAL');
  addColumn(db, 'appointments', 'checked_in_at', 'TEXT');
  addColumn(db, 'appointments', 'checked_in_by', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  db.prepare('UPDATE work_orders SET number = \'WO-\' || substr(id,4,8) WHERE number IS NULL OR number = \'\'').run();
  db.prepare('UPDATE assets SET updated_at = created_at WHERE updated_at IS NULL').run();
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_number_org ON work_orders(organization_id, number); CREATE INDEX IF NOT EXISTS idx_work_orders_org_due ON work_orders(organization_id, due_at);`);
    addColumn(db, 'customer_signoffs', 'signature_image_png', 'TEXT');
  addColumn(db, 'customer_signoffs', 'signature_image_sha256', 'TEXT');
  db.exec(`PRAGMA user_version = ${ CURRENT_SCHEMA_VERSION }`);
  return db;
}
module.exports = {
  openDb,
  CURRENT_SCHEMA_VERSION
};