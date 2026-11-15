'use strict';

process.env.NODE_ENV = 'test';
process.env.OPSC_PG_SYNC_WORKER_SCRIPT = require('node:path').join(__dirname, 'fixtures', 'pg-sync-worker-mock.js');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { openPgDatabaseSync, runWithRequest, currentRequestId, resolveWorkerSslMode } = require('../src/pg-database-sync');

test('persistent PostgreSQL bridge preserves transactions and isolates HTTP requests', async (t) => {
  const db = openPgDatabaseSync('postgres://test.invalid/opscore_test', { max: 2 });
  t.after(() => db.close());

  const reqA = new EventEmitter();
  const resA = new EventEmitter();
  const resultA = await runWithRequest(async () => {
    const requestId = currentRequestId();
    db.exec('BEGIN IMMEDIATE');
    const inside = db.prepare('SELECT ? AS value').get('alpha');
    const write = db.prepare('UPDATE sample SET value = ?').run('beta');
    db.exec('COMMIT');
    const after = db.prepare('SELECT current').get();
    return { requestId, inside, write, after };
  }, reqA, resA);

  assert.equal(resultA.inside.requestId, resultA.requestId);
  assert.equal(resultA.inside.inTransaction, true);
  assert.equal(resultA.inside.params[0], 'alpha');
  assert.equal(resultA.write.changes, 1);
  assert.equal(resultA.after.requestId, resultA.requestId);
  assert.equal(resultA.after.sessionToken, resultA.inside.sessionToken);
  assert.equal(resultA.after.inTransaction, false);

  const reqB = new EventEmitter();
  const resB = new EventEmitter();
  const resultB = await runWithRequest(() => db.prepare('SELECT isolated').get(), reqB, resB);
  assert.notEqual(resultB.requestId, resultA.requestId);
  assert.notEqual(resultB.sessionToken, resultA.inside.sessionToken);

  resA.emit('finish');
  resB.emit('finish');

  const reqC = new EventEmitter();
  const resC = new EventEmitter();
  const resultC = await runWithRequest(() => db.prepare('SELECT fresh').get(), reqC, resC);
  assert.notEqual(resultC.requestId, resultA.requestId);
  assert.notEqual(resultC.sessionToken, resultA.inside.sessionToken);
  resC.emit('close');
});

test('signed tenant context is immutable, transaction-bound, single-use per transaction, and the worker never receives the HMAC key', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'ab'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'unit-test-key-v1';

  const db = openPgDatabaseSync('postgres://test.invalid/opscore_signed_test', { max: 2 });
  t.after(() => {
    db.close();
    if (priorKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });

  const req = new EventEmitter();
  const res = new EventEmitter();
  const result = await runWithRequest(() => {
    db.setVerifiedPrincipal({ sessionId: 'session-A', userId: 'user-A', tenantId: 'tenant-A' });
    assert.throws(
      () => db.setVerifiedPrincipal({ sessionId: 'session-B', userId: 'user-B', tenantId: 'tenant-B' }),
      (error) => error.code === 'TENANT_CONTEXT_PRINCIPAL_IMMUTABLE'
    );

    db.exec('BEGIN READ ONLY');
    const firstBinding = db.activateVerifiedTenantContext();
    const active = db.prepare('SELECT signed context status').get();
    assert.equal(active.inTransaction, true);
    assert.equal(active.signedContextBound, true);
    assert.equal(active.workerHasSigningKey, false);
    assert.equal(active.payloadClaims.session_id, 'session-A');
    assert.equal(active.payloadClaims.sub, 'user-A');
    assert.equal(active.payloadClaims.tenant_id, 'tenant-A');
    assert.equal(active.payloadClaims.backend_pid, firstBinding.backendPid);
    assert.equal(active.payloadClaims.transaction_id, firstBinding.transactionId);
    assert.equal(Object.prototype.hasOwnProperty.call(active.messageKeys || {}, 'secret'), false);

    assert.throws(
      () => db.activateVerifiedTenantContext(),
      (error) => error.code === 'TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION'
    );
    db.exec('COMMIT');

    db.exec('BEGIN READ ONLY');
    const secondBinding = db.activateVerifiedTenantContext();
    assert.notEqual(secondBinding.transactionId, firstBinding.transactionId);
    assert.equal(db.prepare('SELECT new transaction').get().signedContextBound, true);
    db.exec('ROLLBACK');
    return { firstBinding, secondBinding };
  }, req, res);

  assert.notEqual(result.firstBinding.transactionId, result.secondBinding.transactionId);
  res.emit('finish');
});

test('signed tenant context fails closed when the key is missing', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;

  const db = openPgDatabaseSync('postgres://test.invalid/opscore_missing_key', { max: 1 });
  t.after(() => {
    db.close();
    if (priorKey !== undefined) process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid !== undefined) process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });
  const req = new EventEmitter();
  const res = new EventEmitter();
  await runWithRequest(() => {
    db.setVerifiedPrincipal({ sessionId: 's', userId: 'u', tenantId: 't' });
    db.exec('BEGIN READ ONLY');
    assert.throws(
      () => db.activateVerifiedTenantContext(),
      (error) => error.code === 'TENANT_CONTEXT_SIGNING_KEY_REQUIRED'
    );
    db.exec('ROLLBACK');
  }, req, res);
  res.emit('finish');
});



