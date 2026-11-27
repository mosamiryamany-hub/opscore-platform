'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
const serverSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'server.js'), 'utf8');

test('Vercel global Permissions-Policy denies camera and microphone but permits same-origin geolocation', () => {
  const rule = vercelConfig.headers.find(entry => entry.source === '/(.*)');
  assert.ok(rule, 'global Vercel headers rule must exist');
  const policy = rule.headers.find(header => header.key.toLowerCase() === 'permissions-policy');
  assert.equal(policy.value, 'camera=(), microphone=(), geolocation=(self)');
});

test('backend default JSON and static response policy stays restrictive', () => {
  assert.equal(serverSource.split('geolocation=(self)').length - 1, 3);
  assert.equal(serverSource.split("'permissions-policy': 'camera=(),microphone=(),geolocation=(self)'").length - 1, 2);
});

test('global Vercel CSP remains enforcing and same-origin only for connections', () => {
  const rule = vercelConfig.headers.find(entry => entry.source === '/(.*)');
  const csp = rule.headers.find(header => header.key.toLowerCase() === 'content-security-policy');
  assert.ok(csp);
  assert.ok(csp.value.includes("connect-src 'self';"));
  assert.ok(csp.value.includes("object-src 'none'"));
  assert.ok(csp.value.includes("frame-ancestors 'none'"));
  assert.ok(!JSON.stringify(vercelConfig.headers).includes('Content-Security-Policy-Report-Only'));
});

test('only the exact Contact Center page receives browser microphone and OpenAI signaling access', () => {
  const rule = vercelConfig.headers.find(entry => entry.source === '/contact-center.html');
  assert.ok(rule, 'an exact Contact Center header exception must exist');
  const policy = rule.headers.find(header => header.key.toLowerCase() === 'permissions-policy');
  const csp = rule.headers.find(header => header.key.toLowerCase() === 'content-security-policy');
  assert.equal(policy.value, 'camera=(), microphone=(self), geolocation=(self)');
  assert.ok(csp.value.includes("connect-src 'self' https://api.openai.com"));
  assert.ok(csp.value.includes("object-src 'none'"));
  assert.ok(csp.value.includes("frame-ancestors 'none'"));
  assert.ok(!csp.value.includes('connect-src *'));
});

test('self-hosted static server scopes browser voice access to contact-center.html only', () => {
  assert.ok(serverSource.includes("if (path.basename(file) === 'contact-center.html')"));
  assert.ok(serverSource.includes("headers['permissions-policy'] = 'camera=(),microphone=(self),geolocation=(self)'"));
  assert.ok(serverSource.includes("connect-src 'self' https://api.openai.com"));
  assert.equal(serverSource.split("headers['permissions-policy'] = 'camera=(),microphone=(self),geolocation=(self)'").length - 1, 1);
});

test('dynamic map CSP origin is HTTPS-only and exact-origin validated by a separate helper', () => {
  assert.ok(serverSource.includes("resolveMapTileOrigin(process.env.OPSCORE_MAP_TILE_ORIGIN"));
  assert.ok(serverSource.includes("function mapTileOrigin()"));
});
