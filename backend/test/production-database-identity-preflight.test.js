'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  migrationSourceDigest,
  parseDatabaseTarget,
  safeErrorCode
} = require('../scripts/production-database-identity-preflight');

test('Neon pooled URLs expose only a non-secret endpoint identifier and region', () => {
  const raw = 'postgresql://runtime:do-not-print-this@ep-prod-abc123-pooler.us-east-2.aws.neon.tech/opscore?sslmode=require';
  const target = parseDatabaseTarget(raw);
  assert.deepEqual(
    { provider: target.provider, endpointId: target.endpointId, region: target.region },
    { provider: 'neon', endpointId: 'ep-prod-abc123', region: 'us-east-2' }
  );
  assert.equal(JSON.stringify(target).includes('do-not-print-this'), false);
  assert.equal(JSON.stringify(target).includes('ep-prod-abc123-pooler.us-east-2.aws.neon.tech'), false);
  assert.match(target.hostnameSha256, /^[a-f0-9]{64}$/);
});

test('non-Neon PostgreSQL endpoints are identified without disclosing host or credentials', () => {
  const target = parseDatabaseTarget('postgres://user:private-value@db.example.invalid:5432/app');
  assert.equal(target.provider, 'postgresql');
  assert.equal(target.endpointId, null);
  assert.equal(target.region, null);
  assert.equal(JSON.stringify(target).includes('private-value'), false);
  assert.equal(JSON.stringify(target).includes('db.example.invalid'), false);
});

test('database URL validation fails closed without echoing connection data', () => {
  assert.throws(() => parseDatabaseTarget(''), { code: 'OPSC_DATABASE_URL_MISSING' });
  assert.throws(() => parseDatabaseTarget('https://user:secret@example.invalid/db'), {
    code: 'OPSC_DATABASE_URL_PROTOCOL_INVALID'
  });
  assert.throws(() => parseDatabaseTarget('postgres://user:secret@'), {
    code: 'OPSC_DATABASE_URL_INVALID'
  });
});

test('migration 056 source digest is a deterministic SHA-256', () => {
  const first = migrationSourceDigest();
  const second = migrationSourceDigest();
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('database errors are reduced to SQLSTATE or a fixed safe code', () => {
  assert.equal(safeErrorCode({ code: '28P01', message: 'password leaked in this message' }), '28P01');
  assert.equal(safeErrorCode({ message: 'postgres://secret@host' }), 'DATABASE_IDENTITY_QUERY_FAILED');
});
