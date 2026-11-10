-- OpsCore PostgreSQL RLS hardening reference.
-- Run after postgresql_schema.sql.
-- This is deployable SQL, but runtime certification still requires a real PostgreSQL environment.

CREATE TABLE IF NOT EXISTS org_units (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, parent_id TEXT REFERENCES org_units(id) ON DELETE RESTRICT, name TEXT NOT NULL, unit_type TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS unit_memberships (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, unit_id TEXT NOT NULL REFERENCES org_units(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, unit_role TEXT NOT NULL CHECK(unit_role IN ('head','lead','member','viewer')), created_at TEXT NOT NULL, PRIMARY KEY(unit_id,user_id));

DO $rls_init$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','sites','work_orders','assets','asset_events','locations','activity_log','comments','attachments','notifications','webhook_endpoints','webhook_deliveries','integration_outbox','evidence_uploads','pdf_signatures','api_keys','rate_limit_buckets','entitlements','usage_counters','stripe_billing','stripe_events','custom_fields','custom_field_values','saved_views','deleted_records','workflow_definitions','workflow_transition_log','workflow_versions','completion_policies','escalation_rules','escalations','procedure_definitions','procedure_runs','technician_profiles','technician_skills','sla_policies','work_order_sla','appointments','parts','inventory_locations','inventory_stock','work_order_parts','portal_access_tokens','customer_signoffs','org_units','unit_memberships','idempotency_records','sync_events','sync_blocks','operational_financial_settings','work_order_financials','estimates','estimate_lines','invoices','invoice_lines','contracts','asset_warranties','maintenance_plans','maintenance_runs','safety_checklists','safety_acknowledgements','approval_requests','inventory_ledger','business_calendars','business_calendar_exceptions','work_order_bulk_jobs','operational_configs','sync_conflicts','time_entries','first_time_right_checks','closure_sheets','operational_jobs','operational_event_receipts','service_lines','customer_service_lines','line_migration_jobs','payment_reconciliation_runs','invoice_payments','agent_memories','tenant_domains','operational_dependencies','tenant_crypto_profiles','parity_heartbeat_runs','geofences','worker_guard_events','gateway_circuit_events','signature_chain_events','billing_provider_registry','privacy_purge_runs','technician_geofences','signature_chain_seals','gateway_circuit_states','operational_twin_snapshots','operational_twin_chain_events','decision_replays','scenario_runs','skill_certifications','capacity_plans','field_signoff_challenges','organization_governance','operation_envelopes','async_idempotency_reservations','configuration_change_log','dynamic_geofence_events','field_signoff_assurance','asset_health_snapshots','self_schedule_links','self_schedule_bookings','ai_agent_runs','opscore_knowledge_chunks','ai_contact_conversations','ai_contact_messages','ai_contact_handoffs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Tenant policy: application transactions must SET LOCAL app.tenant_id and app.user_id.
-- The policy intentionally fails closed when app.tenant_id is absent/invalid.
CREATE OR REPLACE FUNCTION opscore_current_tenant() RETURNS TEXT
LANGUAGE SQL STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;

CREATE OR REPLACE FUNCTION opscore_current_user() RETURNS TEXT
LANGUAGE SQL STABLE AS $$ SELECT current_setting('app.user_id', true) $$;

CREATE OR REPLACE FUNCTION opscore_actor_lat() RETURNS DOUBLE PRECISION
LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_lat', true), '')::DOUBLE PRECISION
$$;

CREATE OR REPLACE FUNCTION opscore_actor_lon() RETURNS DOUBLE PRECISION
LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_lon', true), '')::DOUBLE PRECISION
$$;

CREATE OR REPLACE FUNCTION opscore_access_mode() RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.access_mode', true) IN ('field','auth','system','backoffice')
      THEN current_setting('app.access_mode', true)
    ELSE ''
  END
$$;

CREATE OR REPLACE FUNCTION opscore_is_privileged() RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = opscore_current_tenant()
      AND m.user_id = opscore_current_user()
      AND m.role IN ('owner','admin','manager')
  )
$$;


DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','sites','work_orders','assets','asset_events','locations','activity_log','comments','attachments','notifications','webhook_endpoints','webhook_deliveries','integration_outbox','evidence_uploads','pdf_signatures','api_keys','rate_limit_buckets','entitlements','usage_counters','stripe_billing','stripe_events','custom_fields','custom_field_values','saved_views','deleted_records','workflow_definitions','workflow_transition_log','workflow_versions','completion_policies','escalation_rules','escalations','procedure_definitions','procedure_runs','technician_profiles','technician_skills','sla_policies','work_order_sla','appointments','parts','inventory_locations','inventory_stock','work_order_parts','portal_access_tokens','customer_signoffs','org_units','unit_memberships','idempotency_records','sync_events','sync_blocks','operational_financial_settings','work_order_financials','estimates','estimate_lines','invoices','invoice_lines','contracts','asset_warranties','maintenance_plans','maintenance_runs','safety_checklists','safety_acknowledgements','approval_requests','inventory_ledger','business_calendars','business_calendar_exceptions','work_order_bulk_jobs','operational_configs','sync_conflicts','time_entries','first_time_right_checks','closure_sheets','operational_jobs','operational_event_receipts','service_lines','customer_service_lines','line_migration_jobs','payment_reconciliation_runs','invoice_payments','agent_memories','tenant_domains','operational_dependencies','tenant_crypto_profiles','parity_heartbeat_runs','geofences','worker_guard_events','gateway_circuit_events','signature_chain_events','billing_provider_registry','privacy_purge_runs','technician_geofences','signature_chain_seals','gateway_circuit_states','operational_twin_snapshots','operational_twin_chain_events','decision_replays','scenario_runs','skill_certifications','capacity_plans','field_signoff_challenges','organization_governance','operation_envelopes','async_idempotency_reservations','configuration_change_log','dynamic_geofence_events','field_signoff_assurance','asset_health_snapshots','self_schedule_links','self_schedule_bookings','ai_agent_runs','opscore_knowledge_chunks','ai_contact_conversations','ai_contact_messages','ai_contact_handoffs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY opscore_tenant_isolation ON %I USING (organization_id = opscore_current_tenant()) WITH CHECK (organization_id = opscore_current_tenant())', t);
  END LOOP;
END $rls_init$;

-- Defense-in-depth guard: RESTRICTIVE policies are AND-combined with every
-- permissive policy, preventing an auth-mode policy from widening tenant access.
DO $tenant_guard$
DECLARE
  target_schema TEXT := current_schema();
  tenant_table RECORD;
BEGIN
  FOR tenant_table IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = target_schema
      AND c.relkind IN ('r','p')
      AND a.attname = 'organization_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> 'sessions'
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON %I.%I', target_schema, tenant_table.relname);
    EXECUTE format(
      'CREATE POLICY opscore_tenant_boundary_guard ON %I.%I AS RESTRICTIVE FOR ALL ' ||
      'USING (organization_id::text = opscore_current_tenant() OR ' ||
      '(organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system'',''backoffice'']))) ' ||
      'WITH CHECK (organization_id::text = opscore_current_tenant() OR ' ||
      '(organization_id IS NULL AND opscore_access_mode() = ANY (ARRAY[''system'',''backoffice''])))',
      target_schema, tenant_table.relname
    );
  END LOOP;
END $tenant_guard$;
-- Do not allow auth mode alone to enumerate or mutate organizations outside the
-- current tenant. Resolve pre-tenant identity operations through the auth plane.
DROP POLICY IF EXISTS opscore_identity_organizations ON organizations;
CREATE POLICY opscore_identity_organizations ON organizations FOR ALL
  USING (id::text = opscore_current_tenant())
  WITH CHECK (id::text = opscore_current_tenant());
DROP POLICY IF EXISTS opscore_tenant_boundary_guard ON organizations;
CREATE POLICY opscore_tenant_boundary_guard ON organizations AS RESTRICTIVE FOR ALL
  USING (id::text = opscore_current_tenant())
  WITH CHECK (id::text = opscore_current_tenant());

-- evidence_upload_chunks is a tenant-derived child table and intentionally has no copied organization_id.
-- It MUST be guarded through its parent evidence_uploads row; otherwise direct SQL access can bypass tenant RLS.
ALTER TABLE evidence_upload_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_upload_chunks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks;
CREATE POLICY opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks AS RESTRICTIVE
USING (EXISTS (
  SELECT 1
  FROM evidence_uploads u
  WHERE u.id = evidence_upload_chunks.upload_id
    AND u.organization_id = opscore_current_tenant()
))
WITH CHECK (EXISTS (
  SELECT 1
  FROM evidence_uploads u
  WHERE u.id = evidence_upload_chunks.upload_id
    AND u.organization_id = opscore_current_tenant()
));

-- authorization_decisions are organization-scoped when populated; NULL organization rows fail closed for tenant sessions.
DROP POLICY IF EXISTS opscore_authorization_decisions_tenant ON authorization_decisions;
CREATE POLICY opscore_authorization_decisions_tenant ON authorization_decisions
USING (organization_id = opscore_current_tenant())
WITH CHECK (organization_id = opscore_current_tenant());

-- audit_log is intentionally organization_id nullable for system events; keep explicit tenant policy.
DROP POLICY IF EXISTS opscore_tenant_isolation ON audit_log;
CREATE POLICY opscore_tenant_isolation ON audit_log
USING (organization_id = opscore_current_tenant() OR (organization_id IS NULL AND opscore_access_mode() = 'system'))
WITH CHECK (organization_id = opscore_current_tenant() OR (organization_id IS NULL AND opscore_access_mode() = 'system'));

-- Session policy must be the final policy for sessions.
-- PostgreSQL permissive policies are OR-combined: retaining a separate tenant policy beside
-- a user-only identity policy permits a matching user to write a session into another tenant.
-- Login/session resolution uses access_mode=auth; field access scopes sessions by user and tenant.
DROP POLICY IF EXISTS opscore_identity_sessions ON sessions;
DROP POLICY IF EXISTS opscore_tenant_isolation ON sessions;
CREATE POLICY opscore_identity_sessions ON sessions FOR ALL
  USING (
    opscore_access_mode() = ANY (ARRAY['auth','system','backoffice'])
    OR (
      user_id = opscore_current_user()
      AND (
        NULLIF(current_setting('app.tenant_id', true), '') IS NULL
        OR organization_id = opscore_current_tenant()
      )
    )
  )
  WITH CHECK (
    opscore_access_mode() = ANY (ARRAY['auth','system','backoffice'])
    OR (
      user_id = opscore_current_user()
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND organization_id = opscore_current_tenant()
    )
  );

-- users/sessions/invitations are identity-domain tables. They are not blindly tenant-scoped
-- because users can belong to multiple organizations. Apply application-specific identity policies.
COMMENT ON FUNCTION opscore_current_tenant() IS 'Fail-closed tenant context helper; set via SET LOCAL app.tenant_id per transaction.';

-- Identity-plane tables intentionally are not covered by the generic tenant loop because
-- login and token redemption can occur before a tenant context exists. They MUST NOT be
-- granted directly to the normal tenant runtime role. Authentication/invitation/reset
-- operations must use a dedicated auth-plane role or SECURITY DEFINER functions that
-- validate the token/identity and set tenant context before returning tenant data.
COMMENT ON TABLE users IS 'Identity-plane table: never grant direct normal tenant-runtime access; authenticate through dedicated auth-plane functions.';
COMMENT ON TABLE memberships IS 'Identity-plane membership table: access through tenant-scoped auth/authorization functions.';
COMMENT ON TABLE sessions IS 'Identity-plane session table: access through authenticated session functions only.';
COMMENT ON TABLE invitations IS 'Identity-plane invitation table: token redemption must use a dedicated auth-plane function.';
COMMENT ON TABLE login_throttle IS 'Global authentication throttle state; isolate from tenant data access.';


-- Contextual field-access hardening (PostgreSQL deployment contract).
-- Requires PostGIS in the deployment database. Runtime must set these values
-- with SET LOCAL inside the same transaction that performs the read/write:
--   app.tenant_id, app.user_id, app.actor_lat, app.actor_lon, app.access_mode
-- A missing context fails closed for technician-scoped access. Back-office roles
-- may use app.access_mode='backoffice'. This file does not certify a live DB.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE OR REPLACE FUNCTION opscore_field_context_allows_site(p_lat DOUBLE PRECISION, p_lon DOUBLE PRECISION, p_start TIMESTAMPTZ DEFAULT NULL, p_end TIMESTAMPTZ DEFAULT NULL) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT
    opscore_access_mode() = 'backoffice'
    OR (
      p_lat IS NOT NULL AND p_lon IS NOT NULL
      AND opscore_actor_lat() IS NOT NULL AND opscore_actor_lon() IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(opscore_actor_lon(), opscore_actor_lat()), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
        50
      )
      AND (p_start IS NULL OR now() >= p_start)
      AND (p_end IS NULL OR now() <= p_end)
    )
