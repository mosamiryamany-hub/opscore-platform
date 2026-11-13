'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const hierarchy = fs.readFileSync(path.join(ROOT, 'db', 'postgresql_hierarchy_rls.sql'), 'utf8');
const migration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '023_contextual_sync_and_rls.sql'), 'utf8');
const accessModeMigration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '041_access_mode_guc_hardening.sql'), 'utf8');

function indexOfOrFail(haystack, needle) {
  const idx = haystack.indexOf(needle);
  assert.notEqual(idx, -1, `missing required SQL fragment: ${needle}`);
  return idx;
}

test('PostgreSQL RLS: access-mode helper is defined before any policy can reference it', () => {
  const fn = indexOfOrFail(hierarchy, 'CREATE OR REPLACE FUNCTION opscore_access_mode()');
  const auditPolicy = indexOfOrFail(hierarchy, 'CREATE POLICY opscore_tenant_isolation ON audit_log');
  assert.ok(fn < auditPolicy, 'opscore_access_mode() must exist before audit_log policy creation');
});

test('PostgreSQL RLS: access-mode helper accepts only canonical modes in bootstrap and migration chain', () => {
  const helpers = [hierarchy, migration, accessModeMigration];
  for (const sql of helpers) {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION opscore_access_mode()');
    assert.notEqual(start, -1, 'access-mode helper must be defined');
    const end = sql.indexOf('$;', start);
    assert.notEqual(end, -1, 'access-mode helper must have a complete SQL body');
    const helper = sql.slice(start, end + 3);
    assert.match(helper, /WHEN current_setting\('app\.access_mode', true\) IN \('field','auth','system','backoffice'\)/);
    assert.match(helper, /ELSE ''/);
    assert.doesNotMatch(helper, /SELECT COALESCE\(current_setting\('app\.access_mode', true\), ''\)/);
  }
});

test('PostgreSQL RLS: evidence upload chunks are explicitly force-RLS protected through parent tenant', () => {
  indexOfOrFail(hierarchy, 'ALTER TABLE evidence_upload_chunks ENABLE ROW LEVEL SECURITY;');
  indexOfOrFail(hierarchy, 'ALTER TABLE evidence_upload_chunks FORCE ROW LEVEL SECURITY;');
  indexOfOrFail(hierarchy, 'CREATE POLICY opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks AS RESTRICTIVE');
  indexOfOrFail(migration, 'ALTER TABLE evidence_upload_chunks ENABLE ROW LEVEL SECURITY;');
  indexOfOrFail(migration, 'ALTER TABLE evidence_upload_chunks FORCE ROW LEVEL SECURITY;');
  indexOfOrFail(migration, 'CREATE POLICY opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks AS RESTRICTIVE');
  assert.doesNotMatch(
    hierarchy,
    /FOREACH t IN ARRAY ARRAY\[[^\]]*'evidence_upload_chunks'/s,
    'evidence_upload_chunks must not be treated as a normal organization_id table'
  );
});

test('PostgreSQL RLS: evidence upload chunk policy validates the parent upload on both read and write', () => {
  const match = /CREATE POLICY opscore_evidence_upload_chunks_tenant ON evidence_upload_chunks AS RESTRICTIVE\s*USING \(EXISTS \((.*?)\)\)\s*WITH CHECK \(EXISTS \((.*?)\)\);/s.exec(hierarchy);
  assert.ok(match, 'chunk tenant policy must have both USING and WITH CHECK');
  for (const block of [match[1], match[2]]) {
    assert.match(block, /u\.id = evidence_upload_chunks\.upload_id/);
    assert.match(block, /u\.organization_id = opscore_current_tenant\(\)/);
  }
});

test('GitHub Actions: CI/release workflows use immutable full-SHA action references', () => {
  const workflowDir = path.join(ROOT, '..', '.github', 'workflows');
  for (const name of ['opscore-ci.yml', 'opscore-secure-release.yml', 'digital-twin-postgres-live.yml']) {
    const workflow = fs.readFileSync(path.join(workflowDir, name), 'utf8');
    const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)(?:\s+#.*)?/g)].map((m) => m[1]);
    assert.ok(uses.length > 0, `${name} must declare workflow actions`);
    for (const ref of uses) {
      assert.match(ref, /^[^@]+@[0-9a-f]{40}$/i, `${name}: action reference must be a full 40-character commit SHA: ${ref}`);
    }
  }
});

