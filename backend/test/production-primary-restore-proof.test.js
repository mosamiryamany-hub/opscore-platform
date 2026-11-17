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
    'schemaSha256', 'tableInventorySha256', 'testedAt'
  ]) {
    assert.ok(runner.includes(fragment), 'missing proof assertion: ' + fragment);
  }
  assert.ok(proofSpec.includes('POST /snapshots/{snapshot_id}/restore'));
  assert.ok(proofSpec.includes('finalize_restore=false'));
});

test('proof runner Python syntax is valid without creating bytecode files', () => {
  const result = spawnSync('python3', [
    '-c',
    'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    path.join(root, 'scripts', 'neon_primary_restore_proof.py')
  ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'Python syntax check failed');
});
