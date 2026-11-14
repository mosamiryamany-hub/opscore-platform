
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('pg-sync-worker binds tenant GUCs with is_local=true only', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/pg-sync-worker.js'), 'utf8');
  assert.match(src, /set_config\('app\.tenant_id', \$1, true\)/);
  assert.match(src, /set_config\('app\.user_id', \$2, true\)/);
  assert.match(src, /set_config\('app\.access_mode', \$3, true\)/);
  assert.doesNotMatch(src, /set_config\('app\.tenant_id', \$1, false\)/);
  assert.match(src, /SIGNED_TENANT_CONTEXT_REQUIRED/);
});
