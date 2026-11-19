'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CANDIDATE_ROUTE_PROOF_REQUIREMENTS,
  buildCandidateSignedTenantRouteCoverage
} = require('../scripts/signed-tenant-context-postgres-gate');

const manifestPath = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const inventoryPath = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');
const manifestBytes = fs.readFileSync(manifestPath);
const inventoryBytes = fs.readFileSync(inventoryPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const inventory = JSON.parse(inventoryBytes.toString('utf8'));

function setPass(root, locator) {
  const parts = String(locator).split('.');
  let value = root;
  for (const part of parts.slice(0, -1)) {
    if (!value[part] || typeof value[part] !== 'object') value[part] = {};
    value = value[part];
  }
  value[parts[parts.length - 1]] = 'PASS';
}

function completeProof() {
  const proof = {};
  for (const requirement of Object.values(CANDIDATE_ROUTE_PROOF_REQUIREMENTS)) {
    for (const locator of [...requirement.a, ...requirement.b, ...requirement.cross]) {
      setPass(proof, locator);
    }
  }
  return proof;
}

function buildCiCoverage(proof = completeProof()) {
  return buildCandidateSignedTenantRouteCoverage({
    proof,
    manifest,
    inventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    evidenceMode: 'postgresql18_ci',
    databaseName: 'opscore_http_acceptance',
    sourceCommitHint: 'a'.repeat(40),
    pipelineId: '44509999123',
    testedAt: '2026-11-19T00:00:00.000Z'
  });
}

test('the signed-tenant proof matrix maps every one of the 67 manifest routes exactly once', () => {
  const keys = Object.keys(CANDIDATE_ROUTE_PROOF_REQUIREMENTS);
  const manifestKeys = manifest.routes.map(route => route.method + ' ' + route.path);
  assert.equal(keys.length, 67);
  assert.equal(manifest.routeCount, 67);
  assert.equal(manifest.routes.length, 67);
  assert.equal(new Set(keys).size, 67);
  assert.deepEqual(new Set(keys), new Set(manifestKeys));
});

test('complete two-tenant session, transaction, GUC-tamper, and cross-tenant proofs yield CI-only 67/67 evidence', () => {
  const coverage = buildCiCoverage();

  assert.equal(coverage.schemaVersion, 'opscore.signed-tenant-context-ci-route-coverage.v1');
  assert.equal(coverage.evidenceClass, 'DISPOSABLE_POSTGRESQL_18_CI_ROUTE_PROBES');
  assert.equal(coverage.environment, 'ci');
  assert.equal(coverage.status, 'PASS');
  assert.equal(coverage.databaseName, 'opscore_http_acceptance');
  assert.equal(coverage.expectedRouteCount, 67);
  assert.equal(coverage.coveredRouteCount, 67);
  assert.equal(coverage.failedRouteCount, 0);
  assert.equal(coverage.manifestComplete, true);
  assert.equal(coverage.runtimeRole, 'opscore_runtime');
  assert.equal(coverage.productionCertification, false);
  assert.equal(coverage.productionPromotionPerformed, false);
  assert.equal(coverage.parentBranchId, null);
  assert.equal(coverage.deploymentId, null);
  assert.equal(coverage.sourceCommitHint, 'a'.repeat(40));
  assert.equal(coverage.pipelineId, '44509999123');
  assert.equal(coverage.routes.length, 67);
  assert.ok(coverage.routes.every(route => route.status === 'PASS'
    && route.signedContextBound === true
    && route.sessionBound === true
    && route.transactionBound === true
    && route.rawGucTamperDenied === true));
});

test('one missing cross-tenant denial proof fails the entire CI route matrix closed', () => {
  const proof = completeProof();
  const firstRoute = manifest.routes[0];
  const requirement = CANDIDATE_ROUTE_PROOF_REQUIREMENTS[firstRoute.method + ' ' + firstRoute.path];
  const locator = requirement.cross[0];
  const parts = locator.split('.');
  let value = proof;
  for (const part of parts.slice(0, -1)) value = value[part];
  value[parts[parts.length - 1]] = 'FAIL';

  const coverage = buildCiCoverage(proof);
  assert.equal(coverage.status, 'NOT_VERIFIED');
  assert.equal(coverage.coveredRouteCount, 66);
  assert.equal(coverage.failedRouteCount, 1);
  const failed = coverage.routes.find(route => route.method === firstRoute.method && route.path === firstRoute.path);
  assert.equal(failed.status, 'NOT_VERIFIED');
  assert.ok(failed.unresolvedReasons.includes(
    firstRoute.operation === 'read' ? 'CROSS_TENANT_READ_DENIAL_PROOF_MISSING' : 'CROSS_TENANT_WRITE_DENIAL_PROOF_MISSING'
  ));
});

test('CI coverage cannot be represented as live Production route evidence', () => {
  const coverage = buildCiCoverage();
  assert.notEqual(coverage.schemaVersion, 'opscore.signed-tenant-context-production-coverage.v1');
  assert.notEqual(coverage.evidenceClass, 'LIVE_PRODUCTION_CANDIDATE_ROUTE_PROBES');
  assert.notEqual(coverage.environment, 'production');
  assert.equal(coverage.productionCertification, false);
  assert.equal(coverage.productionPromotionPerformed, false);
  assert.equal(coverage.deploymentId, null);
  assert.equal(coverage.parentBranchId, null);
});
