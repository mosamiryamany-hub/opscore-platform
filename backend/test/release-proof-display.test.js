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
  assert.match(html, /CI-tested main revision/);
  assert.match(html, /d672dce8f18e1d7095aed3126aedb0f995796144/);
  assert.match(html, /346-route disposable CI matrix/);
  assert.match(html, /id="signedRoutesEvidence"/);
  assert.match(html, /id="pitrEvidence"/);
  assert.match(html, /id="archiveEvidence"/);
  assert.doesNotMatch(html, /no Production route results (0 tested)/);
  assert.doesNotMatch(html, /PITR probe not run; restore differs in six application tables/);
  assert.doesNotMatch(html, /NOT PRODUCED — no verified signed archive/);
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


test('release proof renderer requires all 67 live route bindings and does not confuse branch-point recovery with PITR', async () => {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '',
        href: '',
        classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name))
        },
        removeAttribute(name) { if (name === 'href') this.href = ''; }
      });
    }
    return elements.get(id);
  };
  const proof = {
    status: 'PASS',
    sourceCommit: 'a'.repeat(40),
    sourceCommitIdentitySource: 'github-actions-cli-assertion',
    deployment: { id: 'dpl_Production123', environment: 'production' },
    ci: { status: 'PASS', pipelineId: 44735471699 },
    gates: {
      commercialClosure: 'PASS',
      livePostgresRls: 'PASS_TEST_SCOPE',
      productionSessionTenantBoundary: 'PASS_PRODUCTION_PROBE_SCOPE',
      productionRecoveryBundle: 'PASS_PRODUCTION_ROW_COUNT_SCOPE',
      productionIsolationCertification: 'CERTIFIED',
      signedTenantSessionRouteCoverage: 'PASS_PRODUCTION_ROUTE_SCOPE',
      neonPointInTimeRecovery: 'PASS_BRANCH_POINT'
    },
    signedTenantRouteCoverage: {
      status: 'PASS',
      expectedRouteCount: 67,
      coveredRouteCount: 67,
      failedRouteCount: 0,
      testedRoutes: 67,
      commitBound: true,
      pipelineBound: true,
      parentBranchBound: true,
      deploymentIdBound: true,
      manifestBound: true,
      inventoryBound: true,
      routeResultsValid: true
    },
    productionAcceptance: { status: 'PASS' },
    packageFingerprint: { status: 'PUBLISHED', value: 'b'.repeat(64) }
  };
  const context = {
    document: { getElementById: getElement },
    fetch: async () => ({ ok: true, json: async () => proof }),
    encodeURIComponent,
    Promise,
    String,
    Error
  };
  const execution = vm.runInNewContext(script, context);
  await execution;
  await new Promise(resolve => setImmediate(resolve));

  assert.match(getElement('signedRoutesEvidence').textContent, /^PASS — 67\/67/);
  assert.match(getElement('pitrEvidence').textContent, /BRANCH-POINT PASS ONLY/);
  assert.match(getElement('archiveEvidence').textContent, /package fingerprint alone is not a signed archive/);
});
