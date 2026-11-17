'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const hygieneWorkflow = read('.github/workflows/ops-neon-hygiene.yml');
const hygieneScript = read('scripts/neon_hygiene.py');
const snapshotWorkflow = read('.github/workflows/ops-neon-primary-snapshot.yml');
const snapshotScript = read('scripts/neon_primary_snapshot_rotate.py');

test('Neon hygiene is manual-only and defaults to read-only inventory', () => {
  assert.match(hygieneWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(hygieneWorkflow, /^\s*(?:push|repository_dispatch):/m);
  assert.match(hygieneWorkflow, /default: list/);
  assert.match(hygieneWorkflow, /type: choice/);
  assert.match(hygieneWorkflow, /- list\s+- prune_ephemeral/);
  assert.match(hygieneWorkflow, /DELETE_EPHEMERAL_NEON_BRANCHES/);
  assert.match(hygieneWorkflow, /persist-credentials: false/);
});

test('Neon hygiene refuses pruning without typed confirmation and narrows eligible names', () => {
  assert.match(hygieneScript, /os\.environ\.get\("MODE"\) or "list"/);
  assert.match(hygieneScript, /MODE == "prune_ephemeral" and os\.environ\.get\("CONFIRM_PRUNE"\) != PRUNE_CONFIRMATION/);
  assert.match(hygieneScript, /PRUNE_PREFIXES = \("tmp-", "test-accept-", "ephemeral-"\)/);
  assert.match(hygieneScript, /PROTECTED_NAME_MARKERS/);
  assert.match(hygieneScript, /if any\(marker in name for marker in PROTECTED_NAME_MARKERS\)/);
  assert.match(hygieneScript, /if not name\.startswith\(PRUNE_PREFIXES\)/);
  assert.match(hygieneScript, /BRANCH_CAPACITY_FULL_NO_AUTOMATIC_DELETION|skip_protected_identity/);
});

test('duplicate ephemeral pruner deletes only one exact manually selected branch', () => {
  const pruneWorkflow = read('.github/workflows/neon-prune-ephemeral-branches.yml');
  assert.match(pruneWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(pruneWorkflow, /repository_dispatch/);
  assert.ok(!pruneWorkflow.includes('\n  push:'));
  assert.ok(!pruneWorkflow.includes('\n  repository_dispatch:'));
  assert.ok(pruneWorkflow.includes('branch_id:'));
  assert.ok(pruneWorkflow.includes('expected_branch_name:'));
  assert.ok(pruneWorkflow.includes('DELETE_ONE_EPHEMERAL_NEON_BRANCH'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_ID'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_DELETE_NOT_VERIFIED'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_NAME_NOT_IN_EPHEMERAL_ALLOWLIST'));
});

test('Primary snapshot rotation requires manual dispatch and exact-ID deletion approval', () => {
  assert.match(snapshotWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(snapshotWorkflow, /repository_dispatch/);
  assert.match(snapshotWorkflow, /ROTATE_PRIMARY_SNAPSHOT/);
  assert.match(snapshotWorkflow, /snapshot_id_to_delete:/);
  assert.match(snapshotWorkflow, /confirm_non_primary_snapshot_deletion:/);
  assert.match(snapshotWorkflow, /OPSC_NON_PRIMARY_SNAPSHOT_DELETE_ID:/);
  assert.match(snapshotWorkflow, /OPSC_CONFIRM_NON_PRIMARY_SNAPSHOT_DELETE:/);
});

test('snapshot helper requires separate typed approval and exact non-primary snapshot ID before DELETE', () => {
  const confirmationAt = snapshotScript.indexOf('DELETE_ONE_NON_PRIMARY_SNAPSHOT');
  const idCheckAt = snapshotScript.indexOf('NON_PRIMARY_SNAPSHOT_DELETE_ID_REQUIRED');
  const deleteAt = snapshotScript.indexOf('api("DELETE", f"/snapshots/{delete_snapshot_id}")');
  assert.ok(confirmationAt >= 0);
  assert.ok(idCheckAt > confirmationAt);
  assert.ok(deleteAt > idCheckAt);
  assert.match(snapshotScript, /REFUSE_DELETE_PRIMARY_SOURCE_SNAPSHOT/);
  assert.match(snapshotScript, /REFUSE_DELETE_PROTECTED_SNAPSHOT_NAME/);
  assert.match(snapshotScript, /NON_PRIMARY_SNAPSHOT_DELETE_NOT_VERIFIED/);
});

test('Neon maintenance helpers parse as Python without writing bytecode files', () => {
  for (const file of ['scripts/neon_hygiene.py', 'scripts/neon_primary_snapshot_rotate.py']) {
    const result = spawnSync('python3', [
      '-c',
      'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
      path.join(root, file),
    ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 0, file + ': ' + (result.stderr || result.stdout || 'Python syntax failed'));
  }
});
