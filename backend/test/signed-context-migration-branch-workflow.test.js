'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'ops-signed-context-migration-branch.yml'),
  'utf8'
);
const runner = fs.readFileSync(
  path.join(root, 'scripts', 'neon_signed_context_migration_branch.py'),
  'utf8'
);

test('signed-context migration branch workflow uses pinned actions and the official guarded runner', () => {
  assert.ok(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'));
  assert.ok(workflow.includes('actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'));
  assert.ok(workflow.includes("node-version: '22.23.4'"));
  assert.ok(workflow.includes('npm ci --ignore-scripts'));
  assert.ok(workflow.includes('Create disposable child branch and apply 063–067 plus technician-trail 069'));
  assert.ok(!workflow.includes('actions/checkout@v4'));
  assert.ok(!workflow.includes('npm i -g'));
  assert.ok(!workflow.includes('psql -f'));
  assert.ok(!workflow.includes('repository_dispatch'));
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes("github.event.inputs.confirm == 'CREATE_SIGNED_CONTEXT_MIGRATION_BRANCH'"));
});

test('migration branch runner never deletes branches and requires free branch capacity', () => {
  assert.ok(runner.includes('if len(branches) >= 10:'));
  assert.ok(runner.includes('def list_all_branches():'));
  assert.ok(runner.includes('"limit": 100'));
  assert.ok(runner.includes('query["cursor"] = cursor'));
  assert.ok(runner.includes('pagination.get("next")'));
  assert.ok(runner.includes('NEON_BRANCH_PAGINATION_CURSOR_REPEATED'));
  assert.ok(runner.includes('NEON_BRANCH_PAGINATION_PAGE_LIMIT_EXCEEDED'));
  assert.ok(runner.includes('BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION'));
  assert.ok(!runner.includes('api("DELETE"'));
  assert.ok(!runner.includes('cleanup_old_mig'));
  assert.ok(!runner.includes('Delete prior failed mig branches'));
});

test('migration branch runner requires a direct endpoint and exact target identity', () => {
  assert.ok(runner.includes('"pooled": "false"'));
  assert.ok(runner.includes('"-pooler" in host'));
  assert.ok(runner.includes('OPSC_MIGRATION_TARGET_CLASS": "preview"'));
  for (const key of [
    'OPSC_MIGRATION_EXPECTED_DATABASE',
    'OPSC_MIGRATION_CONFIRM_DATABASE',
    'OPSC_MIGRATION_EXPECTED_HOST',
    'OPSC_MIGRATION_CONFIRM_HOST',
    'OPSC_MIGRATION_EXPECTED_PROJECT_ID',
    'OPSC_MIGRATION_CONFIRM_PROJECT_ID',
    'OPSC_MIGRATION_EXPECTED_BRANCH_ID',
    'OPSC_MIGRATION_CONFIRM_BRANCH_ID',
  ]) {
    assert.ok(runner.includes(key), 'missing exact migration identity binding: ' + key);
  }
  assert.ok(runner.includes('apply-postgres-migrations.js'));
  assert.ok(runner.includes('APPLIED_AND_VERIFIED'));
});

test('migration branch runner includes every schema prerequisite for the signed 67-route surface', () => {
  for (const filename of [
    '063_signed_tenant_context_verifier.sql',
    '064_signed_tenant_context_work_orders_routing.sql',
    '065_signed_tenant_context_evidence_upload_chunks.sql',
    '066_signed_tenant_context_verifier_search_path_hardening.sql',
    '067_signed_tenant_context_rls_policy_accessor_alignment.sql',
    '069_technician_location_trail_tenant_persistence.sql',
  ]) {
    assert.ok(runner.includes(filename), 'missing migration from branch acceptance: ' + filename);
  }
  assert.ok(runner.includes('MIGRATION_LEDGER_APPLIED'));
  assert.ok(runner.includes('MIGRATION_LEDGER_SHA256_BOUND=true'));
});

test('signed-context migration helper is valid Python syntax without creating bytecode files', () => {
  const result = spawnSync('python3', [
    '-c',
    'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    path.join(root, 'scripts', 'neon_signed_context_migration_branch.py'),
  ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'python syntax check failed');
});
