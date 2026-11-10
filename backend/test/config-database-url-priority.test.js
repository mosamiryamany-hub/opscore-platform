'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
function loadDatabaseUrl(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  delete env.NODE_OPTIONS;
  const result = spawnSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./src/config').databaseUrl || '')"],
    { cwd: backendRoot, env, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr || 'config process failed');
  return result.stdout;
}

test('restricted OPSC_DATABASE_URL takes precedence over DATABASE_URL', () => {
  assert.equal(
    loadDatabaseUrl({
      OPSC_DATABASE_URL: 'postgres://restricted.example/neondb',
      DATABASE_URL: 'postgres://integration-default.example/neondb'
    }),
    'postgres://restricted.example/neondb'
  );
});

test('DATABASE_URL remains fallback when OPSC_DATABASE_URL is unset', () => {
  const env = { ...process.env, DATABASE_URL: 'postgres://integration-default.example/neondb' };
  delete env.OPSC_DATABASE_URL;
  delete env.NODE_OPTIONS;
  const result = spawnSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./src/config').databaseUrl || '')"],
    { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr || 'config process failed');
  assert.equal(result.stdout, 'postgres://integration-default.example/neondb');
});
