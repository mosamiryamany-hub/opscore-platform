'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const vercelConfig = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8')
);

test('Vercel Git deploys remain disabled for main but enabled for non-production branches by default', () => {
  assert.deepEqual(vercelConfig.git && vercelConfig.git.deploymentEnabled, {
    main: false
  });
  assert.equal(vercelConfig.github, undefined);
});

test('Vercel exposes the authenticated login route before static fallback with no-store semantics', () => {
  const loginRoutes = (vercelConfig.routes || []).filter(route => route.src === '^/login$');
  assert.equal(loginRoutes.length, 2, 'GET/HEAD and unsupported methods must be explicitly routed');

  assert.deepEqual(loginRoutes[0].methods, ['GET', 'HEAD']);
  assert.equal(loginRoutes[0].status, 307);
  assert.equal(loginRoutes[0].headers?.Location, '/control-plane.html');
  assert.equal(loginRoutes[0].headers?.['Cache-Control'], 'no-store');

  assert.equal(loginRoutes[1].status, 405);
  assert.equal(loginRoutes[1].headers?.Allow, 'GET, HEAD');
  assert.equal(loginRoutes[1].headers?.['Cache-Control'], 'no-store');

  assert.equal(
    fs.existsSync(path.join(repositoryRoot, 'backend', 'web', 'login')),
    false,
    'A static filesystem entry must not shadow the Vercel login route'
  );
});
