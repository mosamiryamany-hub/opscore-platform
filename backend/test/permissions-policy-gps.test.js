'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
const serverSource = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'server.js'), 'utf8');

test('Vercel Permissions-Policy permits same-origin opt-in geolocation only', () => {
  const rule = vercelConfig.headers.find((entry) => entry.source === '/(.*)');
  assert.ok(rule, 'global Vercel headers rule must exist');
  const policy = rule.headers.find((header) => header.key.toLowerCase() === 'permissions-policy');
  assert.ok(policy, 'Permissions-Policy header must exist');
  assert.ok(policy.value.includes('geolocation=(self)'));
  assert.ok(policy.value.includes('camera=()'));
  assert.ok(policy.value.includes('microphone=()'));
});

test('backend JSON and static response policies permit same-origin geolocation', () => {
  assert.equal(serverSource.split('geolocation=(self)').length - 1, 2);
  assert.equal(serverSource.split('camera=(),microphone=()').length - 1, 2);
});

test('Vercel CSP uses a no-external-provider default and remains enforcing', () => {
  const rule = vercelConfig.headers.find((entry) => entry.source === '/(.*)');
  const csp = rule.headers.find((header) => header.key.toLowerCase() === 'content-security-policy');
  assert.ok(csp, 'an enforcing Content-Security-Policy is required');
  assert.match(csp.value, /img-src 'self' data: blob:;/);
  assert.match(csp.value, /connect-src 'self';/);
  assert.doesNotMatch(JSON.stringify(vercelConfig.headers), /Content-Security-Policy-Report-Only/i);
  assert.doesNotMatch(csp.value, /img-src[^;]*\*/i, 'wildcard image origins are not permitted');
});

test('dynamic map CSP origin is HTTPS-only and exact-origin validated by a separate helper', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'server.js'), 'utf8');
  assert.match(source, /resolveMapTileOrigin\(process\.env\.OPSCORE_MAP_TILE_ORIGIN/);
  assert.match(source, /function mapTileOrigin\(\)[\s\S]*?resolveMapTileOrigin/);
});
