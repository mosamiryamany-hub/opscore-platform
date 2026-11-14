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

test('explicit hold false opens production in operator-open mode without release evidence', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false'
  }, () => true), { allowed: true, mode: 'production-operator-open' });
});

test('environment flags alone do not claim full verified production mode without evidence', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => false), { allowed: true, mode: 'production-operator-open' });
});

test('production verified mode requires hold false, release switch, and evidence verifier', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true'
  }, () => true), { allowed: true, mode: 'production' });
});

test('the default production verifier does not elevate operator-open into verified mode from env-only claims', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_RELEASE_VERIFIED: 'true',
    OPSC_RELEASE_CI_COMMIT: 'a'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '123456789',
    OPSC_RELEASE_PACKAGE_COMMIT: 'a'.repeat(40),
    OPSC_RELEASE_PACKAGE_SHA256: 'b'.repeat(64),
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'github-actions-cli',
    OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'
  }), { allowed: true, mode: 'production-operator-open' });
});

test('Vercel Preview remains available when NODE_ENV is production without opening the production gate', () => {
  assert.deepEqual(productionSafetyGate({ nodeEnv: 'production' }, {
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview'
  }), { allowed: true, mode: 'preview' });
});

test('Vercel production target remains held even if config nodeEnv is not production', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'development' }, {
    NODE_ENV: 'development',
    VERCEL_ENV: 'production'
  }), /PRODUCTION_HOLD_ACTIVE/);
});

test('unknown Vercel deployment targets fail closed', () => {
  assert.throws(() => productionSafetyGate({ nodeEnv: 'production' }, {
    NODE_ENV: 'production',
    VERCEL_ENV: 'staging'
  }), /VERCEL_ENV_INVALID/);
});
