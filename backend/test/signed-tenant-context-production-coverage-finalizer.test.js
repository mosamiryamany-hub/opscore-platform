'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CANDIDATE_ROUTE_PROOF_REQUIREMENTS,
  buildCandidateSignedTenantRouteCoverage
} = require('../scripts/signed-tenant-context-postgres-gate');
const {
  buildFinalProductionCoverage,
  writeAndVerifyCoverage
} = require('../scripts/finalize-signed-tenant-context-production-coverage');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'API_INVENTORY.json');
const COMMIT = 'a'.repeat(40);
const PIPELINE = '123456789';
const BRANCH_ID = 'br-proud-salad-bcshhdap';
const DEPLOYMENT_ID = 'dpl_CandidateIdentity123';
const DATABASE = 'opscore_acceptance';
const TESTED_AT = '2026-11-18T13:00:00.000Z';

function setPath(target, locator) {
  const parts = String(locator).split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = 'PASS';
}

function fixture() {
  const manifestBytes = fs.readFileSync(MANIFEST_PATH);
  const inventoryBytes = fs.readFileSync(INVENTORY_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));

  const proof = { session: {}, read: {}, write: {}, evidence: {}, checks: {} };
  for (const requirements of Object.values(CANDIDATE_ROUTE_PROOF_REQUIREMENTS)) {
    for (const locator of [...requirements.a, ...requirements.b, ...requirements.cross]) {
      setPath(proof, locator);
    }
  }

  const checks = {
    ...proof.checks,
    tenantAHttpSession: 'PASS',
    tenantBHttpSession: 'PASS',
    rawGucTampering: 'PASS_CANDIDATE_HTTP_ROUTE_PROBES',
    workOrdersRawGucTamperingIgnored: 'PASS_CANDIDATE_HTTP_ROUTE_PROBES',
    signedAuthenticatedSessionRoutes: proof.session,
    signedWorkOrderSubresourceReads: proof.read,
    signedWorkOrderWrites: proof.write,
    signedEvidenceWrites: proof.evidence
  };

  const candidateRuntimeIdentity = {
    deploymentId: DEPLOYMENT_ID,
    sourceCommit: COMMIT,
    pipelineId: PIPELINE,
    sourceRef: 'main',
    environment: 'production',
    databaseName: DATABASE,
    sessionUser: 'opscore_runtime',
    currentUser: 'opscore_runtime',
    runtimeRole: {
      role_name: 'opscore_runtime',
      role_exists: true,
      can_login: true,
      superuser: false,
      bypass_rls: false,
      create_role: false,
      create_db: false,
      elevated_role_membership: false
    },
    readOnlyInspection: true,
    writeOperations: 0,
    holdActive: true,
    releaseVerified: false,
    releaseProofVerified: false
  };

  const candidate = {
    schemaVersion: 'opscore.signed-tenant-context-ci-proof.v1',
    status: 'PASS',
    checks,
    cleanup: {
      status: 'PASS',
      residue: { organizations: 0, users: 0, sessions: 0, workOrders: 0, notifications: 0 }
    },
    candidateRuntimeIdentity
  };

  candidate.signedTenantRouteCoverage = buildCandidateSignedTenantRouteCoverage({
    proof,
    manifest,
    inventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    databaseName: DATABASE,
    parentBranchId: BRANCH_ID,
    deploymentId: DEPLOYMENT_ID,
    sourceCommitHint: COMMIT,
    pipelineId: PIPELINE,
    testedAt: TESTED_AT
  });

  return { candidate, manifest, inventory, manifestBytes, inventoryBytes };
}

function options(f) {
  return {
    candidate: f.candidate,
    manifest: f.manifest,
    inventory: f.inventory,
    manifestBytes: f.manifestBytes,
    inventoryBytes: f.inventoryBytes,
    expectedCommit: COMMIT,
    expectedPipelineId: PIPELINE,
    expectedParentBranchId: BRANCH_ID,
    expectedDeploymentId: DEPLOYMENT_ID,
    expectedDatabaseName: DATABASE
  };
}

