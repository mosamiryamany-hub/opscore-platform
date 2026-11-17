'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateProductionGate,
  isReadOnlyProductionVerificationRequest
} = require('../src/production-hold');

test('production hold blocks traffic while leaving only read-only verification GET routes available', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'true' },
    () => { throw new Error('PRODUCTION_HOLD_ACTIVE'); }
  );
  assert.deepEqual(gate, {
    blocked: true,
    mode: 'maintenance',
    reasonCode: 'PRODUCTION_HOLD_ACTIVE'
  });

  for (const pathname of [
    '/api/verify/deployment',
    '/api/verify/release',
    '/verify/release.json',
    '/api/verify/database',
    '/api/verify/database-security'
  ]) {
    assert.equal(isReadOnlyProductionVerificationRequest({ method: 'GET', url: pathname }), true);
  }
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'POST', url: '/api/verify/release' }), false);
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'GET', url: '/api/v1/assets' }), false);
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'GET', url: '/api/health' }), false);
});

test('missing release evidence cannot be bypassed by setting hold false', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'false', OPSC_RELEASE_VERIFIED: 'true' },
    () => { throw new Error('PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED'); }
  );
  assert.deepEqual(gate, {
    blocked: true,
    mode: 'maintenance',
    reasonCode: 'PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED'
  });
});

test('an unrelated production startup error is not silently converted to maintenance mode', () => {
  assert.throws(() => evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production' },
    () => { throw new Error('INVALID_PRODUCTION_ENVIRONMENT'); }
  ), /INVALID_PRODUCTION_ENVIRONMENT/);
});

test('a verified production gate remains open', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'false', OPSC_RELEASE_VERIFIED: 'true' },
    () => ({ allowed: true, mode: 'production' })
  );
  assert.deepEqual(gate, { blocked: false, mode: 'production', reasonCode: null });
});

test('Preview remains available even when NODE_ENV is production', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
    () => ({ allowed: true, mode: 'preview' })
  );
  assert.deepEqual(gate, { blocked: false, mode: 'preview', reasonCode: null });
});
