
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('pg-sync-worker uses transaction-local tenant bind when inTransaction and clears GUCs on release', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/pg-sync-worker.js'), 'utf8');
  assert.match(src, /const isLocal = session\.inTransaction === true/);
  assert.match(src, /set_config\('app\.tenant_id', \$1, \$4\)/);
  assert.match(src, /SIGNED_TENANT_CONTEXT_REQUIRED/);
  assert.match(src, /set_config\('app\.tenant_id', '', false\)/);
  assert.match(src, /RESET ALL/);
  assert.match(src, /endRequest/);
});
