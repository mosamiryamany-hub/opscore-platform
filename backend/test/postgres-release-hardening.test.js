'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('password-reset migration is a constrained SECURITY DEFINER with a strict expiry ceiling', () => {
  const sql = read('backend/sql/postgres/045_password_reset_token_definer_hardening.sql');
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = %I, pg_temp/);
  assert.match(sql, /SET row_security = off/);
  assert.match(sql, /p_expires_at <= clock_timestamp\(\)/);
  assert.match(sql, /p_expires_at >= clock_timestamp\(\) \+ interval '30 minutes'/);
  assert.match(sql, /am\.role = ANY \(ARRAY\['owner','admin'\]\)/);
  assert.match(sql, /u\.status = 'active'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION/);
  assert.doesNotMatch(sql, /p_expires_at > clock_timestamp\(\) \+ interval '30 minutes'/);
});

test('migration ledger lockdown is owner-only and denies application runtime grants', () => {
  const sql = read('backend/sql/postgres/046_migration_ledger_access_lockdown.sql');
  assert.match(sql, /ALTER TABLE public\.schema_migrations ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.schema_migrations FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR ALL\s+TO neondb_owner\s+USING \(true\)\s+WITH CHECK \(true\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.schema_migrations FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.schema_migrations FROM opscore_app/);
  assert.match(sql, /schema_migrations is required/);
});

test('migration runner enforces postconditions for ledger, runtime grants and privileged routines', () => {
  const runner = read('backend/scripts/apply-postgres-migrations.js');
  assert.match(runner, /ledger_forced_rls/);
  assert.match(runner, /app_can_select/);
  assert.match(runner, /app_can_insert/);
  assert.match(runner, /app_can_update/);
  assert.match(runner, /app_can_delete/);
  assert.match(runner, /privileged_is_definer/);
  assert.match(runner, /reset_token_row_security_off/);
  assert.match(runner, /MIGRATION_POSTCONDITION_FAILED/);
  assert.match(runner, /INSERT INTO public\.schema_migrations\(filename,sha256,applied_at\)/);
});

test('live database proof checks PostGIS write boundary and forced migration ledger', () => {
  const proof = read('backend/src/database-security-proof.js');
  assert.match(proof, /spatial_ref_sys_runtime_write_access_count/);
  assert.match(proof, /migration_ledger_table_count/);
  assert.match(proof, /migration_ledger_without_force_rls_count/);
  assert.match(proof, /migration_ledger_runtime_privileges_count/);
  assert.match(proof, /OWNER_ONLY/);
  assert.match(proof, /IDENTITY_PLANE_RLS_ENFORCED/);
});

test('rollback-only PostgreSQL identity gate exercises future-table grants under tenant RLS', () => {
  const gate = read('backend/scripts/postgres-identity-rls-gate.js');
  assert.match(gate, /future_tenant_table/);
  assert.match(gate, /ENABLE ROW LEVEL SECURITY/);
  assert.match(gate, /FORCE ROW LEVEL SECURITY/);
  assert.match(gate, /future-table-runtime-crud-grants-present/);
  assert.match(gate, /future-table-cross-tenant-insert-denied/);
  assert.match(gate, /future-table-cross-tenant-update-denied/);
  assert.match(gate, /ROLLBACK/);
});

test('commercial sales HTML has balanced document and section structure and no obsolete pricing', () => {
  const html = read('docs/commercial/COMMERCIAL_SALES_PAGE.html');
  for (const tag of ['html', 'head', 'body', 'section', 'p', 'ul', 'li']) {
    const open = (html.match(new RegExp('<' + tag + '(?:\\s|>)', 'gi')) || []).length;
    const close = (html.match(new RegExp('</' + tag + '\\s*>', 'gi')) || []).length;
    assert.equal(open, close, tag + ' tags must be balanced');
  }
  assert.doesNotMatch(html, /Gumroad|Codespine|Launch Price|Regular Price|\$\s?(?:39|49|147|250|500)\b/i);
  assert.match(html, /Buyer responsibilities/);
  assert.match(html, /AI\/machine translation notice/);
  assert.match(html, /NOT_ESTABLISHED/);
});

test('current-facing handoff docs do not refer to superseded baseline identifiers', () => {
  const files = [
    'BUYER_DELIVERY.md',
    'CLIENT_INSPECTION_PACKAGE_STATUS.md',
    'CLOSEOUT_EXECUTION_RUNBOOK.md',
    'COMMERCIAL_CLOSURE_STATUS.md',
    'COMMERCIAL_RELEASE_STATUS.md',
    'DELIVERY_MANIFEST.md',
    'SALES_KIT.md',
    'SALES_README.md',
    'docs/COMMERCIAL_HANDOFF.md',
    'docs/release/RELEASE_SCOPE.md',
    'mobile/docs/MOBILE_SECURITY_RESIDUAL.md',
    'docs/00-START-HERE/BUYER_QUICKSTART.md',
    'docs/commercial/BUYER_INSTALLATION_GUIDE.md',
    'docs/runbooks/PRODUCTION_READINESS.md'
  ];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /3013038647|0f8c43ee/);
    assert.match(text, /buyer|customer/i);
    assert.match(text, /mobile|android|ios/i);
    assert.match(text, /translation|locale|ترجمة/i);
  }
});


