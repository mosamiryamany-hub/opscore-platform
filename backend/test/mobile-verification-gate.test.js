'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('mobile verification gate decides process exit only after the final assertion', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/scripts/verify-mobile.js'), 'utf8');
  const exit = source.lastIndexOf('process.exitCode');
  const finalAssertion = source.lastIndexOf("check('sync center displays backoff queue entries and reports full count'");
  assert.ok(finalAssertion >= 0, 'expected final reliability assertion is present');
  assert.ok(exit > finalAssertion, 'process.exitCode must be assigned after all assertions');
assert.equal(source.split('process.exitCode =').length - 1, 1);
});

test('mobile verification gate includes security and reliability assertions after the earlier core checks', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/scripts/verify-mobile.js'), 'utf8');
  for (const marker of [
    'server-bound signoff API helpers wired',
    'generic sync payloads and mission cache are encrypted',
    'signout requests server token revocation',
    'request timeout aborts fetch even with caller signal',
    'sync center displays backoff queue entries and reports full count'
  ]) assert.ok(source.includes(marker), 'missing mobile assertion: ' + marker);
});
