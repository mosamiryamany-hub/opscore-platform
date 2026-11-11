'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveBootstrapConfig,
  assertBootstrapDatabaseRole,
  isHttpBootstrapAllowed
} = require('../src/bootstrap-policy');

const base = { databaseEngine: 'postgres', databaseUrl: null, nodeEnv: 'production' };

test('PostgreSQL bootstrap requires a separate explicit bootstrap URL', () => {
  assert.throws(() => resolveBootstrapConfig(base, { NODE_ENV: 'production' }), /OPSC_BOOTSTRAP_DATABASE_URL_REQUIRED/);
  assert.throws(() => resolveBootstrapConfig(base, {
    NODE_ENV: 'production',
    OPSC_BOOTSTRAP_DATABASE_URL: 'postgres://same/db',
    OPSC_DATABASE_URL: 'postgres://same/db'
  }), /BOOTSTRAP_DATABASE_URL_MUST_BE_SEPARATE/);
  assert.deepEqual(
    resolveBootstrapConfig(base, {
      NODE_ENV: 'production',
      OPSC_BOOTSTRAP_DATABASE_URL: 'postgres://bootstrap/db',
      OPSC_DATABASE_URL: 'postgres://runtime/db'
    }),
    { ...base, databaseUrl: 'postgres://bootstrap/db' }
  );
});

test('production bootstrap cannot silently fall back to DATABASE_URL or SQLite', () => {
  assert.throws(() => resolveBootstrapConfig({ ...base, databaseEngine: 'sqlite' }, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://owner/db'
  }), /BOOTSTRAP_POSTGRES_REQUIRED_IN_PRODUCTION/);
});

test('only the dedicated Neon owner role can perform PostgreSQL bootstrap', () => {
  const db = row => ({ prepare: () => ({ get: () => row }) });
  assert.equal(assertBootstrapDatabaseRole(db({ role: 'neondb_owner', superuser: false, bypass_rls: true }), 'postgres'), true);
  for (const row of [
    null,
    { role: 'opscore_runtime', superuser: false, bypass_rls: false },
    { role: 'opscore_app', superuser: false, bypass_rls: true },
    { role: 'neondb_owner', superuser: true, bypass_rls: true },
    { role: 'neondb_owner', superuser: false, bypass_rls: false }
  ]) assert.throws(() => assertBootstrapDatabaseRole(db(row), 'postgres'), /BOOTSTRAP_DATABASE_ROLE_NOT_ALLOWED/);
});

test('production HTTP bootstrap is disabled; local/test bootstrap remains available', () => {
  assert.equal(isHttpBootstrapAllowed('production'), false);
  assert.equal(isHttpBootstrapAllowed('Production'), false);
  assert.equal(isHttpBootstrapAllowed('development'), true);
  assert.equal(isHttpBootstrapAllowed('test'), true);
});
