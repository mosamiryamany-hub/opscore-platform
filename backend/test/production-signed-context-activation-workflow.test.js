'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'ops-apply-production-signed-context-migrations.yml'),
  'utf8'
);
const helper = fs.readFileSync(
  path.join(root, 'scripts', 'neon_apply_production_signed_context_migrations.py'),
  'utf8'
);
const proofRunner = fs.readFileSync(
  path.join(root, 'scripts', 'neon_primary_restore_proof.py'),
  'utf8'
);
const restoreProofSpec = fs.readFileSync(
  path.join(root, 'docs', 'ops', 'PRODUCTION_PRIMARY_RESTORE_PROOF_SPEC.md'),
  'utf8'
);

test('Production migration-state verification is manual, exact-confirmation, main-only and references the production Environment', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /VERIFY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS/);
  assert.match(workflow, /read-only/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment:\s*\n\s+name: production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /OPSC_PRODUCTION_RESTORE_PROOF_SHA256/);
});

test('Production migration helper binds the exact Primary, database, owner role, direct endpoint and restore proof', () => {
  assert.match(helper, /summer-leaf-18448271/);
  assert.match(helper, /br-proud-salad-bcshhdap/);
  assert.match(helper, /opscore_acceptance/);
  assert.match(helper, /neondb_owner/);
  assert.match(helper, /pooled=false/);
  assert.match(helper, /"-pooler" in host/);
  assert.match(helper, /OPSC_PRODUCTION_RESTORE_PROOF_SHA256/);
  assert.match(helper, /PRODUCTION_PRIMARY_RESTORE_PROOF_SHA256_MISMATCH/);
  assert.match(helper, /PRODUCTION_RESTORE_BRANCH_SNAPSHOT_PROVENANCE_MISMATCH/);
  assert.match(helper, /age_seconds/);
  assert.match(restoreProofSpec, /PRODUCTION_PRIMARY_RESTORE_PROOF\.json/);
  assert.match(restoreProofSpec, /opscore\\.neon-primary-restore-proof\\.v2/);
});

test('Production migration-state verification requires 063–069 already applied with exact ledger checksums and no pending work', () => {
  for (const filename of [
    '063_signed_tenant_context_verifier.sql',
    '064_signed_tenant_context_work_orders_routing.sql',
    '065_signed_tenant_context_evidence_upload_chunks.sql',
    '066_signed_tenant_context_verifier_search_path_hardening.sql',
    '067_signed_tenant_context_rls_policy_accessor_alignment.sql',
    '068_opscore_app_role_privilege_lockdown.sql',
    '069_technician_location_trail_tenant_persistence.sql',
  ]) {
    assert.ok(proofRunner.includes(filename), 'missing required Production migration ' + filename);
  }
  assert.ok(helper.includes('plan.get("status") != "DRY_RUN_PASS"'));
  assert.match(helper, /PRODUCTION_MIGRATION_UNEXPECTED_PENDING_SET/);
  assert.match(helper, /exact-ledger-checksum-match/);
  assert.match(helper, /PRODUCTION_MIGRATION_ALREADY_APPLIED_CHECKSUM_PLAN_INVALID/);
  assert.match(helper, /PRODUCTION_MIGRATIONS_ALREADY_APPLIED_AND_VERIFIED=PASS/);
  assert.match(helper, /PRODUCTION_SCHEMA_WRITES=0/);
  assert.doesNotMatch(helper, /report.get\("status"\) != "APPLIED_AND_VERIFIED"/);
  assert.match(helper, /PRODUCTION_MIGRATION_DEPLOYMENT_NOT_STARTED=true/);
});

test('Production migration path uses only the guarded official runner and never deploys or deletes data', () => {
  assert.match(helper, /apply-postgres-migrations\.js/);
  assert.match(helper, /OPSC_MIGRATION_TARGET_CLASS": "production"/);
  assert.match(helper, /OPSC_MIGRATION_ALLOW_PRODUCTION": "1"/);
  assert.match(helper, /OPSC_MIGRATION_EXPECTED_BRANCH_ID/);
  assert.match(helper, /OPSC_MIGRATION_CONFIRM_BRANCH_ID/);
  assert.doesNotMatch(helper, /subprocess\.run\(\[.*psql/);
  assert.doesNotMatch(helper, /DELETE FROM|DROP TABLE|DROP SCHEMA|finalize_restore/i);
  assert.match(workflow, /No Vercel deployment was started/);
  assert.match(workflow, /No HMAC key was rotated/);
  assert.match(workflow, /No signed-route or traffic-hold flag was changed/);
});

test('Production migration helper has valid Python syntax without writing bytecode', () => {
  const result = spawnSync('python3', [
    '-c',
    'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    path.join(root, 'scripts', 'neon_apply_production_signed_context_migrations.py'),
  ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'python syntax check failed');
});