test('authenticated session requests bind each autocommit SQL statement to its own signed transaction', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'cd'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'unit-test-session-autobind-v1';

  const db = openPgDatabaseSync('postgres://test.invalid/opscore_session_autobind', { max: 2 });
  t.after(() => {
    db.close();
    if (priorKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });

  const req = new EventEmitter();
  const res = new EventEmitter();
  const result = await runWithRequest(() => {
    db.setVerifiedPrincipal({
      sessionId: 'session-autobind-A',
      userId: 'user-autobind-A',
      tenantId: 'tenant-autobind-A'
    });
    const first = db.prepare('SELECT first authenticated query').get();
    const second = db.prepare('SELECT second authenticated query').get();
    return { first, second };
  }, req, res);

  for (const row of [result.first, result.second]) {
    assert.equal(row.inTransaction, true, 'each autocommit statement must execute inside the explicit signed transaction');
    assert.equal(row.signedContextBound, true);
    assert.equal(row.workerHasSigningKey, false, 'the HMAC key must remain in the parent process');
    assert.equal(row.payloadClaims.session_id, 'session-autobind-A');
    assert.equal(row.payloadClaims.sub, 'user-autobind-A');
    assert.equal(row.payloadClaims.tenant_id, 'tenant-autobind-A');
  }
  assert.notEqual(
    result.first.payloadClaims.transaction_id,
    result.second.payloadClaims.transaction_id,
    'separate autocommit statements must receive separate transaction-bound assertions'
  );
  res.emit('finish');
});

test('a signed field-session assertion cannot be reused for privileged access modes', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'a1'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'unit-test-purpose-bound-v1';
  const db = openPgDatabaseSync('postgres://test.invalid/opscore_session_purpose', { max: 1 });
  t.after(() => {
    db.close();
    if (priorKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });
  const req = new EventEmitter();
  const res = new EventEmitter();
  await runWithRequest(() => {
    db.setVerifiedPrincipal({ sessionId: 's', userId: 'u', tenantId: 't' });
    assert.throws(
      () => db.setSession({ tenantId: 't', userId: 'u', accessMode: 'auth' }),
      (error) => error.code === 'SIGNED_CONTEXT_PURPOSE_MISMATCH'
    );
    assert.throws(
      () => db.setAccessMode('backoffice'),
      (error) => error.code === 'SIGNED_CONTEXT_PURPOSE_MISMATCH'
    );
  }, req, res);
  res.emit('finish');
});

test('authenticated session requests reject multiple SQL statements and unbound batch execution', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'ef'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'unit-test-session-batch-v1';
  const db = openPgDatabaseSync('postgres://test.invalid/opscore_session_batch', { max: 1 });
  t.after(() => {
    db.close();
    if (priorKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });

  const req = new EventEmitter();
  const res = new EventEmitter();
  await runWithRequest(() => {
    db.setVerifiedPrincipal({ sessionId: 's', userId: 'u', tenantId: 't' });
    assert.throws(
      () => db.exec('SELECT 1; SELECT 2'),
      (error) => error.code === 'SIGNED_CONTEXT_MULTI_STATEMENT_UNSUPPORTED'
    );
    assert.throws(
      () => db.batch([{ sql: 'SELECT 1', params: [] }]),
      (error) => error.code === 'SIGNED_CONTEXT_BATCH_UNSUPPORTED'
    );
  }, req, res);
  res.emit('finish');
});

test('autocommit signed session requests roll back when signing material is unavailable', async (t) => {
  const priorKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorKid = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;

  const db = openPgDatabaseSync('postgres://test.invalid/opscore_session_no_key', { max: 1 });
  t.after(() => {
    db.close();
    if (priorKey !== undefined) process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorKey;
    if (priorKid !== undefined) process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorKid;
  });
  const req = new EventEmitter();
  const res = new EventEmitter();
  await runWithRequest(() => {
    db.setVerifiedPrincipal({ sessionId: 's', userId: 'u', tenantId: 't' });
    assert.throws(
      () => db.prepare('SELECT must not execute').get(),
      (error) => error.code === 'TENANT_CONTEXT_SIGNING_KEY_REQUIRED'
    );
  }, req, res);
  res.emit('finish');
});

test('PostgreSQL worker inherits a production-safe TLS default and preserves explicit overrides', () => {
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'production' }), 'verify-full');
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'production', OPSC_PG_SSL_MODE: '' }), 'verify-full');
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'test' }), 'require');
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'development' }), 'require');
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'production', OPSC_PG_SSL_MODE: 'verify-full' }), 'verify-full');
  // An explicitly weakened production mode is preserved so the adapter rejects it;
  // the worker bootstrap must not silently override operator security policy.
  assert.equal(resolveWorkerSslMode({ NODE_ENV: 'production', OPSC_PG_SSL_MODE: 'require' }), 'require');
});
