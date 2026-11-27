'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSeedTarget } = require('../scripts/ci-seed-tenant-context-key');

const base = {
  OPSC_PG_ACCEPTANCE_CLEANUP_URL: 'postgresql://neondb_owner:masked@ep-ci-branch.c-15.us-east-1.aws.neon.tech/opscore_acceptance?sslmode=require',
  OPSC_PG_ACCEPTANCE_CLEANUP_HOST: 'ep-ci-branch.c-15.us-east-1.aws.neon.tech',
  OPSC_PG_ACCEPTANCE_HOST: 'ep-ci-branch.c-15.us-east-1.aws.neon.tech',
  OPSC_TENANT_CONTEXT_HMAC_KEY: 'a'.repeat(64),
  OPSC_TENANT_CONTEXT_KEY_ID: 'ci-123456-1'
};

test('CI signing key seed accepts only the exact disposable Neon owner target', () => {
  const target = validateSeedTarget(base);
  assert.equal(target.database, 'opscore_acceptance');
  assert.equal(target.role, 'neondb_owner');
  assert.equal(target.host, 'ep-ci-branch.c-15.us-east-1.aws.neon.tech');
  assert.equal(target.keyId, 'ci-123456-1');
});

test('CI signing key seed rejects production, pooler, wrong role and wrong database targets', () => {
  assert.throws(() => validateSeedTarget({ ...base, OPSC_PG_ACCEPTANCE_HOST: 'ep-winter-leaf-b4d0bwgk' }), /CI_SIGNING_KEY_SEED_HOST_MISMATCH/);
  assert.throws(() => validateSeedTarget({ ...base, OPSC_PG_ACCEPTANCE_CLEANUP_URL: base.OPSC_PG_ACCEPTANCE_CLEANUP_URL.replace('ep-ci-branch.', 'ep-ci-branch-pooler.') }), /CI_SIGNING_KEY_SEED_HOST_MISMATCH|CI_SIGNING_KEY_SEED_PRODUCTION_OR_POOLER_FORBIDDEN/);
  assert.throws(() => validateSeedTarget({ ...base, OPSC_PG_ACCEPTANCE_CLEANUP_URL: base.OPSC_PG_ACCEPTANCE_CLEANUP_URL.replace('neondb_owner:', 'opscore_runtime:') }), /CI_SIGNING_KEY_SEED_IDENTITY_MISMATCH/);
  assert.throws(() => validateSeedTarget({ ...base, OPSC_PG_ACCEPTANCE_CLEANUP_URL: base.OPSC_PG_ACCEPTANCE_CLEANUP_URL.replace('/opscore_acceptance?', '/postgres?') }), /CI_SIGNING_KEY_SEED_IDENTITY_MISMATCH/);
});

test('CI signing key seed rejects malformed one-run key material', () => {
  assert.throws(() => validateSeedTarget({ ...base, OPSC_TENANT_CONTEXT_HMAC_KEY: 'not-a-key' }), /CI_SIGNING_KEY_SEED_SECRET_INVALID/);
  assert.throws(() => validateSeedTarget({ ...base, OPSC_TENANT_CONTEXT_KEY_ID: 'production-key' }), /CI_SIGNING_KEY_SEED_ID_INVALID/);
});
