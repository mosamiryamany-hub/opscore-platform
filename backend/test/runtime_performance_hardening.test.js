'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('postgres pool has bounded timeout and dead-socket protection defaults', () => {
  const source = fs.readFileSync(path.join(root, 'src/adapters/postgres.js'), 'utf8');
  assert.match(source, /statement_timeout/);
  assert.match(source, /idle_in_transaction_session_timeout/);
  assert.match(source, /keepAlive:\s*true/);
  assert.match(source, /statementTimeoutMs:\s*5000/);
  assert.match(source, /idleInTransactionSessionTimeoutMs:\s*3000/);
});

test('postgres queue claim is ordered and non-blocking', () => {
  const source = fs.readFileSync(path.join(root, 'sql/postgres/028_runtime_performance_hardening.sql'), 'utf8');
  assert.match(source, /ORDER BY created_at, id/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /available_at::timestamptz <= now\(\)/);
  assert.match(source, /lease_until = .*::text/);
  assert.doesNotMatch(source, /available_at <= now\(\)/);
  assert.match(source, /autovacuum_vacuum_scale_factor = 0\.05/);
});

test('mobile storage serializes database operations and keeps scope isolation', () => {
  const source = fs.readFileSync(path.join(root, '..', 'mobile/src/db.js'), 'utf8');
  assert.match(source, /let operationTail = Promise\.resolve\(\)/);
  assert.match(source, /function withDb\(operation\)/);
  assert.match(source, /status='pending' AND scope=\?/);
  assert.match(source, /ORDER BY created_at/);
});