test('GitHub Actions: a real PostgreSQL 18 service runs the live digital-twin RLS gate', () => {
  const workflowPath = path.join(ROOT, '..', '.github', 'workflows', 'digital-twin-postgres-live.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /image:\s*postgis\/postgis:18-3\.7/);
  assert.match(workflow, /postgresql-18-pgvector/);
  assert.match(workflow, /POSTGRES_DB:\s*opscore_test/);
  assert.match(workflow, /OPSC_PG_TEST_URL:\s*postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/opscore_test/);
  assert.match(workflow, /- name: Install root-pinned PostgreSQL runtime dependency\s+run: npm ci --ignore-scripts/);
  assert.match(workflow, /- name: Install backend package\s+working-directory: backend\s+run: npm ci --ignore-scripts --omit=peer/);
  assert.doesNotMatch(workflow, /npm install --no-save --package-lock=false --ignore-scripts pg@8\.23\.0/);
  assert.match(workflow, /npm run db:postgres-live-rls/);
  assert.match(workflow, /workflow_call:\s*\n\s+outputs:/);
  assert.match(workflow, /acceptance_evidence_b64/);
  assert.doesNotMatch(workflow, /^\s+push:/m, 'main deploy invokes this workflow; do not start a duplicate push-triggered run');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /OPSC_PG_ACCEPTANCE_RESULT_FILE:/);
  assert.match(workflow, /CI_COMMIT_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /CI_PIPELINE_ID:\s*\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /POSTGRES_ACCEPTANCE_CLEANUP_NOT_PASS/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
});

test('PostgreSQL RLS: persistent digital-twin chain has migration, canonical schema, and tenant isolation', () => {
  const canonical = fs.readFileSync(path.join(ROOT, 'db', 'postgresql_schema.sql'), 'utf8');
  const chainMigration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '031_digital_twin_chain_hardening.sql'), 'utf8');
  indexOfOrFail(canonical, 'CREATE TABLE IF NOT EXISTS operational_twin_chain_events');
  indexOfOrFail(chainMigration, 'CREATE TABLE IF NOT EXISTS operational_twin_chain_events');
  const tenantFunction = indexOfOrFail(chainMigration, 'CREATE OR REPLACE FUNCTION opscore_current_tenant()');
  const tenantPolicy = indexOfOrFail(chainMigration, 'CREATE POLICY opscore_tenant_isolation ON operational_twin_chain_events');
  assert.ok(tenantFunction < tenantPolicy, 'migration must define the tenant helper before policy creation');
  indexOfOrFail(chainMigration, 'ALTER TABLE operational_twin_chain_events ENABLE ROW LEVEL SECURITY;');
  indexOfOrFail(chainMigration, 'ALTER TABLE operational_twin_chain_events FORCE ROW LEVEL SECURITY;');
  indexOfOrFail(chainMigration, 'USING (organization_id = opscore_current_tenant())');
  indexOfOrFail(chainMigration, 'WITH CHECK (organization_id = opscore_current_tenant())');
  assert.match(hierarchy, /'operational_twin_snapshots','operational_twin_chain_events','decision_replays'/);
});

