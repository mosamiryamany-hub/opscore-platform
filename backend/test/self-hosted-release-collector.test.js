'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const collector = require('../scripts/collect-self-hosted-release-identity');

test('HTTPS origin parser rejects transport downgrades, credentials and non-origin paths', () => {
  assert.deepEqual(collector.parseHttpsOrigin('https://buyer.example.com'), {
    origin: 'https://buyer.example.com',
    hostname: 'buyer.example.com',
    port: 443
  });
  assert.equal(collector.parseHttpsOrigin('https://buyer.example.com:8443').port, 8443);
  for (const value of [
    'http://buyer.example.com',
    'https://user:pass@buyer.example.com',
    'https://buyer.example.com/path',
    'https://buyer.example.com/?q=1',
    'not-a-url'
  ]) {
    assert.throws(() => collector.parseHttpsOrigin(value), /HTTPS_ORIGIN_INVALID/);
  }
});

test('PostgreSQL collector requires TLS verify-full and an explicitly confirmed direct endpoint', () => {
  const env = { OPSC_SELF_HOSTED_DB_DIRECT_CONNECTION_CONFIRMED: 'true' };
  const good = collector.parsePostgresConnection(
    'postgresql://runtime:secret@db.buyer.example:5432/opscore?sslmode=verify-full&application_name=test',
    env
  );
  assert.equal(good.hostname, 'db.buyer.example');
  assert.equal(good.database, 'opscore');
  assert.equal(good.ssl.rejectUnauthorized, true);
  assert.equal(good.connectionString.includes('secret'), true);
  assert.equal(good.connectionString.includes('sslmode'), false);
  assert.throws(
    () => collector.parsePostgresConnection('postgresql://runtime:secret@db.buyer.example/opscore?sslmode=require', env),
    /TLS_VERIFY_FULL_REQUIRED/
  );
  assert.throws(
    () => collector.parsePostgresConnection('postgresql://runtime:secret@db-pooler.buyer.example/opscore?sslmode=verify-full', env),
    /DIRECT_DATABASE_HOST_REQUIRED/
  );
  assert.throws(
    () => collector.parsePostgresConnection('postgresql://runtime:secret@db.buyer.example/opscore?sslmode=verify-full', {}),
    /DIRECT_CONNECTION_CONFIRMATION_REQUIRED/
  );
});

test('database privilege measurements must be actual boolean values, never inferred false', () => {
  const row = {
    server_version: '18.1',
    database: 'opscore',
    runtime_role: 'opscore_runtime',
    bypass_rls: false,
    superuser: false,
    create_role: false,
    create_db: false
  };
  assert.deepEqual(collector.databaseIdentityFromRow(row, 'db.buyer.example'), {
    engine: 'postgres',
    serverVersion: '18.1',
    database: 'opscore',
    runtimeRole: 'opscore_runtime',
    directHost: 'db.buyer.example',
    directConnection: true,
    bypassRls: false,
    superuser: false,
    createRole: false,
    createDb: false
  });
  assert.throws(
    () => collector.databaseIdentityFromRow({ ...row, bypass_rls: null }, 'db.buyer.example'),
    /DATABASE_BOOLEAN_INVALID:bypass_rls/
  );
  assert.throws(
    () => collector.databaseIdentityFromRow(null, 'db.buyer.example'),
    /DATABASE_ROLE_NOT_FOUND/
  );
  assert.throws(
    () => collector.databaseIdentityFromRow({ ...row, bypass_rls: true }, 'db.buyer.example'),
    /RUNTIME_ROLE_NOT_LEAST_PRIVILEGE:bypassRls/
  );
  assert.throws(
    () => collector.databaseIdentityFromRow({ ...row, server_version: '18.1x' }, 'db.buyer.example'),
    /DATABASE_VERSION_INVALID/
  );
});

test('archive SHA-256 is calculated from actual file bytes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-collector-'));
  const file = path.join(dir, 'archive.bin');
  fs.writeFileSync(file, Buffer.from('buyer-release-archive'));
  const digest = await collector.sha256File(file);
  assert.equal(digest, require('node:crypto').createHash('sha256').update('buyer-release-archive').digest('hex'));
});
