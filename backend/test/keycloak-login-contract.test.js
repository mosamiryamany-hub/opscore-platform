'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/control-plane.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'web/control-plane.js'), 'utf8');

test('Keycloak config endpoint exposes only public issuer and client metadata', () => {
  assert.match(server, /GET' && url\.pathname === '\/api\/v1\/auth\/oidc\/config'/);
  assert.match(server, /clientId: audience, providers:/);
});

test('Authorization start uses allowlisted broker aliases and S256 PKCE', () => {
  assert.match(server, /providers = new Set\(\['google', 'github', 'microsoft', 'apple', 'facebook'\]\)/);
  assert.match(server, /code_challenge_method: 'S256'/);
  assert.match(server, /kc_idp_hint: provider/);
  assert.match(server, /OIDC_CLIENT_SECRET/);
  assert.match(server, /OIDC_REDIRECT_URI/);
});

test('Callback binds state to an HttpOnly signed cookie and validates nonce server-side', () => {
  assert.match(server, /__Host-opscore_oidc_state=/);
  assert.match(server, /crypto\.createHmac\('sha256', stateSecret\)/);
  assert.match(server, /crypto\.timingSafeEqual\(actual, expected\)/);
  assert.match(server, /pending\.state !== returnedState/);
  assert.match(server, /verifyOidcIdToken\(tokenPayload\.id_token, pending\.nonce\)/);
  assert.match(server, /__Host-opscore_session=.*HttpOnly; Secure; Path=\/; SameSite=Strict/);
});

test('Control Plane exposes the five configured Keycloak broker entry points', () => {
  for (const provider of ['google', 'github', 'microsoft', 'apple', 'facebook']) {
    assert.match(html, new RegExp('data-oidc-provider="' + provider + '"'));
  }
  assert.match(client, /window\.location\.assign\('\/api\/v1\/auth\/oidc\/start/);
});

test('Browser performs only same-origin requests and stores no provider tokens', () => {
  assert.match(client, /request\('\/api\/v1\/auth\/oidc\/config'/);
  assert.doesNotMatch(client, /localStorage\.(setItem|getItem)\([^)]*(token|id_token)/i);
  assert.doesNotMatch(client, /fetch\([^)]*token_endpoint/);
});
