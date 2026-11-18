'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROUTE_EVIDENCE,
  buildSignedTenantContextProductionCoverage
} = require('../scripts/build-signed-tenant-context-production-coverage');

const ROOT = path.join(__dirname, '..');
const manifestBytes = fs.readFileSync(path.join(ROOT, 'docs/verification/SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json'));
const inventoryBytes = fs.readFileSync(path.join(ROOT, 'docs/API_INVENTORY.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const inventory = JSON.parse(inventoryBytes.toString('utf8'));
const COMMIT = 'a'.repeat(40);
const PIPELINE = '123456789';
const DEPLOYMENT = 'dpl_CandidateFixture123';
const BRANCH = 'br-proud-salad-bcshhdap';

function syntheticCompleteRouteEvidenceMap() {
  const result = new Map(ROUTE_EVIDENCE);
  let sequence = 0;
  for (const route of manifest.routes) {
    const key = route.method.toUpperCase() + ' ' + route.path;
    const existing = result.get(key) || {};
    sequence += 1;
    result.set(key, {
      ...existing,
      a: existing.a || { bucket: 'signedAuthenticatedSessionRoutes', key: 'syntheticTenantA' + sequence },
      b: existing.b || { bucket: 'signedAuthenticatedSessionRoutes', key: 'syntheticTenantB' + sequence },
      crossRead: route.operation === 'read'
        ? (existing.crossRead || [{ bucket: 'signedAuthenticatedSessionRoutes', key: 'syntheticCrossRead' + sequence }])
        : existing.crossRead,
      crossWrite: route.operation === 'write'
        ? (existing.crossWrite || [{ bucket: 'signedAuthenticatedSessionRoutes', key: 'syntheticCrossWrite' + sequence }])
        : existing.crossWrite
    });
  }
  return result;
}

function makeCandidate(routeEvidenceMap = ROUTE_EVIDENCE) {
  const checks = {
    tenantAHttpSession: 'PASS',
    tenantBHttpSession: 'PASS',
    rawGucTampering: 'PASS_CANDIDATE_HTTP_ROUTE_PROBES',
    workOrdersRawGucTamperingIgnored: 'PASS_CANDIDATE_HTTP_ROUTE_PROBES',
    signedAuthenticatedSessionRoutes: {},
    signedWorkOrderWrites: {},
    signedEvidenceWrites: {},
    signedWorkOrderSubresourceReads: {},
    candidateRouteObservations: manifest.routes.map(route => ({
      method: route.method,
      path: route.path,
      operation: route.operation,
      tenantA: { requests: 1, signed: 1, tamperApplied: 1, successful: 1 },
      tenantB: { requests: 1, signed: 1, tamperApplied: 1, successful: 1 }
    }))
  };

  for (const spec of routeEvidenceMap.values()) {
    for (const assertion of [spec.a, spec.b, ...(spec.crossRead || []), ...(spec.crossWrite || [])]) {
      if (!assertion) continue;
      const target = assertion.bucket === 'checks'
        ? checks
        : checks[assertion.bucket];
      target[assertion.key] = 'PASS';
    }
  }

  return {
    schemaVersion: 'opscore.signed-tenant-context-ci-proof.v1',
    status: 'PASS',
    checks,
    cleanup: {
      status: 'PASS',
      residue: {
        organizations: 0, users: 0, sessions: 0, memberships: 0,
        workOrders: 0, customers: 0, sites: 0, assets: 0,
        serviceLines: 0, appointments: 0, geofences: 0,
        technicianProfiles: 0, technicianSkills: 0,
        evidenceUploads: 0, evidenceUploadChunks: 0, attachments: 0,
        comments: 0, idempotencyRecords: 0, auditLog: 0
      }
    },
    candidateRuntimeIdentity: {
      deploymentId: DEPLOYMENT,
      sourceCommit: COMMIT,
      pipelineId: PIPELINE,
      sourceRef: 'main',
      environment: 'production',
      databaseName: 'opscore_acceptance',
      sessionUser: 'opscore_runtime',
      currentUser: 'opscore_runtime',
      runtimeRole: { bypass_rls: false },
      readOnlyInspection: true,
      writeOperations: 0,
      holdActive: true,
      releaseVerified: false,
      releaseProofVerified: false
    }
  };
}

function build(candidate, options = {}) {
  return buildSignedTenantContextProductionCoverage({
    candidate,
    manifest,
    inventory,
    manifestBytes,
    inventoryBytes,
    parentBranchId: BRANCH,
    expectedParentBranchId: BRANCH,
    expectedCommit: COMMIT,
    expectedPipelineId: PIPELINE,
    expectedDeploymentId: DEPLOYMENT,
    databaseName: 'opscore_acceptance',
    testedAt: '2026-11-18T00:00:00.000Z',
    ...options
  });
}

test('route evidence map defines every approved manifest row exactly once', () => {
  assert.equal(manifest.routes.length, 67);
  assert.equal(ROUTE_EVIDENCE.size, 67);
  for (const route of manifest.routes) {
    const key = route.method.toUpperCase() + ' ' + route.path;
    assert.ok(ROUTE_EVIDENCE.has(key), 'missing explicit route evidence mapping: ' + key);
  }
  for (const key of ROUTE_EVIDENCE.keys()) {
    assert.ok(manifest.routes.some(route =>
      route.method.toUpperCase() + ' ' + route.path === key
    ), 'route evidence mapping must not include non-manifest paths: ' + key);
  }
});

test('all-green synthetic candidate fixture builds 67 fully bound rows with exact route and identity pins', () => {
  const routeEvidenceMap = syntheticCompleteRouteEvidenceMap();
  const evidence = build(makeCandidate(routeEvidenceMap), { routeEvidenceMap });
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.expectedRouteCount, 67);
  assert.equal(evidence.coveredRouteCount, 67);
  assert.equal(evidence.failedRouteCount, 0);
  assert.equal(evidence.routes.length, 67);
  assert.equal(evidence.sourceCommitHint, COMMIT);
  assert.equal(evidence.pipelineId, PIPELINE);
  assert.equal(evidence.parentBranchId, BRANCH);
  assert.equal(evidence.deploymentId, DEPLOYMENT);
  assert.equal(evidence.evidenceRebind, null);
  assert.ok(evidence.routes.every(route =>
    route.status === 'PASS'
      && route.signedContextBound === true
      && route.sessionBound === true
      && route.transactionBound === true
      && route.rawGucTamperDenied === true
  ));
});

test('a missing negative cross-tenant proof keeps only the affected route unverified', () => {
  const routeEvidenceMap = syntheticCompleteRouteEvidenceMap();
  const candidate = makeCandidate(routeEvidenceMap);
  delete candidate.checks.signedAuthenticatedSessionRoutes.customersCrossTenantUpdateDenied;
  const evidence = build(candidate, { routeEvidenceMap });
  const target = evidence.routes.find(route =>
    route.method === 'PATCH' && route.path === '/api/v1/customers/{id}'
  );
  const sibling = evidence.routes.find(route =>
    route.method === 'POST' && route.path === '/api/v1/customers'
  );
  assert.equal(target.status, 'NOT_VERIFIED');
  assert.equal(target.crossTenantWriteDenied, false);
  assert.equal(sibling.status, 'PASS');
  assert.equal(evidence.status, 'NOT_VERIFIED');
});

test('a missing tenant B successful signed request blocks only that exact route', () => {
  const routeEvidenceMap = syntheticCompleteRouteEvidenceMap();
  const candidate = makeCandidate(routeEvidenceMap);
  const row = candidate.checks.candidateRouteObservations.find(route =>
    route.method === 'GET' && route.path === '/api/v1/customers'
  );
  row.tenantB.successful = 0;
  const evidence = build(candidate, { routeEvidenceMap });
  const target = evidence.routes.find(route =>
    route.method === 'GET' && route.path === '/api/v1/customers'
  );
  assert.equal(target.tenantARead, true);
  assert.equal(target.tenantBRead, false);
  assert.equal(target.status, 'NOT_VERIFIED');
});

test('duplicate or foreign observations cannot certify the 67-route manifest', () => {
  const routeEvidenceMap = syntheticCompleteRouteEvidenceMap();
  const candidate = makeCandidate(routeEvidenceMap);
  candidate.checks.candidateRouteObservations[1] = {
    ...candidate.checks.candidateRouteObservations[0]
  };
  const evidence = build(candidate, { routeEvidenceMap });
  assert.equal(evidence.status, 'NOT_VERIFIED');
  assert.equal(evidence.summary.observationKeysUnique, false);
  assert.equal(evidence.summary.routesNotVerified.length > 0, true);
});

test('non-zero fixture residue is rejected before any coverage matrix is built', () => {
  const candidate = makeCandidate();
  candidate.cleanup.residue.auditLog = 1;
  assert.throws(() => build(candidate), /CANDIDATE_RESULT_NOT_CLEAN_PASS/);
});

test('wrong commit, pipeline, candidate deployment or Neon branch prevents PASS', () => {
  const routeEvidenceMap = syntheticCompleteRouteEvidenceMap();
  const candidate = makeCandidate(routeEvidenceMap);
  assert.equal(build(candidate, { routeEvidenceMap, expectedCommit: 'b'.repeat(40) }).status, 'NOT_VERIFIED');
  assert.equal(build(candidate, { routeEvidenceMap, expectedPipelineId: '987654321' }).status, 'NOT_VERIFIED');
  assert.equal(build(candidate, { routeEvidenceMap, expectedDeploymentId: 'dpl_Different123' }).status, 'NOT_VERIFIED');
  assert.equal(build(candidate, { routeEvidenceMap, parentBranchId: 'br-another-branch' }).status, 'NOT_VERIFIED');
});

test('manifest bytes must bind to exact current API inventory', () => {
  const changedManifest = { ...manifest, routeInventorySha256: '0'.repeat(64) };
  const evidence = buildSignedTenantContextProductionCoverage({
    candidate: makeCandidate(),
    manifest: changedManifest,
    inventory,
    manifestBytes: Buffer.from(JSON.stringify(changedManifest)),
    inventoryBytes,
    parentBranchId: BRANCH,
    expectedParentBranchId: BRANCH,
    expectedCommit: COMMIT,
    expectedPipelineId: PIPELINE,
    expectedDeploymentId: DEPLOYMENT,
    databaseName: 'opscore_acceptance'
  });
  assert.equal(evidence.status, 'NOT_VERIFIED');
  assert.equal(evidence.summary.manifestBound, false);
});
