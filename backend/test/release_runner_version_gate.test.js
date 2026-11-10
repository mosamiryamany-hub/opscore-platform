const test = require('node:test');
const assert = require('node:assert/strict');

function satisfies(v) {
  const [major, minor, patch] = v.split('.').map(Number);
  return major === 22 && (minor > 23 || (minor === 23 && patch >= 4));
}

test('release runner requires security-patched Node 22.23.4 or newer within Node 22', () => {
  for (const v of ['22.23.4', '22.24.0', '22.30.0']) assert.equal(satisfies(v), true, v);
  for (const v of ['22.16.0', '22.22.99', '22.23.0', '22.23.1', '22.23.3', '23.0.0', '24.1.0']) assert.equal(satisfies(v), false, v);
});
