'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '..', '.github', 'workflows', 'rotate-production-tenant-hmac.yml'),
  'utf8'
);

test('Production HMAC rotation is manual, typed-confirmation and references the production Environment', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /ROTATE_PRODUCTION_TENANT_HMAC/);
  assert.match(workflow, /environment:\s*\n\s+name: production/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('Production HMAC rotation binds the exact Primary, database, owner role and direct Neon endpoint', () => {
  assert.match(workflow, /summer-leaf-18448271/);
  assert.match(workflow, /br-proud-salad-bcshhdap/);
  assert.match(workflow, /opscore_acceptance/);
  assert.match(workflow, /neondb_owner/);
  assert.match(workflow, /pooled=false/);
  assert.match(workflow, /"-pooler" in host/);
  assert.match(workflow, /to_regclass\('opscore_security\.context_hmac_keys'\)/);
});

test('HMAC rotation installs a new bounded key while preserving all previous DB keys', () => {
  assert.match(workflow, /openssl rand -hex 32/);
  assert.match(workflow, /decode\('\$KEY_HEX','hex'\)/);
  assert.match(workflow, /secret, enabled, not_before, not_after/);
  assert.ok(workflow.includes("VALUES ('$KEY_ID', decode('$KEY_HEX','hex'), true, now(), now() + make_interval(days => $TTL));"));
  assert.match(workflow, /previous_key_rows_changed=false/);
  assert.match(workflow, /Old HMAC keys remain enabled for overlap and rollback/);
  assert.doesNotMatch(workflow, /DELETE\s+FROM\s+opscore_security\.context_hmac_keys/i);
  assert.doesNotMatch(workflow, /UPDATE\s+opscore_security\.context_hmac_keys/i);
});

test('Workflow updates only Production HMAC values and never opens route or traffic gates', () => {
  assert.match(workflow, /target": \["production"\]/);
  assert.match(workflow, /OPSC_TENANT_CONTEXT_KEY_JSON/);
  assert.match(workflow, /OPSC_TENANT_CONTEXT_HMAC_KEY/);
  assert.match(workflow, /OPSC_TENANT_CONTEXT_KEY_ID/);
  assert.match(workflow, /signed_route_enable_flags_unchanged=true/);
  assert.doesNotMatch(workflow, /OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED\s*:/);
  assert.doesNotMatch(workflow, /OPSC_REQUIRE_SIGNED_TENANT_CONTEXT\s*:/);
  assert.doesNotMatch(workflow, /OPSC_PRODUCTION_HOLD\s*:/);
  assert.doesNotMatch(workflow, /OPSC_RELEASE_VERIFIED\s*:/);
  assert.doesNotMatch(workflow, /vercel deploy|vercel --prod|request_promote/i);
});

test('Rotation leaves key retirement and deployment rollback as separate post-soak operations', () => {
  assert.match(workflow, /No Production deployment was started/);
  assert.match(workflow, /Retire old keys only in a separately approved post-soak operation/);
  assert.match(workflow, /No signed-route enablement or traffic-hold flag was changed/);
});
