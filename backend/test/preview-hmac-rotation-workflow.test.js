'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows/rotate-preview-tenant-hmac.yml'),
  'utf8'
);

test('Preview HMAC rotation is restricted to the approved project, branch, database and admin role', () => {
  assert.match(workflow, /UNAPPROVED_NEON_PROJECT/);
  assert.match(workflow, /UNAPPROVED_VERCEL_PROJECT/);
  assert.match(workflow, /UNAPPROVED_PREVIEW_DATABASE/);
  assert.match(workflow, /UNAPPROVED_PREVIEW_ADMIN_ROLE/);
  assert.match(workflow, /PREVIEW_BRANCH_NOT_APPROVED/);
  assert.match(workflow, /REFUSING_PRIMARY_BRANCH/);
});

test('Preview HMAC rotation validates TTL and installs a 32-byte key without printing the secret', () => {
  assert.match(workflow, /KEY_TTL_DAYS/);
  assert.match(workflow, /openssl rand -hex 32/);
  assert.match(workflow, /test "\$\(wc -c < "\$RUNNER_TEMP\/key\.hex"/);
  assert.match(workflow, /decode\('\$\{KEY_HEX\}', 'hex'\)/);
  assert.match(workflow, /make_interval\(days => \$\{TTL\}\)/);
  assert.match(workflow, /HMAC key row installed on Preview \(secret not logged\)/);
});

test('Preview HMAC rotation inserts without disabling previous verifier keys in the same step', () => {
  assert.match(workflow, /INSERT INTO opscore_security\.context_hmac_keys/);
  assert.doesNotMatch(workflow, /UPDATE opscore_security\.context_hmac_keys[\s\S]*?SET enabled = false/);
});

test('Preview HMAC rotation syncs encrypted Preview env and does not weaken enforcement', () => {
  assert.match(workflow, /upsert\("OPSC_TENANT_CONTEXT_KEY_JSON", key_json\)/);
  assert.match(workflow, /upsert\("OPSC_TENANT_CONTEXT_HMAC_KEY", key_hex\)/);
  assert.match(workflow, /upsert\("OPSC_TENANT_CONTEXT_KEY_ID", key_id\)/);
  assert.match(workflow, /vercel_preview_env_synced/);
  assert.doesNotMatch(workflow, /upsert\("OPSC_REQUIRE_SIGNED_TENANT_CONTEXT", "false"\)/);
  assert.match(workflow, /signed-context enforcement flag unchanged/);
  assert.match(workflow, /Production env and Production Neon were not modified/);
});
