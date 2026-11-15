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

test('Preview HMAC rotation validates TTL and uses safely quoted psql variables', () => {
  assert.match(workflow, /KEY_TTL_DAYS_MUST_BE_1_TO_30/);
  assert.match(workflow, /\\getenv key_ttl_days KEY_TTL_DAYS/);
  assert.match(workflow, /make_interval\(days => :'key_ttl_days'::int\)/);
  assert.doesNotMatch(workflow, /make_interval\(days => \$\{KEY_TTL_DAYS\}/);
});

test('Preview HMAC rotation preserves the previous verifier key during overlap', () => {
  assert.match(workflow, /active_key_overlap/);
  assert.doesNotMatch(workflow, /UPDATE opscore_security\.context_hmac_keys[\s\S]*?SET enabled = false/);
});

test('Preview HMAC rotation atomically updates one encrypted key config without weakening enforcement', () => {
  assert.match(workflow, /upsert\("OPSC_TENANT_CONTEXT_KEY_JSON", key_json\)/);
  assert.match(workflow, /PREVIEW_ATOMIC_KEY_CONFIG_NOT_UNIQUE/);
  assert.doesNotMatch(workflow, /upsert\("OPSC_TENANT_CONTEXT_HMAC_KEY"/);
  assert.doesNotMatch(workflow, /upsert\("OPSC_TENANT_CONTEXT_KEY_ID"/);
  assert.doesNotMatch(workflow, /upsert\("OPSC_REQUIRE_SIGNED_TENANT_CONTEXT", "false"\)/);
  assert.match(workflow, /signed-context enforcement flag unchanged/);
});
