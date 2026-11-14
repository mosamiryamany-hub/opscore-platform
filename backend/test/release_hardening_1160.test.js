const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');

test('release metadata is bounded and public for source distribution', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.11.62');
  assert.equal(pkg.private, false);
  assert.equal(pkg.engines.node, '>=22.23.4 <23');
});

test('demo credentials are environment supplied and not hard-coded', () => {
  const seed = fs.readFileSync(path.join(backend, 'scripts/seed-demo.js'), 'utf8');
  const cli = fs.readFileSync(path.join(backend, 'bin/opscore.js'), 'utf8');
  assert.match(seed, /OPSC_DEMO_PASSWORD_ADMIN/);
  assert.doesNotMatch(seed, /DemoAdmin-ChangeMe-2026!/);
  assert.doesNotMatch(seed, /DemoDispatcher-ChangeMe-2026!/);
  assert.match(cli, /OPSC_DEMO_PASSWORD_OWNER/);
  const legacyOwnerPassword = ['Demo-Owner-2026', 'Local!'].join('-');
  assert.doesNotMatch(cli, new RegExp(legacyOwnerPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('storage provider is explicit and fail-closed outside shipped local implementation', () => {
  const config = fs.readFileSync(path.join(backend, 'src/config.js'), 'utf8');
  const store = fs.readFileSync(path.join(backend, 'src/store.js'), 'utf8');
  assert.match(config, /storageProvider/);
  assert.match(config, /\['local'\]/);
  assert.match(store, /STORAGE_PROVIDER_UNSUPPORTED/);
});

test('async scrypt path is wired into HTTP authentication', () => {
  const security = fs.readFileSync(path.join(backend, 'src/security.js'), 'utf8');
  const store = fs.readFileSync(path.join(backend, 'src/store.js'), 'utf8');
  const server = fs.readFileSync(path.join(backend, 'src/server.js'), 'utf8');
  assert.match(security, /async function verifyPasswordAsync/);
  assert.match(security, /scryptAsync/);
  assert.match(store, /async loginAsync\(/);
  assert.match(store, /await verifyPasswordAsync/);
  assert.match(server, /await store\.loginAsync/);
});

test('tooling and explicit no-license release boundary are present', () => {
  assert.equal(fs.existsSync(path.join(root, 'eslint.config.js')), true);
  assert.equal(fs.existsSync(path.join(root, '.prettierrc.json')), true);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'opscore-ci.yml')), true);
  assert.equal(fs.existsSync(path.join(root, 'NO_LICENSE_GRANT_NOTICE.txt')), true);
  assert.equal(fs.existsSync(path.join(root, 'PROPRIETARY_LICENSE.txt')), false);
});