test('PostgreSQL parity gate compares every SQLite table to canonical schema, migrations, and twin-chain RLS', () => {
  const cp = require('node:child_process');
  const output = cp.execFileSync(process.execPath, ['scripts/postgres-parity-check.js'], { cwd: ROOT, encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.missingInPostgresCanonical, []);
  assert.deepEqual(report.missingInPostgresMigrations, []);
  assert.deepEqual(report.missingCanonicalTablesInMigrations, []);
  assert.deepEqual(report.missingRlsCoverage, []);
});

test('PostgreSQL RLS: session access policy binds field-mode writes to both user and tenant', () => {
  const identityMigration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '032_identity_plane_rls.sql'), 'utf8');
  const sessionMigration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '033_sessions_rls_boundary.sql'), 'utf8');
  for (const source of [identityMigration, sessionMigration, hierarchy]) {
    const start = indexOfOrFail(source, 'CREATE POLICY opscore_identity_sessions ON sessions FOR ALL');
    const policy = source.slice(start, start + 1400);
    assert.match(policy, /user_id = opscore_current_user\(\)/);
    assert.match(policy, /organization_id = opscore_current_tenant\(\)/);
    assert.match(policy, /NULLIF\(current_setting\('app\.tenant_id', true\), ''\) IS NOT NULL/);
    assert.match(policy, /WITH CHECK/);
  }
  assert.match(sessionMigration, /DROP POLICY IF EXISTS opscore_tenant_isolation ON sessions/);
  assert.match(hierarchy, /Session policy must be the final policy for sessions/);
});

test('PostgreSQL RLS: restrictive tenant boundary closes auth-mode policy OR bypass', () => {
  const tenantBoundaryMigration = fs.readFileSync(path.join(ROOT, 'sql', 'postgres', '034_close_auth_mode_tenant_bypass.sql'), 'utf8');
  assert.ok(tenantBoundaryMigration.includes('CREATE POLICY opscore_tenant_boundary_guard ON %I.organizations AS RESTRICTIVE FOR ALL'));
  assert.ok(tenantBoundaryMigration.includes('CREATE POLICY opscore_tenant_boundary_guard ON %I.%I AS RESTRICTIVE FOR ALL'));
  assert.ok(tenantBoundaryMigration.includes('organization_id::text = opscore_current_tenant()'));
  assert.ok(tenantBoundaryMigration.includes('id::text = opscore_current_tenant()'));
  assert.ok(tenantBoundaryMigration.includes("c.relname <> 'sessions'"));
  assert.ok(tenantBoundaryMigration.includes("ARRAY[''system'',''backoffice'']"));
  assert.ok(!tenantBoundaryMigration.includes("opscore_access_mode() = 'auth'"));
  assert.match(hierarchy, /opscore_tenant_boundary_guard/);
  assert.ok(hierarchy.includes('DO $rls_init$'));
  assert.ok(hierarchy.includes('END $rls_init$;'));
  assert.ok(hierarchy.includes('DO $tenant_guard$'));
  assert.ok(hierarchy.includes('END $tenant_guard$;'));
  assert.ok(!hierarchy.includes('END $;'));

  const identityGate = fs.readFileSync(path.join(ROOT, 'scripts', 'postgres-identity-rls-gate.js'), 'utf8');
  assert.ok(identityGate.includes("opscore_access_mode() = 'auth' OR organization_id = opscore_current_tenant()"));
  assert.ok(identityGate.includes('fixture-reproduces-auth-organization-bypass'));
  assert.ok(identityGate.includes('fixture-reproduces-auth-customer-bypass'));
  assert.ok(identityGate.includes('auth-mode-cannot-read-cross-tenant-customer'));
  assert.ok(identityGate.includes('auth-mode-cross-tenant-customer-insert-denied'));
});


test('PostgreSQL runtime binds tenant, user and access mode atomically and fails closed on context errors', () => {
  const sync = fs.readFileSync(path.join(ROOT, 'src', 'pg-database-sync.js'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'src', 'pg-sync-worker.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(sync, /setSession\(\{ tenantId = '', userId = '', accessMode = 'field' \} = \{\}/);
  assert.match(sync, /userId: userId == null \? '' : String\(userId\)/);
  assert.match(sync, /userId: options\.userId/);
  assert.match(worker, /set_config\('app\.tenant_id', \$1, false\), set_config\('app\.user_id', \$2, false\), set_config\('app\.access_mode', \$3, false\)/);
  assert.match(server, /tenantId: c\.organizationId, userId: c\.userId \|\| '', accessMode: 'field'/);
  assert.match(server, /DATABASE_SECURITY_CONTEXT_FAILED/);
  assert.match(server, /userId: out\.userId \|\| out\.user\?\.id \|\| '', accessMode: 'field'/);
});
