const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRuntimeConfiguration } = require('../src/runtime-contract');

test('production postgres configuration fails closed until postgres runtime is wired', () => {
  assert.throws(() => assertRuntimeConfiguration({ databaseEngine: 'postgres', databaseUrl: 'postgres://example', nodeEnv: 'production' }), /POSTGRES_RUNTIME_NOT_WIRED/);
});

test('DATABASE_URL cannot coexist with sqlite engine', () => {
  assert.throws(() => assertRuntimeConfiguration({ databaseEngine: 'sqlite', databaseUrl: 'postgres://example', nodeEnv: 'development' }), /DATABASE_URL_REQUIRES_POSTGRES_ENGINE/);
});

test('production sqlite requires an explicit opt-in', () => {
  const old = process.env.OPSC_ALLOW_SQLITE_PRODUCTION;
  delete process.env.OPSC_ALLOW_SQLITE_PRODUCTION;
  assert.throws(() => assertRuntimeConfiguration({ databaseEngine: 'sqlite', databaseUrl: null, nodeEnv: 'production' }), /PRODUCTION_SQLITE_NOT_ALLOWED/);
  if (old === undefined) delete process.env.OPSC_ALLOW_SQLITE_PRODUCTION; else process.env.OPSC_ALLOW_SQLITE_PRODUCTION = old;
});

test('development sqlite remains allowed', () => {
  assert.equal(assertRuntimeConfiguration({ databaseEngine: 'sqlite', databaseUrl: null, nodeEnv: 'development' }), 'sqlite');
});


test('multi-instance runtime fails closed without a wired shared PostgreSQL runtime', () => {
  const old = process.env.OPSC_EXPECTED_INSTANCES;
  process.env.OPSC_EXPECTED_INSTANCES = '2';
  try {
    assert.throws(
      () => assertRuntimeConfiguration({ databaseEngine: 'sqlite', databaseUrl: null, nodeEnv: 'development' }),
      /MULTI_INSTANCE_RUNTIME_NOT_WIRED/
    );
    assert.throws(
      () => assertRuntimeConfiguration({ databaseEngine: 'postgres', databaseUrl: 'postgres://example', nodeEnv: 'production' }),
      /MULTI_INSTANCE_RUNTIME_NOT_WIRED/
    );
  } finally {
    if (old === undefined) delete process.env.OPSC_EXPECTED_INSTANCES;
    else process.env.OPSC_EXPECTED_INSTANCES = old;
  }
});

test('invalid explicit instance count is rejected', () => {
  const old = process.env.OPSC_EXPECTED_INSTANCES;
  process.env.OPSC_EXPECTED_INSTANCES = 'two';
  try {
    assert.throws(
      () => assertRuntimeConfiguration({ databaseEngine: 'sqlite', databaseUrl: null, nodeEnv: 'development' }),
      /EXPECTED_INSTANCES_INVALID/
    );
  } finally {
    if (old === undefined) delete process.env.OPSC_EXPECTED_INSTANCES;
    else process.env.OPSC_EXPECTED_INSTANCES = old;
  }
});
