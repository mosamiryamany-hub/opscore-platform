'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const vercel = require(path.join(__dirname, '..', '..', 'vercel.json'));

function responseHeader(name, source = '/(.*)') {
  const rule = vercel.headers.find(entry => entry.source === source);
  return rule?.headers?.find(header => header.key.toLowerCase() === name.toLowerCase())?.value;
}

test('browser voice permissions remain denied globally and are enabled only on Contact Center', () => {
  const globalPolicy = responseHeader('Permissions-Policy');
  const contactPolicy = responseHeader('Permissions-Policy', '/contact-center.html');
  assert.ok(globalPolicy, 'global Permissions-Policy must be present');
  assert.match(globalPolicy, /microphone=\(\)/);
  assert.match(globalPolicy, /camera=\(\)/);
  assert.ok(contactPolicy, 'Contact Center page-scoped policy must be present');
  assert.match(contactPolicy, /microphone=\(self\)/);
  assert.match(contactPolicy, /camera=\(\)/);
  assert.doesNotMatch(globalPolicy, /microphone=\*/);
});

test('browser voice signaling allows only the required OpenAI API origin on Contact Center', () => {
  const globalCsp = responseHeader('Content-Security-Policy');
  const csp = responseHeader('Content-Security-Policy', '/contact-center.html');
  assert.ok(globalCsp, 'global Content-Security-Policy must be present');
  assert.match(globalCsp, /connect-src 'self';/);
  assert.ok(csp, 'Contact Center page-scoped Content-Security-Policy must be present');
  const connect = csp.split(';').map(part => part.trim()).find(part => part.startsWith('connect-src '));
  assert.equal(connect, "connect-src 'self' https://api.openai.com");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('commercial pricing publishes only the approved two options and preserves IP ownership boundary', () => {
  const pricing = fs.readFileSync(path.join(__dirname, '..', 'web', 'pricing.html'), 'utf8');
  assert.match(pricing, /US\$2,000/);
  assert.match(pricing, /US\$6,000/);
  assert.match(pricing, /resale and sublicensing rights/i);
  assert.match(pricing, /Neither option transfers ownership/i);
  assert.doesNotMatch(pricing, /\[(?:ENTITY_LEGAL_NAME|PRICE|CURRENCY|UPDATE_DATE)\]/);
});

test('release proof distinguishes published price options from buyer-executed license', () => {
  const proof = fs.readFileSync(path.join(__dirname, '..', 'web', 'verify', 'release.html'), 'utf8');
  assert.match(proof, /US\$2,000/);
  assert.match(proof, /US\$6,000/);
  assert.match(proof, /NOT YET EXECUTED — BUYER SCHEDULE REQUIRED/);
  assert.match(proof, /NO LICENSE GRANT is effective merely by publication/);
});