test('finalizer accepts only the candidate collector’s exact 67-route matrix and preserves its deployment pin', () => {
  const f = fixture();
  assert.equal(f.manifest.routes.length, 67);
  assert.equal(Object.keys(CANDIDATE_ROUTE_PROOF_REQUIREMENTS).length, 67);
  assert.equal(f.candidate.signedTenantRouteCoverage.status, 'PASS');

  const evidence = buildFinalProductionCoverage(options(f));
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.expectedRouteCount, 67);
  assert.equal(evidence.coveredRouteCount, 67);
  assert.equal(evidence.failedRouteCount, 0);
  assert.equal(evidence.routes.length, 67);
  assert.equal(evidence.deploymentId, DEPLOYMENT_ID);
  assert.equal(evidence.sourceCommitHint, COMMIT);
  assert.equal(evidence.pipelineId, PIPELINE);
  assert.equal(evidence.parentBranchId, BRANCH_ID);
  assert.equal(evidence.evidenceRebind, null);
});

test('finalizer rejects a changed route row even if the candidate-level status still says PASS', () => {
  const f = fixture();
  const evidenceRoutes = f.candidate.signedTenantRouteCoverage.routes;
  evidenceRoutes[0].rawGucTamperDenied = false;
  assert.throws(() => buildFinalProductionCoverage(options(f)),
    /CANDIDATE_MATRIX_DOES_NOT_MATCH_REBUILT_ROUTE_PROOFS/);
});

test('finalizer rejects a missing source proof key instead of trusting the copied matrix', () => {
  const f = fixture();
  const first = Object.values(CANDIDATE_ROUTE_PROOF_REQUIREMENTS)[0];
  const locator = first.a[0];
  const parts = locator.split('.');
  let bucket = f.candidate.checks;
  const target = parts[0] === 'session' ? 'signedAuthenticatedSessionRoutes'
    : parts[0] === 'read' ? 'signedWorkOrderSubresourceReads'
      : parts[0] === 'write' ? 'signedWorkOrderWrites'
        : parts[0] === 'evidence' ? 'signedEvidenceWrites' : null;
  assert.ok(target);
  bucket = bucket[target];
  delete bucket[parts[1]];
  assert.throws(() => buildFinalProductionCoverage(options(f)),
    /CANDIDATE_MATRIX_DOES_NOT_MATCH_REBUILT_ROUTE_PROOFS/);
});

test('finalizer rejects non-zero fixture residue and a different deployment ID', () => {
  const f = fixture();
  f.candidate.cleanup.residue.sessions = 1;
  assert.throws(() => buildFinalProductionCoverage(options(f)), /CANDIDATE_FIXTURE_CLEANUP_NOT_ZERO/);

  const clean = fixture();
  assert.throws(() => buildFinalProductionCoverage({
    ...options(clean),
    expectedDeploymentId: 'dpl_DifferentCandidate123'
  }), /CANDIDATE_RUNTIME_IDENTITY_NOT_EXACT/);
});

test('finalizer writes only after the production release-proof reader accepts all exact bindings', () => {
  const f = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-tenant-route-finalize-'));
  const outputPath = path.join(directory, 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json');
  try {
    const result = writeAndVerifyCoverage({
      candidate: f.candidate,
      outputPath,
      expectedCommit: COMMIT,
      expectedPipelineId: PIPELINE,
      expectedParentBranchId: BRANCH_ID,
      expectedDeploymentId: DEPLOYMENT_ID,
      expectedDatabaseName: DATABASE,
      manifestPath: MANIFEST_PATH,
      inventoryPath: INVENTORY_PATH
    });
    assert.equal(result.status, 'PASS');
    assert.equal(result.testedRoutes, 67);
    assert.equal(result.coveredRouteCount, 67);
    assert.equal(result.failedRouteCount, 0);
    const persisted = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(persisted.deploymentId, DEPLOYMENT_ID);
    assert.equal(persisted.sourceCommitHint, COMMIT);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
