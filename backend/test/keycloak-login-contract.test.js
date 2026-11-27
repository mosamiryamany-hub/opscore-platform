'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/control-plane.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'web/control-plane.js'), 'utf8');

test('Keycloak OIDC configuration endpoint exposes only public client metadata', () => {
  assert.match(server, /GET' && url\.pathname === '\/api\/v1\/auth\/oidc\/config'/);
  assert.match(server, /return json\(res, 200, \{ enabled: true, issuer, clientId: audience, providers:/);
  assert.doesNotMatch(server, /clientSecret|OIDC_CLIENT_SECRET/);
});

test('OIDC exchange validates the ID token and establishes the HttpOnly application session', () => {
  assert.match(server, /verifyOidcIdToken\(b\.idToken,nonce\)/);
  assert.match(server, /__Host-opscore_session=.*HttpOnly; Path=\/; SameSite=Strict; Secure/);
  assert.match(server, /AUTH_MODE_OIDC_REQUIRED/);
});

test('Control Plane exposes the configured Keycloak broker providers', () => {
  for (const provider of ['google', 'github', 'microsoft', 'apple', 'facebook']) {
    assert.match(html, new RegExp('data-oidc-provider="' + provider + '"'));
  }
  assert.match(client, /kc_idp_hint: provider/);
});

test('Browser authorization uses state, nonce and S256 PKCE without persistent token storage', () => {
  assert.match(client, /code_challenge_method: 'S256'/);
  assert.match(client, /returnedState !== pending\.state/);
  assert.match(client, /nonce,/);
  assert.match(client, /code_verifier: pending\.verifier/);
  assert.match(client, /sessionStorage\.setItem\('opscore_oidc_pending'/);
  assert.doesNotMatch(client, /localStorage\.(setItem|getItem)\([^)]*(token|id_token)/i);
});

test('Keycloak origin is narrowly added to the Control Plane connect-src policy', () => {
  assert.match(server, /path\.basename\(file\) === 'control-plane\.html'/);
  assert.match(server, /connect-src 'self'/);
  assert.match(server, /new URL\(process\.env\.OIDC_ISSUER\)\.origin/);
});
