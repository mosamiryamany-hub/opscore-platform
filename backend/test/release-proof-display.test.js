'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const webRoot = path.resolve(__dirname, '..', 'web', 'verify');
const html = fs.readFileSync(path.join(webRoot, 'release.html'), 'utf8');
const script = fs.readFileSync(path.join(webRoot, 'release-proof.js'), 'utf8');

test('release proof page publishes successful CI evidence separately from Production certification', () => {
  assert.match(html, /PASS — CI · Run 44552772156/);
  assert.match(html, /PASS — isolated CI · Run 44552772494/);
  assert.match(html, /Current main source revision/);
  assert.match(html, /d672dce8f18e1d7095aed3126aedb0f995796144/);
  assert.match(html, /346-route disposable CI matrix/);
  assert.match(html, /NOT VERIFIED — no Production route results/);
  assert.match(html, /NOT VERIFIED — PITR probe not run/);
  assert.match(html, /NOT PRODUCED — no verified signed archive/);
  assert.match(html, /Live PostgreSQL catalog configuration/);
});

test('release proof renderer distinguishes native deployment identity and live catalog configuration from Action attestation', async () => {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '',
        href: '',
        classList: {
          add: (name) => classes.add(name),
          remove: (...names) => names.forEach((name) => classes.delete(name)),
          contains: (name) => classes.has(name)
        },
        removeAttribute(name) { if (name === 'href') this.href = ''; }
      });
    }
    return elements.get(id);
  };
  const document = { getElementById: getElement };
  const responses = {
    '/api/verify/release': {
      status: 'UNVERIFIED',
      sourceCommit: '68505535f1c2fabd2a786094f8f64d234d26e123',
      releaseTag: null,
      sourceCommitIdentitySource: 'unverified',
      deployment: { status: 'identified', id: 'dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9' },
      ci: { status: 'UNVERIFIED', pipelineId: null },
      gates: {
        commercialClosure: 'UNVERIFIED',
        livePostgresRls: 'UNVERIFIED',
        productionSessionTenantBoundary: 'NOT_VERIFIED',
        productionRecoveryBundle: 'NOT_VERIFIED',
        productionIsolationCertification: 'NOT_CERTIFIED'
      },
      productionAcceptance: { status: 'NOT_VERIFIED' },
      packageFingerprint: { status: 'UNVERIFIED', value: null }
    },
    '/api/verify/deployment': {
      status: 'identified',
      source: {
        provider: 'github',
        commitSha: '68505535f1c2fabd2a786094f8f64d234d26e123',
        commitIdentitySource: 'vercel-git-metadata'
      }
    },
    '/api/verify/database-security': {
      status: 'IDENTITY_PLANE_RLS_ENFORCED',
      publicSchema: {
        ordinaryTableCount: 136,
        rlsEnabledTableCount: 135,
        rlsForcedTableCount: 135,
        nonPostgisTablesWithoutRlsCount: 0,
        nonPostgisTablesWithoutForceRlsCount: 0
      },
      runtimeRole: { status: 'LEAST_PRIVILEGE_PRESENT' }
    }
  };
  const fetch = async (url) => ({
    ok: Boolean(responses[url]),
    json: async () => responses[url]
  });
  const result = vm.runInNewContext(script, {
    document,
    fetch,
    encodeURIComponent,
    Promise,
    String,
    Error
  });
  await result;

  assert.equal(getElement('ciGate').textContent, 'UNVERIFIED');
  assert.equal(getElement('ciGate').classList.contains('warn'), true);
  assert.equal(getElement('identitySource').classList.contains('warn'), true);
  assert.match(getElement('deploymentSourceEvidence').textContent, /IDENTIFIED — vercel-git-metadata/);
  assert.match(getElement('deployedCommitEvidence').textContent, /^68505535/);
  assert.equal(getElement('databaseCatalogEvidence').textContent, 'PASS — LIVE CATALOG CONFIGURATION');
  assert.equal(getElement('databaseCatalogEvidence').classList.contains('ok'), true);
  assert.match(getElement('dbCatalogDetails').textContent, /Catalog-only evidence/);
  assert.equal(getElement('isolationGate').textContent, 'NOT_CERTIFIED');
  assert.equal(getElement('sessionGate').textContent, 'NOT_VERIFIED');
  assert.equal(getElement('recoveryGate').textContent, 'NOT_VERIFIED');
});
