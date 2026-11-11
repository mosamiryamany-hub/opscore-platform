'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyProductionEnvironment } = require('../../scripts/verify-production-environment');

const valid = {
  NODE_ENV: 'production',
  DATABASE_ENGINE: 'postgres',
  OPSC_DATABASE_URL: 'postgresql://redacted.invalid/db',
  OPSC_PRODUCTION_HOLD: 'false',
  OPSC_RELEASE_VERIFIED: 'true'
};

test('production preflight accepts only explicit production release and database configuration', () => {
  const result = verifyProductionEnvironment(valid);
  assert.equal(result.passed, true);
  assert.ok(result.checks.every(check => check.status === 'PASS'));
});

test('missing or defaulted production hold blocks before deployment', () => {
  for (const value of [undefined, '', 'true', 'FALSE ']) {
    const result = verifyProductionEnvironment({ ...valid, OPSC_PRODUCTION_HOLD: value });
    assert.equal(result.passed, value === 'FALSE ');
    assert.equal(result.checks.find(check => check.name === 'OPSC_PRODUCTION_HOLD').status, value === 'FALSE ' ? 'PASS' : 'FAIL');
  }
});

test('unverified release, non-PostgreSQL engine, or missing primary database URL blocks', () => {
  assert.equal(verifyProductionEnvironment({ ...valid, OPSC_RELEASE_VERIFIED: 'false' }).passed, false);
  assert.equal(verifyProductionEnvironment({ ...valid, DATABASE_ENGINE: 'sqlite' }).passed, false);
  assert.equal(verifyProductionEnvironment({ ...valid, OPSC_DATABASE_URL: '' }).passed, false);
});

test('production runtime rejects migration/bootstrap owner credentials and conflicting DATABASE_URL', () => {
  assert.equal(verifyProductionEnvironment({
    ...valid,
    DATABASE_URL: valid.OPSC_DATABASE_URL
  }).passed, true);
  assert.equal(verifyProductionEnvironment({
    ...valid,
    DATABASE_URL: 'postgres://different-role.invalid/db'
  }).passed, false);
  assert.equal(verifyProductionEnvironment({
    ...valid,
    OPSC_MIGRATION_DATABASE_URL: 'postgres://owner.invalid/db'
  }).passed, false);
  assert.equal(verifyProductionEnvironment({
    ...valid,
    OPSC_BOOTSTRAP_DATABASE_URL: 'postgres://owner.invalid/db'
  }).passed, false);
});

test('preflight output contains no environment values or connection secrets', () => {
  const result = verifyProductionEnvironment(valid);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /redacted|postgresql:|OPSC_PRODUCTION_HOLD.*false|OPSC_RELEASE_VERIFIED.*true/);
});
