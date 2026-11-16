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

test('no-license grant is enforced across first-party package files and release packaging', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
  const { collectFiles } = require('../scripts/provenance-files');
  const licenseFiles = collectFiles(root).filter(relativePath =>
    /(^|\/)(?:LICENSE|LICENCE)(?:\.[^/]*)?$/i.test(relativePath)
  );
  const notice = fs.readFileSync(path.join(root, 'NO_LICENSE_GRANT_NOTICE.txt'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'scripts', 'package-release.js'), 'utf8');
  const hardening = fs.readFileSync(path.join(backend, 'scripts', 'release-hardening-gate.js'), 'utf8');

  assert.equal(pkg.license, 'UNLICENSED');
  assert.deepEqual(licenseFiles, []);
  assert.match(notice, /NO LICENSE GRANT/);
  assert.match(notice, /seller-side activities do not grant a buyer any rights/i);
  assert.match(notice, /seller-side activities do not grant a buyer any rights/i);
  assert.match(notice, /before a buyer is identified/i);
  assert.match(notice, /until the rights holder and that named buyer execute\s+a\s+written License Schedule/i);
  assert.match(notice, /pins the exact deliverable/i);
  assert.match(builder, /function assertNoLicenseGrantFiles/);
  assert.match(builder, /assertNoLicenseGrantFiles\(root, 'source tree'\)/);
  assert.match(builder, /assertNoLicenseGrantFiles\(extractedRoot, 'round-trip archive'\)/);
  assert.match(hardening, /no-first-party-license-grant-files/);
});
