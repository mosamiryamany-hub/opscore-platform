'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const workflowDir = path.join(root, '.github', 'workflows');
const previewApplyPath = path.join(workflowDir, 'apply-preview-migrations.yml');
const previewApply = fs.readFileSync(previewApplyPath, 'utf8');

test('Preview migrations require one exact pinned non-primary branch and the application database', () => {
  assert.match(previewApply, /branch:[\s\S]*?required: true[\s\S]*?default: "br-muddy-pine-bbrexgxx"/);
  assert.ok(previewApply.includes("pull_request:\n    branches:\n      - main\n    paths:"));
  assert.ok(previewApply.includes("github.head_ref == 'ops/acceptance-neon-target-2026-11-19'"));
  assert.match(previewApply, /database:[\s\S]*?required: true[\s\S]*?default: "opscore_acceptance"/);
  assert.match(previewApply, /INPUT_DB.*opscore_acceptance/);
  assert.match(previewApply, /OPSC_MIGRATION_TARGET_CLASS: preview/);
  assert.match(previewApply, /OPSC_MIGRATION_EXPECTED_OWNER_ROLE: neondb_owner/);
  assert.ok(previewApply.includes("('OPSC_MIGRATION_DATABASE_URL','neondb_owner','owner.uri')"));
  assert.match(previewApply, /OPSC_PREVIEW_BOOTSTRAP_DATABASE_URL/);
  assert.match(previewApply, /checks=[\s\S]*?OPSC_PREVIEW_BOOTSTRAP_DATABASE_URL','opscore_owner','bootstrap\.uri'/);
  assert.match(previewApply, /PREVIEW_BOOTSTRAP_LOGIN_ROLE_MUST_BE_OPSCORE_OWNER/);
  assert.match(previewApply, /PREVIEW_MIGRATION_OWNER_PRIVILEGES_INVALID/);
  assert.match(previewApply, /GRANT CREATE ON DATABASE opscore_acceptance TO neondb_owner/);
  assert.match(previewApply, /has_database_privilege\('neondb_owner',current_database\(\),'CREATE'\)/);
  assert.doesNotMatch(previewApply, /CREATE ROLE opscore_app/);
  assert.doesNotMatch(previewApply, /OPSC_MIGRATION_PREVIEW_ALLOW_UNREVOCABLE_APP_MEMBERS/);
  assert.match(previewApply, /GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_owner/);
  assert.doesNotMatch(previewApply, /has_sequence_privilege\('neondb_owner'/);
  const previewApplyLines = previewApply.split(/\r?\n/);
  assert.equal(previewApplyLines.some(line => line.trim() === 'DO $'), false);
  assert.equal(previewApplyLines.some(line => line.trim() === 'END $;'), false);
  assert.equal(previewApplyLines.some(line => line.trim() === 'THEN' && line.length - line.trimStart().length < 10), false);
  assert.equal(previewApplyLines.filter(line => line.trim() === 'DO $$').length, previewApplyLines.filter(line => line.trim() === 'END $$;').length);

  assert.match(previewApply, /NEON_MIGRATION_BOOTSTRAP_AND_RUNTIME_CONNECTIONS=PASS roles=neondb_owner,opscore_owner,opscore_runtime TLS=verify-full/);
  assert.match(previewApply, /chmod 600 [^\n]*owner\.uri[^\n]*runtime\.uri[^\n]*bootstrap\.uri/);
  assert.match(previewApply, /PREVIEW_MIGRATION_LOGIN_ROLE_MUST_BE_NEONDB_OWNER/);
  assert.match(previewApply, /PREVIEW_BOOTSTRAP_ROLE_CAPABILITIES_INVALID/);
  assert.match(previewApply, /PREVIEW_MIGRATION_HASHES_057_065_070=PASS/);
  assert.match(previewApply, /st != \"APPLIED_AND_VERIFIED\"/);
  assert.match(previewApply, /APPLY_STATUS_NOT_VERIFIED/);
  assert.doesNotMatch(previewApply, /PREVIEW_MIGRATION_APPLY=NOT_APPLICABLE_ROLE_MODEL/);
  assert.doesNotMatch(previewApply, /PREVIEW_ACCEPTANCE=PASS_WITH_ROLE_MODEL_LIMITATION/);
  assert.doesNotMatch(previewApply, /CREATE ROLE neondb_owner|ALTER ROLE neondb_owner/);
  assert.match(previewApply, /OPSC_MIGRATION_PINNED_NEON_IDENTITY: '1'/);
  assert.match(previewApply, /STATIC_EXACT_PREVIEW_TARGET/);
  assert.match(previewApply, /DRY_RUN_NEON_PINNED_IDENTITY_MISMATCH/);
  assert.match(previewApply, /APPLY_NEON_PINNED_IDENTITY_MISMATCH/);
  assert.match(previewApply, /OPSC_MIGRATION_EXPECTED_BRANCH_ID/);
  assert.match(previewApply, /OPSC_MIGRATION_CONFIRM_BRANCH_ID/);
  assert.match(previewApply, /BRANCH_ID=\x27br-muddy-pine-bbrexgxx\x27/);
  assert.match(previewApply, /PRIMARY_BRANCH_ID=\x27br-weathered-tree-bbha3dx4\x27/);
  assert.match(previewApply, /OPSC_MIGRATION_DATABASE_URL/);
  assert.match(previewApply, /OPSC_ACCEPTANCE_RUNTIME_DATABASE_URL/);
  assert.match(previewApply, /VERCEL_NEON_CONNECTION_IDENTITY_MISMATCH/);
  assert.match(previewApply, /api\.vercel\.com\/v1\/projects/);
  assert.doesNotMatch(previewApply, /api\.vercel\.com\/v10\/projects/);
  assert.match(previewApply, /2ACxh1Oi5TWMDn5v/);
  assert.doesNotMatch(previewApply, /NEON_API_KEY|reveal_password/);
  assert.match(previewApply, /sslmode.*verify-full/);
  assert.doesNotMatch(previewApply, /summer-leaf-18448271/);
  assert.match(previewApply, /node-version: "22\.23\.4"/);
  assert.doesNotMatch(previewApply, /auto-detect|any\(k in lname|dry-run\.json" \|\| true/);
});

test('dedicated direct SQL Preview 068 workflow is removed in favor of the guarded migration runner', () => {
  assert.equal(fs.existsSync(path.join(workflowDir, 'apply-preview-migration-068.yml')), false);
});

test('every third-party GitHub Action used by repository workflows is pinned to a full commit SHA', () => {
  const files = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name));
  const floating = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
      const action = match[1];
      if (action.startsWith('./')) continue;
      if (!/^[^@]+@[a-f0-9]{40}$/.test(action)) floating.push(file + ':' + action);
    }
  }
  assert.deepEqual(floating, []);
});

test('historical migrations tolerate the absent legacy opscore_app role without weakening runtime RLS', () => {
  const sqlDir = path.join(root, 'backend', 'sql', 'postgres');
  const read = name => fs.readFileSync(path.join(sqlDir, name), 'utf8');
  const guarded = [
    '023_contextual_sync_and_rls.sql',
    '043_work_order_context_privileged_definer.sql',
    '046_migration_ledger_access_lockdown.sql',
    '047_control_plane_runtime_privileges.sql',
    '048_system_table_app_grants.sql',
    '049_app_role_table_privileges.sql',
    '050_app_role_schema_create.sql',
    '051_revoke_runtime_role_ddl_privileges.sql',
    '061_operational_autopilot_tenant_persistence.sql'
  ];
  for (const name of guarded) {
    const source = read(name);
    assert.match(source, /IF EXISTS\s*\(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname\s*=\s*'opscore_app'\)/, name);
  }
  const systemRls = read('044_system_tables_rls.sql');
  assert.match(systemRls, /policy_role\s*:=\s*'opscore_runtime'/);
  assert.match(systemRls, /CREATE POLICY opscore_system_table_guard/);
  assert.match(systemRls, /ENABLE ROW LEVEL SECURITY/);
  assert.match(systemRls, /FORCE ROW LEVEL SECURITY/);
  const legacy = read('068_opscore_app_role_privilege_lockdown.sql');
  assert.match(legacy, /OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED/);
  assert.doesNotMatch(previewApply, /CREATE ROLE opscore_app/);
  const migrationRunner = fs.readFileSync(path.join(root, 'backend', 'scripts', 'apply-postgres-migrations.js'), 'utf8');
  assert.match(migrationRunner, /set_config\('opscore\.app_role',CASE WHEN EXISTS\(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname='opscore_app'\) THEN 'opscore_app' ELSE '' END,true\)/);
  assert.doesNotMatch(migrationRunner, /set_config\('opscore\.app_role','opscore_app'/);
});

test('Preview HTTP acceptance passes the bootstrap URL only to exact-target fixture cleanup', () => {
  assert.match(previewApply, /OPSC_PG_ACCEPTANCE_CLEANUP_URL=.*bootstrap\.uri/);
  assert.match(previewApply, /OPSC_PG_ACCEPTANCE_CLEANUP_HOST='ep-green-frog-bbyayuh5\.c-15\.us-east-1\.aws\.neon\.tech'/);
  const httpStepStart = previewApply.indexOf('Run PostgreSQL HTTP commercial acceptance against isolated Neon');
  const finalizeStepStart = previewApply.indexOf('Finalize Preview acceptance gate', httpStepStart);
  assert.ok(httpStepStart >= 0 && finalizeStepStart > httpStepStart);
  const httpStep = previewApply.slice(httpStepStart, finalizeStepStart);
  assert.match(httpStep, /OPSC_PG_ACCEPTANCE_URL=.*runtime\.uri/);
  assert.match(httpStep, /OPSC_PG_ACCEPTANCE_CLEANUP_URL=.*bootstrap\.uri/);
  assert.doesNotMatch(httpStep, /OPSC_MIGRATION_DATABASE_URL/);
});
