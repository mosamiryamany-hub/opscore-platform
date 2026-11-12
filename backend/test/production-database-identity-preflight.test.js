'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  migrationSourceDigest,
  parseDatabaseTarget,
  safeErrorCode,
  selectDatabaseConnection,
  buildEnvironmentChecks
} = require('../scripts/production-database-identity-preflight');

test('Neon pooled URLs expose only a non-secret endpoint identifier and region', () => {
  const raw = 'postgresql://runtime:do-not-print-this@ep-prod-abc123-pooler.us-east-2.aws.neon.tech/opscore?sslmode=require&channel_binding=require';
  const target = parseDatabaseTarget(raw);
  assert.deepEqual(
    { provider: target.provider, endpointId: target.endpointId, region: target.region },
    { provider: 'neon', endpointId: 'ep-prod-abc123', region: 'us-east-2' }
  );
  assert.equal(JSON.stringify(target).includes('do-not-print-this'), false);
  assert.equal(JSON.stringify(target).includes('ep-prod-abc123-pooler.us-east-2.aws.neon.tech'), false);
  assert.match(target.hostnameSha256, /^[a-f0-9]{64}$/);
  assert.equal(target.clientSslMode, 'require');
  assert.equal(target.channelBinding, 'require');
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

test('canonical Neon compute host extracts region after the proxy label', () => {
  const target = parseDatabaseTarget(
    'postgresql://runtime:secret@ep-snowy-cloud-bc3hbfjy-dyh.c-16.us-east-1.aws.neon.tech/opscore'
  );
  assert.equal(target.endpointId, 'ep-snowy-cloud-bc3hbfjy-dyh');
  assert.equal(target.region, 'us-east-1');
  assert.equal(JSON.stringify(target).includes('c-16.us-east-1.aws.neon.tech'), false);
});

test('application database URL takes precedence over Neon integration candidate', () => {
  const selected = selectDatabaseConnection({
    OPSC_DATABASE_URL: 'postgresql://app:secret@ep-app.us-east-1.aws.neon.tech/app',
    DATABASE_URL_UNPOOLED: 'postgresql://integration:secret@ep-candidate.us-east-1.aws.neon.tech/candidate'
  });
  assert.equal(selected.source, 'OPSC_DATABASE_URL');
  assert.equal(selected.applicationBinding, true);
  assert.match(selected.connectionString, /ep-app/);
});

test('Neon integration URL is explicitly marked as candidate when application URL is unavailable', () => {
  const selected = selectDatabaseConnection({
    DATABASE_URL_UNPOOLED: 'postgresql://integration:secret@ep-candidate.us-east-1.aws.neon.tech/candidate'
  });
  assert.equal(selected.source, 'DATABASE_URL_UNPOOLED');
  assert.equal(selected.applicationBinding, false);
  assert.match(selected.connectionString, /ep-candidate/);
});

test('no available database URL fails closed', () => {
  assert.deepEqual(selectDatabaseConnection({}), {
    connectionString: '',
    source: 'NONE',
    applicationBinding: false
  });
});

test('candidate-only connection never reports authoritative OPSC database URL as present', () => {
  const env = { DATABASE_URL_UNPOOLED: 'postgresql://integration:secret@ep-candidate.us-east-1.aws.neon.tech/candidate' };
  const selected = selectDatabaseConnection(env);
  const checks = buildEnvironmentChecks(env, selected);
  assert.equal(checks.opscDatabaseUrlPresent, false);
  assert.equal(checks.selectedConnectionStringPresent, true);
  assert.equal(checks.databaseUrlUnpooledPresent, true);
  assert.equal(checks.databaseUrlMatchesOpscDatabaseUrl, true);
});

test('application URL presence and equality are measured independently', () => {
  const env = {
    OPSC_DATABASE_URL: 'postgresql://app:secret@ep-app.us-east-1.aws.neon.tech/app',
    DATABASE_URL: 'postgresql://app:secret@ep-app.us-east-1.aws.neon.tech/app'
  };
  const checks = buildEnvironmentChecks(env);
  assert.equal(checks.opscDatabaseUrlPresent, true);
  assert.equal(checks.databaseUrlPresent, true);
  assert.equal(checks.databaseUrlMatchesOpscDatabaseUrl, true);
});

test('runtime migration ledger inspection never selects the protected ledger table directly', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/production-database-identity-preflight.js'), 'utf8');
  assert.match(source, /to_regprocedure\('public\.opscore_attest_migration_056\(text\)'\)/);
  assert.match(source, /FROM public\.opscore_attest_migration_056\(\$1\)/);
  assert.doesNotMatch(source, /SELECT[\s\S]{0,240}FROM public\.schema_migrations/i);
  assert.match(source, /attestationOwner === 'neondb_owner'/);
});
