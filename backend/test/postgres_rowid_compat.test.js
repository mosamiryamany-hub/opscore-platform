'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', 'src');
function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

test('PostgreSQL-backed production paths avoid SQLite-only ORDER BY rowid', () => {
  const files = [
    'ai-contact-center.js',
    'operational-autopilot.js',
    'operational-intelligence-fabric.js',
    'store.js'
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\bORDER\s+BY\s+rowid\b/i, `${file} still has a PostgreSQL-incompatible rowid order`);
  }
});

test('message chronology and audit chronology use portable stable tie-breakers', () => {
  assert.match(read('ai-contact-center.js'), /ORDER BY created_at DESC, id DESC LIMIT \?/);
  assert.match(read('operational-autopilot.js'), /ORDER BY created_at ASC, id ASC LIMIT \?/);
  const fabric = read('operational-intelligence-fabric.js');
  assert.equal((fabric.match(/ORDER BY created_at ASC, id ASC LIMIT \?/g) || []).length, 2);
  const store = read('store.js');
  assert.match(store, /ORDER BY created_at DESC, id DESC LIMIT 250/);
});

test('organization recovery snapshots order by primary keys, including composite membership keys', () => {
  const store = read('store.js');
  assert.match(store, /const orderBy = table === 'memberships' \? 'organization_id, user_id' : 'id';/);
  assert.match(store, /WHERE \$\{ where \} ORDER BY \$\{ orderBy \} LIMIT \?/);
});