$$;

DROP POLICY IF EXISTS opscore_work_order_context ON work_orders;
CREATE POLICY opscore_work_order_context ON work_orders AS RESTRICTIVE
USING (
  organization_id = opscore_current_tenant()
  AND (
    opscore_is_privileged()
    OR (
      assigned_to = opscore_current_user()
      AND EXISTS (
        SELECT 1 FROM sites s
        WHERE s.id = work_orders.site_id
          AND s.organization_id = work_orders.organization_id
          AND opscore_field_context_allows_site(s.latitude, s.longitude, NULL, due_at)
      )
    )
  )
)
WITH CHECK (organization_id = opscore_current_tenant());

DROP POLICY IF EXISTS opscore_appointment_context ON appointments;
CREATE POLICY opscore_appointment_context ON appointments AS RESTRICTIVE
USING (
  organization_id = opscore_current_tenant()
  AND (
    opscore_is_privileged()
    OR (
      technician_id = opscore_current_user()
      AND EXISTS (
        SELECT 1
        FROM work_orders w
        JOIN sites s ON s.id = w.site_id
        WHERE w.id = appointments.work_order_id
          AND w.organization_id = appointments.organization_id
          AND opscore_field_context_allows_site(s.latitude, s.longitude, appointments.start_at, appointments.end_at)
      )
    )
  )
)
WITH CHECK (organization_id = opscore_current_tenant());

COMMENT ON FUNCTION opscore_field_context_allows_site(DOUBLE PRECISION,DOUBLE PRECISION,TIMESTAMPTZ,TIMESTAMPTZ)
IS 'Contextual field access: tenant/user context + 50m PostGIS radius + optional appointment time window. Deployment contract only until live DB proof exists.';