test('commercial closure cannot reuse historical PostgreSQL HTTP acceptance PASS', () => {
  const gate = read('backend/scripts/commercial-closure-gate.js');
  assert.match(gate, /acc\.commit \|\| acc\.testedCodeCommit \|\| acc\.sourceCommit/);
  assert.match(gate, /evidencePipelineId === expectedPipelineId/);
  assert.match(gate, /exactCurrentEvidence/);
  assert.match(gate, /historical PostgreSQL HTTP PASS exists/i);
  assert.match(gate, /PASS_WITH_BUYER_RESIDUALS/);
  assert.match(gate, /status === 'PASS' \|\| status === 'PASS_WITH_BUYER_RESIDUALS' \? 0/);
  assert.doesNotMatch(gate, /else if \(st === 'PASS'\)\s*\{\s*add\('postgres-http-acceptance-evidence', 'PASS'/);
});

test('public release proof exposes stale PostgreSQL HTTP acceptance as NOT_VERIFIED', () => {
  const proof = read('backend/src/release-proof.js');
  assert.match(proof, /readCurrentPostgresHttpAcceptance/);
  assert.match(proof, /evidencePipelineId === expectedPipelineId/);
  assert.match(proof, /postgresHttpAcceptance: postgresHttpAcceptance\.status/);
  const evidence = JSON.parse(read('backend/docs/verification/POSTGRES_HTTP_ACCEPTANCE_RESULT.json'));
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.currentHeadAcceptance, 'NOT_VERIFIED');
  assert.equal(evidence.evidenceClass, 'HISTORICAL_ACCEPTANCE_SNAPSHOT');
});

test('application runtime role does not retain database or public-schema CREATE privileges', () => {
  const migration = read('backend/sql/postgres/051_revoke_runtime_role_ddl_privileges.sql');
  assert.match(migration, /REVOKE CREATE ON DATABASE/);
  assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM opscore_app/);
  const runner = read('backend/scripts/apply-postgres-migrations.js');
  assert.match(runner, /app_can_create_database_schema/);
  assert.match(runner, /app_can_create_public_objects/);
  assert.match(runner, /post\.app_can_create_database_schema\|\|/);
  assert.match(runner, /post\.app_can_create_public_objects\|\|/);
});

test('commercial closure accepts explicitly named acceptance databases as disposable test targets', () => {
  const gate = read('backend/scripts/commercial-closure-gate.js');
  assert.match(gate, /hardening\|acceptance/);
  assert.match(gate, /Database name is not clearly marked as a test\/disposable database/);
});
