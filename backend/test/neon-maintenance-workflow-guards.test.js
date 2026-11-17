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

test('Neon hygiene is manual-only, main-bound and defaults to read-only inventory', () => {
  assert.ok(hygieneWorkflow.includes('workflow_dispatch:'));
  assert.ok(!hygieneWorkflow.includes('repository_dispatch:'));
  assert.ok(!hygieneWorkflow.includes('\n  push:'));
  assert.ok(hygieneWorkflow.includes('default: list'));
  assert.ok(hygieneWorkflow.includes('type: choice'));
  assert.ok(hygieneWorkflow.includes('DELETE_EPHEMERAL_NEON_BRANCHES'));
  assert.ok(hygieneWorkflow.includes("github.ref == 'refs/heads/main'"));
  assert.ok(hygieneWorkflow.includes('persist-credentials: false'));
  assert.ok(hygieneScript.includes('if MODE == "prune_ephemeral":'));
  assert.ok(hygieneScript.includes('GITHUB_EVENT_NAME'));
  assert.ok(hygieneScript.includes('GITHUB_REF'));
  assert.ok(hygieneScript.includes('NEON_PRUNE_MAIN_MANUAL_DISPATCH_REQUIRED'));
  assert.ok(hygieneScript.includes('CONFIRM_PRUNE'));
});

test('Neon hygiene prunes only narrow temporary-name prefixes and protects operational names', () => {
  assert.ok(hygieneScript.includes('PRUNE_PREFIXES = ("tmp-", "test-accept-", "ephemeral-")'));
  assert.ok(hygieneScript.includes('PROTECTED_NAME_MARKERS'));
  assert.ok(hygieneScript.includes('if any(marker in name for marker in PROTECTED_NAME_MARKERS)'));
  assert.ok(hygieneScript.includes('if not name.startswith(PRUNE_PREFIXES)'));
  assert.ok(hygieneScript.includes('skip_protected_identity'));
  assert.ok(!hygieneScript.includes('repository_dispatch'));
});

test('legacy ephemeral pruner requires exact branch ID/name, allowlist and main manual dispatch', () => {
  const pruneWorkflow = read('.github/workflows/neon-prune-ephemeral-branches.yml');
  assert.ok(pruneWorkflow.includes('workflow_dispatch:'));
  assert.ok(!pruneWorkflow.includes('repository_dispatch:'));
  assert.ok(!pruneWorkflow.includes('\n  push:'));
  assert.ok(pruneWorkflow.includes("github.ref == 'refs/heads/main'"));
  assert.ok(pruneWorkflow.includes('branch_id:'));
  assert.ok(pruneWorkflow.includes('expected_branch_name:'));
  assert.ok(pruneWorkflow.includes('DELETE_ONE_EPHEMERAL_NEON_BRANCH'));
  assert.ok(pruneWorkflow.includes('br-[a-z0-9-]{8,80}'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_NAME_MISMATCH'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_NAME_NOT_IN_EPHEMERAL_ALLOWLIST'));
  assert.ok(pruneWorkflow.includes('TARGET_BRANCH_DELETE_NOT_VERIFIED'));
  assert.ok(pruneWorkflow.includes('GITHUB_EVENT_NAME'));
  assert.ok(pruneWorkflow.includes('EPHEMERAL_BRANCH_DELETE_MAIN_MANUAL_DISPATCH_REQUIRED'));
});

test('Primary snapshot writers require main manual dispatch and explicit confirmation', () => {
  assert.ok(snapshotWorkflow.includes('workflow_dispatch:'));
  assert.ok(!snapshotWorkflow.includes('repository_dispatch:'));
  assert.ok(snapshotWorkflow.includes("github.ref == 'refs/heads/main'"));
  assert.ok(snapshotWorkflow.includes('ROTATE_PRIMARY_SNAPSHOT'));
  assert.ok(snapshotWorkflow.includes('snapshot_id_to_delete:'));
  assert.ok(snapshotWorkflow.includes('confirm_non_primary_snapshot_deletion:'));
  assert.ok(snapshotWorkflow.includes('OPSC_NON_PRIMARY_SNAPSHOT_DELETE_ID'));
  assert.ok(snapshotWorkflow.includes('OPSC_CONFIRM_NON_PRIMARY_SNAPSHOT_DELETE'));
  assert.ok(snapshotScript.includes('GITHUB_EVENT_NAME'));
  assert.ok(snapshotScript.includes('GITHUB_REF'));
  assert.ok(snapshotScript.includes('NEON_SNAPSHOT_MAIN_MANUAL_DISPATCH_REQUIRED'));

  const manualSnapshotWorkflow = read('.github/workflows/neon-primary-manual-snapshot.yml');
  assert.ok(manualSnapshotWorkflow.includes('workflow_dispatch:'));
  assert.ok(manualSnapshotWorkflow.includes("github.ref == 'refs/heads/main'"));
});

test('snapshot helper requires exact non-primary snapshot ID and separate typed approval before DELETE', () => {
  const confirmationAt = snapshotScript.indexOf('DELETE_ONE_NON_PRIMARY_SNAPSHOT');
  const idCheckAt = snapshotScript.indexOf('NON_PRIMARY_SNAPSHOT_DELETE_ID_REQUIRED');
  const deleteAt = snapshotScript.indexOf('api("DELETE", f"/snapshots/{delete_snapshot_id}")');
  assert.ok(confirmationAt >= 0);
  assert.ok(idCheckAt > confirmationAt);
  assert.ok(deleteAt > idCheckAt);
  assert.ok(snapshotScript.includes('REFUSE_DELETE_PRIMARY_SOURCE_SNAPSHOT'));
  assert.ok(snapshotScript.includes('REFUSE_DELETE_PROTECTED_SNAPSHOT_NAME'));
  assert.ok(snapshotScript.includes('NON_PRIMARY_SNAPSHOT_DELETE_NOT_VERIFIED'));
});

test('Neon maintenance Python helpers parse without writing bytecode files', () => {
  for (const file of ['scripts/neon_hygiene.py', 'scripts/neon_primary_snapshot_rotate.py']) {
    const result = spawnSync('python3', [
      '-c',
      'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
      path.join(root, file),
    ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 0, file + ': ' + (result.stderr || result.stdout || 'Python syntax failed'));
  }
});
