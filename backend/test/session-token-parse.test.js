'use strict';
// Regression guard for the two js/polynomial-redos alerts closed in this branch.
// It asserts the exact vulnerable expressions are gone and the bounded
// replacements are present, without assuming they were the only matches in
// the file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
const policySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'signed-tenant-context-policy.js'), 'utf8');

test('sessionTokenFromRequest no longer uses a backtracking Bearer regex', () => {
  assert.equal(serverSrc.includes('/^Bearer\\s+(.+)$/i.exec('), false,
    'the unbounded /^Bearer\\s+(.+)$/i.exec expression must not return');
  assert.ok(serverSrc.includes("slice(0, 7).toLowerCase() === 'bearer'"),
    'linear prefix comparison must be present');
  assert.ok(serverSrc.includes('const token = header.slice(7).trim();'),
    'linear bounded token extraction must be present');
});

test('API_INVENTORY template substitution is length-bounded', () => {
  assert.equal(policySrc.includes(".replace(/\\{[^/]+\\}/g, 'signed-route-id')"), false,
    'the unbounded template wildcard must not return');
  assert.ok(policySrc.includes("{1,64}\\}"), 'bounded template wildcard must be present');
});
