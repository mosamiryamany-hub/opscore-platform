'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('PostgreSQL worker rejects unsigned session context and binds signed assertions to request/backend identity', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/pg-sync-worker.js'), 'utf8');
  assert.match(src, /type === 'sessionIdentity'/);
  assert.match(src, /type === 'bindSignedSessionContext'/);
  assert.match(src, /const isLocal = session\.inTransaction === true/);
  assert.match(src, /claims\.backend_pid/);
  assert.match(src, /claims\.request_id/);
  assert.match(src, /TENANT_CONTEXT_SESSION_BINDING_MISMATCH/);
  assert.match(src, /UNSIGNED_SESSION_CONTEXT_REJECTED/);
  assert.match(src, /set_config\('app\.signed_context_payload'/);
  assert.match(src, /set_config\('app\.signed_context_request_id'/);
  assert.match(src, /set_config\('app\.signed_context_request_id', '', false\)/);
  assert.match(src, /RESET ALL/);
  assert.match(src, /endRequest/);
});
