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
  assert.match(previewApply, /branch:[\s\S]*?required: true[\s\S]*?default: "br-solitary-band-bbczy982"/);
  assert.ok(previewApply.includes("pull_request:\n    branches:\n      - main\n    paths:"));
  assert.ok(previewApply.includes("github.head_ref == 'ops/acceptance-neon-target-2026-11-19'"));
  assert.match(previewApply, /database:[\s\S]*?required: true[\s\S]*?default: "opscore_acceptance"/);
  assert.match(previewApply, /INPUT_DB.*opscore_acceptance/);
  assert.match(previewApply, /OPSC_MIGRATION_TARGET_CLASS: preview/);
  assert.match(previewApply, /OPSC_MIGRATION_EXPECTED_OWNER_ROLE: opscore_owner/);
  assert.match(previewApply, /ALTER ROLE neondb_owner/);
  assert.match(previewApply, /CREATE ROLE neondb_owner/);
  assert.match(previewApply, /PREVIEW_MIGRATION_APPLY=NOT_APPLICABLE_ROLE_MODEL/);
  assert.match(previewApply, /PREVIEW_ACCEPTANCE=PASS_WITH_ROLE_MODEL_LIMITATION/);
  assert.match(previewApply, /OPSC_MIGRATION_PINNED_NEON_IDENTITY: '1'/);
  assert.match(previewApply, /STATIC_EXACT_PREVIEW_TARGET/);
  assert.match(previewApply, /DRY_RUN_NEON_PINNED_IDENTITY_MISMATCH/);
  assert.match(previewApply, /APPLY_NEON_PINNED_IDENTITY_MISMATCH/);
  assert.match(previewApply, /OPSC_MIGRATION_EXPECTED_BRANCH_ID/);
  assert.match(previewApply, /OPSC_MIGRATION_CONFIRM_BRANCH_ID/);
  assert.match(previewApply, /BRANCH_ID=\x27br-solitary-band-bbczy982\x27/);
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
