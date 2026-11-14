'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('PostgreSQL engine resolution does not load the experimental SQLite module', () => {
  const script = String.raw`
    const Module = require('node:module');
    const assert = require('node:assert/strict');
    const originalLoad = Module._load;
    let sqliteLoads = 0;
    Module._load = function(request, parent, isMain) {
      if (request === 'node:sqlite') sqliteLoads += 1;
      return originalLoad.call(this, request, parent, isMain);
    };
    const { Store } = require('./src/store');
    assert.equal(typeof Store, 'function');
    assert.equal(sqliteLoads, 0, 'Loading the runtime Store must not load node:sqlite');
    const { openDatabase } = require('./src/db-open');
    const opened = openDatabase({
      databaseEngine: 'postgres',
      databaseUrl: 'postgres://unit-test.invalid/opscore'
    });
    assert.equal(opened.engine, 'postgres');
    assert.equal(opened.postgresRuntimeWired, true);
    assert.equal(typeof opened.db.close, 'function');
    opened.db.close();
    assert.equal(sqliteLoads, 0, 'PostgreSQL initialization must not load node:sqlite');
    process.stdout.write('POSTGRES_ENGINE_SQLITE_IMPORT_GATE=PASS\\n');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_ENGINE: 'postgres',
      OPSC_DATABASE_URL: '',
      DATABASE_URL: 'postgres://unit-test.invalid/opscore'
    },
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.match(result.stdout, /POSTGRES_ENGINE_SQLITE_IMPORT_GATE=PASS/);
});

test('production PostgreSQL refuses generic and injected config URL fallbacks', () => {
  const script = String.raw`
    const assert = require('node:assert/strict');
    const { resolveDatabaseUrl, resolveEngine } = require('./src/db-open');
    const env = {
      NODE_ENV: 'production',
      OPSC_DATABASE_URL: '',
      DATABASE_URL: 'postgres://privileged.integration.invalid/opscore'
    };
    assert.throws(
      () => resolveDatabaseUrl({ nodeEnv: 'production', databaseUrl: 'postgres://config.invalid/opscore' }, env),
      { message: 'OPSC_DATABASE_URL_REQUIRED' }
    );
    assert.throws(
      () => resolveEngine({ nodeEnv: 'production', databaseEngine: 'postgres', databaseUrl: 'postgres://config.invalid/opscore' }, env),
      { message: 'OPSC_DATABASE_URL_REQUIRED' }
    );
    process.stdout.write('PRODUCTION_DATABASE_URL_FAIL_CLOSED=PASS\\n');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.match(result.stdout, /PRODUCTION_DATABASE_URL_FAIL_CLOSED=PASS/);
});

test('production PostgreSQL selects only OPSC_DATABASE_URL when both URLs exist', () => {
  const script = String.raw`
    const assert = require('node:assert/strict');
    const { resolveDatabaseUrl } = require('./src/db-open');
    const url = resolveDatabaseUrl(
      { nodeEnv: 'production', databaseUrl: 'postgres://config-fallback.invalid/opscore' },
      {
        NODE_ENV: 'production',
        OPSC_DATABASE_URL: 'postgres://least-privilege.invalid/opscore',
        DATABASE_URL: 'postgres://privileged.integration.invalid/opscore'
      }
    );
    assert.equal(url, 'postgres://least-privilege.invalid/opscore');
    process.stdout.write('PRODUCTION_DATABASE_URL_IDENTITY=PASS\\n');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.match(result.stdout, /PRODUCTION_DATABASE_URL_IDENTITY=PASS/);
});

test('development retains the generic DATABASE_URL fallback', () => {
  const script = String.raw`
    const assert = require('node:assert/strict');
    const { resolveDatabaseUrl } = require('./src/db-open');
    const url = resolveDatabaseUrl(
      { nodeEnv: 'development', databaseUrl: null },
      { NODE_ENV: 'development', OPSC_DATABASE_URL: '', DATABASE_URL: 'postgres://development.integration.invalid/opscore' }
    );
    assert.equal(url, 'postgres://development.integration.invalid/opscore');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
});
