'use strict';

process.env.NODE_ENV = 'test';
process.env.OPSC_PG_SYNC_WORKER_SCRIPT = require('node:path').join(__dirname, 'fixtures', 'pg-sync-worker-mock.js');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { openPgDatabaseSync, runWithRequest, currentRequestId } = require('../src/pg-database-sync');

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
