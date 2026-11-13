'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement() {
  const classes = new Set();
  return {
    textContent: '',
    href: '',
    classes,
    classList: {
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value))
    },
    removeAttribute(name) {
      if (name === 'href') this.href = '';
    }
  };
}

test('release proof page separates CI identity from commercial release closure', async () => {
  const scriptPath = path.join(__dirname, '..', 'web', 'verify', 'release-proof.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    }
  };
  const proof = {
    status: 'UNVERIFIED',
    sourceCommitIdentitySource: 'github-actions-cli-assertion',
    sourceCommit: 'f'.repeat(40),
    ci: { status: 'PASS', pipelineId: 43467207088 },
    gates: {
      commercialClosure: 'UNVERIFIED',
      livePostgresRls: 'PASS_TEST_SCOPE',
      productionSessionTenantBoundary: 'NOT_VERIFIED',
      productionRecoveryBundle: 'NOT_VERIFIED',
      productionIsolationCertification: 'NOT_CERTIFIED'
    },
    productionAcceptance: { status: 'NOT_VERIFIED' },
    packageFingerprint: { status: 'PUBLISHED', value: 'a'.repeat(64) }
  };
  const context = {
    document,
    encodeURIComponent,
    fetch: async () => ({ ok: true, json: async () => proof })
  };

  vm.runInNewContext(script, context, { filename: scriptPath });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(elements.get('identitySource').textContent, 'github-actions-cli-assertion');
  assert.equal(elements.get('ciGate').textContent, 'PASS');
  assert.equal(elements.get('commercialGate').textContent, 'UNVERIFIED');
  assert.equal(elements.get('acceptanceGate').textContent, 'NOT_VERIFIED');
  assert.equal(elements.get('sessionGate').textContent, 'NOT_VERIFIED');
  assert.equal(elements.get('recoveryGate').textContent, 'NOT_VERIFIED');
  assert.equal(elements.get('isolationGate').textContent, 'NOT_CERTIFIED');
  assert.equal(elements.get('status').textContent, 'UNVERIFIED');
});

test('release page labels CI, commercial closure, and production acceptance independently', () => {
  const htmlPath = path.join(__dirname, '..', 'web', 'verify', 'release.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Commit-bound CI verification/);
  assert.match(html, /Commercial release closure/);
  assert.match(html, /Production acceptance evidence/);
  assert.match(html, /id="ciGate"/);
  assert.match(html, /id="commercialGate"/);
  assert.match(html, /id="acceptanceGate"/);
});
