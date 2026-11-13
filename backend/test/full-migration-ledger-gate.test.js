'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'full-migration-ledger-gate.js'),
  'utf8'
);

test('full migration ledger gate uses buildMigrationPlan and fail-closed statuses', () => {
  assert.match(source, /buildMigrationPlan/);
  assert.match(source, /LEDGER_COMPLETE/);
  assert.match(source, /LEDGER_PENDING/);
  assert.match(source, /LEDGER_BLOCKED/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /schema_migrations/);
});

test('full migration ledger gate remains separate from runtime identity preflight', () => {
  const preflight = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'production-database-identity-preflight.js'),
    'utf8'
  );
  assert.doesNotMatch(preflight, /full-migration-ledger-gate/);
  assert.doesNotMatch(preflight, /SELECT[\s\S]{0,240}FROM public\.schema_migrations/i);
});
