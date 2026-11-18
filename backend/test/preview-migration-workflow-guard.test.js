'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const workflowDir = path.join(root, '.github', 'workflows');
const previewApplyPath = path.join(workflowDir, 'apply-preview-migrations.yml');
const previewApply = fs.readFileSync(previewApplyPath, 'utf8');

test('Preview migrations require one exact ready non-primary unprotected branch and the application database', () => {
  assert.match(previewApply, /branch:[\s\S]*?required: true[\s\S]*?default: "br-solitary-band-bbczy982"/);
  assert.ok(previewApply.includes("pull_request:\n    branches:\n      - main\n    paths:"));
  assert.ok(previewApply.includes("github.head_ref == 'ops/acceptance-neon-target-2026-11-19'"));
  assert.match(previewApply, /database:[\s\S]*?required: true[\s\S]*?default: "opscore_acceptance"/);
  assert.match(previewApply, /if not want\.startswith\("br-"\)/);
  assert.match(previewApply, /matches=\[b for b in branches if str\(b\.get\("id"\) or ""\) == want\]/);
  assert.match(previewApply, /if len\(matches\) != 1/);
  assert.match(previewApply, /chosen\.get\("primary"\) or chosen\.get\("default"\) or chosen\.get\("protected"\)/);
  assert.match(previewApply, /current_state/);
  assert.match(previewApply, /INPUT_DB.*opscore_acceptance/);
  assert.match(previewApply, /OPSC_MIGRATION_TARGET_CLASS: preview/);
  assert.match(previewApply, /OPSC_MIGRATION_EXPECTED_BRANCH_ID/);
  assert.match(previewApply, /OPSC_MIGRATION_CONFIRM_BRANCH_ID/);
  assert.match(previewApply, /sslmode.*verify-full/);
  assert.match(previewApply, /roles\/opscore_owner\/reveal_password/);
  assert.match(previewApply, /PREVIEW_OWNER_PASSWORD_UNAVAILABLE/);
  assert.match(previewApply, /PREVIEW_OWNER_CONNECTION_IDENTITY_INVALID/);
  assert.match(previewApply, /roles\/opscore_runtime\/reveal_password/);
  assert.match(previewApply, /ACCEPTANCE_RUNTIME_PASSWORD_UNAVAILABLE/);
  assert.match(previewApply, /::add-mask::\$\{PASSWORD\}/);
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
