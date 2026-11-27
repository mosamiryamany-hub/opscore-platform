'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const vercel = require(path.join(__dirname, '..', '..', 'vercel.json'));

function responseHeader(name) {
  return vercel.headers
    .flatMap(entry => entry.headers || [])
    .find(header => header.key.toLowerCase() === name.toLowerCase())?.value;
}

test('browser voice permissions are limited to same-origin microphone access', () => {
  const policy = responseHeader('Permissions-Policy');
  assert.ok(policy, 'Permissions-Policy must be present');
  assert.match(policy, /microphone=\(self\)/);
  assert.match(policy, /camera=\(\)/);
  assert.doesNotMatch(policy, /microphone=\*/);
});

test('browser voice signaling allows only the required OpenAI API origin in addition to self', () => {
  const csp = responseHeader('Content-Security-Policy');
  assert.ok(csp, 'Content-Security-Policy must be present');
  const connect = csp.split(';').map(part => part.trim()).find(part => part.startsWith('connect-src '));
  assert.equal(connect, "connect-src 'self' https://api.openai.com");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('commercial pricing publishes only the approved two options and preserves IP ownership boundary', () => {
  const fs = require('node:fs');
  const pricing = fs.readFileSync(path.join(__dirname, '..', 'web', 'pricing.html'), 'utf8');
  assert.match(pricing, /US\$2,000/);
  assert.match(pricing, /US\$6,000/);
  assert.match(pricing, /resale and sublicensing rights/i);
  assert.match(pricing, /Neither option transfers ownership/i);
  assert.doesNotMatch(pricing, /\[(?:ENTITY_LEGAL_NAME|PRICE|CURRENCY|UPDATE_DATE)\]/);
});

test('release proof distinguishes published price options from buyer-executed license', () => {
  const fs = require('node:fs');
  const proof = fs.readFileSync(path.join(__dirname, '..', 'web', 'verify', 'release.html'), 'utf8');
  assert.match(proof, /US\$2,000/);
  assert.match(proof, /US\$6,000/);
  assert.match(proof, /NOT YET EXECUTED — BUYER SCHEDULE REQUIRED/);
  assert.doesNotMatch(proof, />NO LICENSE GRANT</);
});
