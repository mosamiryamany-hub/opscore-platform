'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { productionSafetyGate } = require('../src/firewall');

test('development and test environments do not require production release evidence', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'development' }, {}), { allowed: true, mode: 'development' });
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'test' }, {}), { allowed: true, mode: 'development' });
});

test('production remains held when the explicit hold variable is missing or true', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => true), /PRODUCTION_HOLD_ACTIVE/);
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => true), /PRODUCTION_HOLD_ACTIVE/);
});

test('production requires an explicit verified-release switch', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false'
  }, () => true), /PRODUCTION_RELEASE_NOT_VERIFIED/);
});

test('environment flags alone cannot bypass missing release evidence', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => false), /PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED/);
});

test('production opens only when hold, release switch, and evidence verifier all pass', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => true), { allowed: true, mode: 'production' });
});

test('the default production verifier rejects environment-only release claims', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true',
    OPSC_RELEASE_CI_COMMIT: 'a'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '123456789',
    OPSC_RELEASE_PACKAGE_COMMIT: 'a'.repeat(40),
    OPSC_RELEASE_PACKAGE_SHA256: 'b'.repeat(64),
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'github-actions-cli',
    OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'
  }), /PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED/);
});
