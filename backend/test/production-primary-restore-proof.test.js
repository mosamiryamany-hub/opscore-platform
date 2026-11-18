'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ops-primary-restore-proof.yml'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts', 'neon_primary_restore_proof.py'), 'utf8');
const proofSpec = fs.readFileSync(path.join(root, 'docs', 'ops', 'PRODUCTION_PRIMARY_RESTORE_PROOF_SPEC.md'), 'utf8');

test('Primary restore proof workflow is manual, main-only, and uses the pinned checkout action', () => {
  assert.ok(workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
  assert.ok(workflow.includes("github.event.inputs.confirm == 'CREATE_PRIMARY_RESTORE_PROOF'"));
  assert.ok(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('if-no-files-found: error'));
});

test('proof runner requires an explicit snapshot ID and rejects stale implicit defaults', () => {
  assert.ok(runner.includes('SNAPSHOT_ID = os.environ.get("OPSC_PRIMARY_SNAPSHOT_ID", "").strip()'));
  assert.ok(runner.includes('PRODUCTION_SNAPSHOT_ID_REQUIRED'));
  assert.ok(workflow.includes('OPSC_PRIMARY_SNAPSHOT_ID: ${{ github.event.inputs.snapshot_id }}'));
  assert.ok(!runner.includes('snap-floral-sea-bcug7fd3'));
});

test('proof runner calls Neon Restore Snapshot endpoint and explicitly prevents finalization', () => {
  assert.ok(runner.includes('"/snapshots/" + SNAPSHOT_ID + "/restore"'));
  assert.ok(runner.includes('"finalize_restore": False'));
  assert.ok(runner.includes('"target_branch_id": PRIMARY_BRANCH_ID'));
  assert.ok(runner.includes('restored_from'));
  assert.ok(runner.includes('restore_status'));
  assert.ok(runner.includes('restored_as'));
  assert.ok(!runner.includes('api("POST", "/branches"'));
  assert.ok(runner.includes('BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION'));
});

test('proof runner checks database identity, migration baseline, RLS and runtime role boundary', () => {
  for (const fragment of [
    'current_database()', 'current_user', 'server_version',
    'schema_migrations', '068_opscore_app_role_privilege_lockdown.sql',
    '063_signed_tenant_context_verifier.sql',
    '069_technician_location_trail_tenant_persistence.sql',
    'rolsuper', 'rolbypassrls', 'relrowsecurity', 'relforcerowsecurity',
    'SET LOCAL ROLE opscore_runtime', 'RESTORE_PROOF_RUNTIME_RLS_DEFAULT_DENY_FAILED',
    'SCHEMA_INVENTORY_SQL', 'schema_inventory(primary_uri)', 'table_data_inventory(primary_uri)',
    'RESTORE_PROOF_SCHEMA_DIFFERS_FROM_CURRENT_PRIMARY',
    'RESTORE_PROOF_TABLE_DATA_DIFFERS_FROM_CURRENT_PRIMARY',
    'schemaSha256', 'schemaInventoryItemCount', 'tableInventorySha256', 'dataContentSha256',
    'row_content_sha256', 'testedAt'
  ]) {
    assert.ok(runner.includes(fragment), 'missing proof assertion: ' + fragment);
  }
  assert.ok(proofSpec.includes('POST /projects/{project_id}/snapshots/{snapshot_id}/restore'));
  assert.ok(proofSpec.includes('finalize_restore: false'));
});

test('proof runner Python syntax is valid without creating bytecode files', () => {
  const result = spawnSync('python3', [
    '-c',
    'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    path.join(root, 'scripts', 'neon_primary_restore_proof.py')
  ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'Python syntax check failed');
});

test('Production migration preflight accepts only the proof checks object-map contract and validates every check', () => {
  const migrationRunner = fs.readFileSync(
    path.join(root, 'scripts', 'neon_apply_production_signed_context_migrations.py'),
    'utf8'
  );
  assert.ok(migrationRunner.includes('if not isinstance(checks, dict):'));
  assert.ok(migrationRunner.includes('set(checks) != required_checks'));
  assert.ok(migrationRunner.includes('PRODUCTION_PRIMARY_RESTORE_PROOF_SNAPSHOT_CHECK_INVALID'));
  assert.ok(migrationRunner.includes('PRODUCTION_PRIMARY_RESTORE_PROOF_RUNTIME_RLS_DEFAULT_DENY_FAILED'));
  assert.ok(migrationRunner.includes('PRODUCTION_RESTORE_BRANCH_TARGET_MISMATCH'));
  assert.ok(migrationRunner.includes('import neon_primary_restore_proof as restore_proof'));
  assert.ok(migrationRunner.includes('PRODUCTION_RESTORE_PROOF_SCHEMA_NO_LONGER_MATCHES_PRIMARY'));
  assert.ok(migrationRunner.includes('PRODUCTION_RESTORE_PROOF_PUBLIC_TABLE_DATA_NO_LONGER_MATCHES_PRIMARY'));
  const helperStart = runner.indexOf('def table_data_inventory(uri):');
  const helperEnd = runner.indexOf('\n\ndef verify_signed_context_catalog(uri):', helperStart);
  const inventoryHelper = runner.slice(helperStart, helperEnd);
  const mainBody = runner.slice(runner.indexOf('def main():'));
  assert.ok(inventoryHelper.includes('psql(uri,'));
  assert.ok(!inventoryHelper.includes('psql(restore_uri,'));
  assert.ok(mainBody.includes('psql(restore_uri,'));
  assert.ok(migrationRunner.includes('dataContentSha256'));
  assert.ok(migrationRunner.includes('schemaInventoryItemCount'));
  assert.ok(migrationRunner.includes('rowContentParityWithPrimary'));
  assert.ok(migrationRunner.includes('REQUIRED_APPLIED_MIGRATIONS'));
  assert.ok(migrationRunner.includes('VERIFY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS'));
  assert.ok(migrationRunner.includes('PRODUCTION_SCHEMA_WRITES=0'));
  assert.ok(!migrationRunner.includes('if not isinstance(checks, list):'));
});

test('checked-in historical v1 restore proof cannot satisfy the current v2 signed-context gate', () => {
  const proof = JSON.parse(fs.readFileSync(
    path.join(root, 'docs', 'ops', 'evidence', 'PRODUCTION_PRIMARY_RESTORE_PROOF.json'),
    'utf8'
  ));
  assert.equal(proof.status, 'SUPERSEDED');
  assert.equal(proof.schemaVersion, 'opscore.neon-primary-restore-proof.v1');
  assert.equal(proof.checks.signed_context_schema, undefined);
  assert.equal(proof.checks.migration_ledger_read.requiredMigrationsPresentAndChecksummed, undefined);
});
