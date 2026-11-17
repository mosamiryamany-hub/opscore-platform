'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(workflow, /node-version: '22\.23\.4'/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /Create disposable child branch and apply 063–067 plus technician-trail 069/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4|npm i -g|psql -f/);
});

test('migration branch runner never deletes branches and requires free branch capacity', () => {
  assert.match(runner, /if len\(branches\) >= 10:/);
  assert.match(runner, /BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION/);
  assert.doesNotMatch(runner, /api\(["']DELETE["']/);
  assert.doesNotMatch(runner, /cleanup_old_mig|Delete prior failed mig branches/);
});

test('migration branch runner requires a direct endpoint and exact target identity', () => {
  assert.match(runner, /"pooled": "false"/);
  assert.match(runner, /"-pooler" in host/);
  assert.match(runner, /OPSC_MIGRATION_TARGET_CLASS": "preview"/);
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
  assert.match(runner, /apply-postgres-migrations\.js/);
  assert.match(runner, /APPLIED_AND_VERIFIED/);
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
  assert.match(runner, /MIGRATION_LEDGER_APPLIED/);
  assert.match(runner, /MIGRATION_LEDGER_SHA256_BOUND=true/);
});
