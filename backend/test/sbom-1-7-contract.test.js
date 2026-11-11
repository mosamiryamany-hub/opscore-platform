'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const generator = fs.readFileSync(path.join(root, 'scripts', 'generate-sbom.js'), 'utf8');
const verifier = fs.readFileSync(path.join(root, 'scripts', 'verify-sbom.js'), 'utf8');
const secureRelease = fs.readFileSync(path.join(root, '.github', 'workflows', 'opscore-secure-release.yml'), 'utf8');

test('SBOM generator emits CycloneDX 1.7 author, timestamp, tool, lifecycle and generation context', () => {
  assert.match(generator, /specVersion: '1\.7'/);
  assert.match(generator, /timestamp: new Date\(\)\.toISOString\(\)/);
  assert.match(generator, /authors: \[\{ name: 'OpsCore Release Engineering' \}\]/);
  assert.match(generator, /tools: \[\{ vendor: 'OpsCore', name: 'opscore-sbom-generator', version: '1\.1\.0' \}\]/);
  assert.match(generator, /lifecycles: \[\{ phase: 'build' \}\]/);
  assert.match(generator, /opscore:generation-context/);
  assert.match(generator, /opscore:source-commit/);
  assert.match(generator, /opscore:lockfiles-sha256/);
});

test('top-level applications receive source hashes and the explicit use-only license', () => {
  assert.match(generator, /sourceArchiveHash\('backend'\)/);
  assert.match(generator, /sourceArchiveHash\('mobile'\)/);
  assert.match(generator, /alg: 'SHA-256'/);
  assert.match(generator, /OpsCore Use-Only Source License/);
  assert.match(generator, /opscore:license-file/);
});

test('SBOM verifier validates every lockfile component hash and license', () => {
  assert.match(verifier, /CycloneDX 1\.7/);
  assert.match(verifier, /component integrity hash/);
  assert.match(verifier, /component license metadata/);
  assert.match(verifier, /BOM root component source hash/);
  assert.match(verifier, /SBOM workflow run ID matches runner/);
  assert.match(verifier, /SBOM workflow ref matches runner/);
});

test('secure release verifies both archive provenance and CycloneDX predicate attestations', () => {
  assert.match(secureRelease, /Generate CycloneDX 1\.7 SBOM/);
  assert.match(secureRelease, /Verify signed release provenance/);
  assert.match(secureRelease, /Verify signed CycloneDX SBOM attestation/);
  assert.match(secureRelease, /gh attestation verify/);
});
