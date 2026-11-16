'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const script = `
const { createPostgresPool } = require('./src/adapters/postgres');
const pool = createPostgresPool({ connectionString: 'postgresql://user:pass@127.0.0.1:5432/opscore_ssl_policy_test?sslmode=verify-full&sslrootcert=%2Ftmp%2Flegacy-ca.pem&application_name=opscore_ssl_policy_test' });
if (!pool.options.ssl || pool.options.ssl.rejectUnauthorized !== true || pool.options.ssl.ca !== process.env.OPSC_PG_CA_CERT) {
  process.stderr.write('POSTGRES_TLS_VERIFICATION_NOT_ENFORCED');
  process.exitCode = 9;
  pool.end().catch(() => {});
} else {
  const url = new URL(pool.options.connectionString);
  if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
    process.stderr.write('POSTGRES_URL_SSL_OPTIONS_NOT_REMOVED');
    process.exitCode = 10;
    pool.end().catch(() => {});
  } else if (url.searchParams.get('application_name') !== 'opscore_ssl_policy_test') {
    process.stderr.write('POSTGRES_CONNECTION_OPTIONS_NOT_PRESERVED');
    process.exitCode = 11;
    pool.end().catch(() => {});
  } else {
    pool.end().then(() => process.stdout.write('TLS_VERIFIED'));
  }
}
`;

function run(mode, rejectUnauthorized = 'true') {
  const env = { ...process.env, NODE_ENV: 'production', OPSC_PG_SSL_REJECT_UNAUTHORIZED: rejectUnauthorized, OPSC_PG_CA_CERT: 'TEST_CA_CERTIFICATE' };
  if (mode === null) delete env.OPSC_PG_SSL_MODE;
  else env.OPSC_PG_SSL_MODE = mode;
  delete env.NODE_OPTIONS;
  return spawnSync(process.execPath, ['-e', script], { cwd: backendRoot, env, encoding: 'utf8', timeout: 10000 });
}

test('production defaults to full TLS verification when mode is unset', () => {
  const result = run(null);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TLS_VERIFIED/);
});

test('production rejects encryption-only require mode', () => {
  const result = run('require');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /POSTGRES_TLS_VERIFICATION_REQUIRED/);
});

test('production rejects disabled TLS', () => {
  const result = run('disable');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /POSTGRES_TLS_REQUIRED/);
});

test('production rejects disabled certificate verification', () => {
  const result = run('verify-full', 'false');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /POSTGRES_TLS_VERIFICATION_REQUIRED/);
});

test('production accepts verify-full with certificate verification enabled', () => {
  const result = run('verify-full');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TLS_VERIFIED/);
});
