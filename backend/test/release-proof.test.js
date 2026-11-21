'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const apiRouteAcceptancePolicy = require('../src/production-api-route-acceptance-policy');
const {
  createPublicReleaseProof,
  hasVerifiedProductionRelease,
  readProductionAcceptanceEvidence,
  readProductionSessionIsolationEvidence,
  readProductionRecoveryPointEvidence,
  readProductionSignedTenantRouteCoverageEvidence,
  readReleaseArchiveAttestation
} = require('../src/release-proof');

const SHA = 'bbbee88e34a9b7e1847571367904fa96a3166bcc';
const SHA256_COMMIT = '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1';
const PACKAGE_SHA = 'a'.repeat(64);
const EVIDENCE_SHA = 'b'.repeat(64);
const fixedNow = () => new Date('2026-10-23T00:00:00.000Z');

function fullDataRecoveryIntegrity(tableCount = 136) {
  const digest = 'f'.repeat(64);
  const requiredTables = ['organizations','users','memberships','sessions','assets','sites','work_orders','customers'];
  return {
    status: 'PASS',
    algorithm: 'SHA-256',
    tableCountCompared: tableCount,
    catalogTableCount: 136,
    rowsCompared: tableCount,
    mismatchCount: 0,
    rlsExceptionTables: ['spatial_ref_sys'],
    rlsPolicyTableCount: 135,
    rlsPolicyMismatchCount: 0,
    forceRlsMismatchCount: 0,
    sourceManifestSha256: digest,
    recoveryManifestSha256: digest,
    tableResults: Array.from({ length: tableCount }, (_, index) => ({
      schema: 'public',
      table: requiredTables[index] || 'table_' + index,
      status: 'PASS',
      sourceSha256: digest,
      recoverySha256: digest,
      sourceRowCount: 1,
      recoveryRowCount: 1
    }))
  };
}

function productionAcceptanceEvidence(commit = SHA, pipelineId = '2978538209', overrides = {}) {
  return {
    schemaVersion: 'opscore.production-acceptance.v2',
    status: 'PASS',
    environment: 'production',
    databaseEngine: 'postgres',
    sourceCommit: commit,
    pipelineId,
    testedAt: '2026-10-23T00:00:00.000Z',
    checks: {
      migrationLedgerParity: 'PASS',
      tenantSessionIsolation: 'PASS_TEST_SCOPE',
      crossTenantAccessDenied: 'PASS_TEST_SCOPE',
      recoveryRestore: 'PASS_TEST_SCOPE',
      backupIntegrity: 'PASS_TEST_SCOPE',
      productionNeonPitr: 'NOT_VERIFIED'
    },
    evidenceScopes: {
      productionDatabase: 'LIVE_READ_ONLY',
      tenantIsolation: 'DISPOSABLE_POSTGRESQL_18_CI',
      tenantRouteSecurityCoverage: 'DISPOSABLE_POSTGRESQL_18_CI',
      apiRouteCoverage: 'NOT_VERIFIED_FUNCTIONAL_ACCEPTANCE_NOT_RUN',
      recoveryRestore: 'DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI',
      productionNeonPitr: 'NOT_VERIFIED'
    },
    productionIsolationCertification: false,
    productionRecovery: {
      logicalRestoreTestScope: 'PASS_TEST_SCOPE',
      neonPointInTimeRestore: 'NOT_VERIFIED'
    },
    migrationLedger: {
      status: 'PASS',
      databaseName: 'opscore_acceptance',
      databaseIdentityMatch: true,
      sourceMigrationCount: 60,
      ledgerRowCount: 60,
      matchedCount: 60,
      pendingCount: 0,
      blockerCount: 0
    },
    tenantMatrixEvidenceSha256: 'c'.repeat(64),
    recoveryDrillEvidenceSha256: 'd'.repeat(64),
    tenantTableCoverage: { status: 'PASS', totalTables: 17, testedTables: 17 },
    tenantRouteSecurityCoverage: {
      status: 'PASS_TEST_SCOPE',
      scope: 'UNAUTHENTICATED_DENIAL_FOREIGN_ID_DENIAL_AND_CROSS_TENANT_FIXTURES_ONLY',
      tenantDataRoutes: 12,
      unauthenticatedChecks: 12,
      foreignIdRoutes: 8,
      foreignIdChecks: 8,
      crossTenantFixtureChecks: 5,
      functionalRouteAcceptance: 'NOT_VERIFIED'
    },
    apiRouteCoverage: {
      status: 'NOT_VERIFIED',
      totalRoutes: 358,
      testedRoutes: 0,
      reason: 'FUNCTIONAL_ROUTE_ACCEPTANCE_NOT_RUN'
    },
    runtimeRole: {
      name: 'opscore_runtime',
      login: true,
      superuser: false,
      bypassRls: false,
      createRole: false,
      createDatabase: false,
      elevatedMembershipCount: 0,
      databaseName: 'opscore_acceptance'
    },
    ...overrides
  };
}

function writeJsonEvidence(dir, filename, value) {
  const filePath = path.join(dir, filename);
  const raw = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(filePath, raw);
  return {
    path: filePath,
    sha256: crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
  };
}

function postgresHttpEvidence(commit, pipelineId) {
  return {
    schemaVersion: 'opscore.postgres-http-acceptance.v1',
    status: 'PASS',
    generatedAt: '2026-10-23T00:00:00.000Z',
    commit,
    pipelineId: Number(pipelineId)
  };
}

function deploymentEnv(extra = {}) {
  return {
    VERCEL_GIT_COMMIT_SHA: SHA,
    VERCEL_GIT_COMMIT_REF: 'main',
    VERCEL_GIT_PROVIDER: 'github',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production',
    ...extra
  };
}

test('release proof binds source and CI evidence to the running deployment commit', () => {
  const proof = createPublicReleaseProof(deploymentEnv(), fixedNow);
  assert.equal(proof.sourceCommit, SHA);
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.value, null);
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('release proof rejects environment-only CI/package claims without embedded build identity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-acceptance-'));
  try {
    const evidence = writeJsonEvidence(dir, 'production-acceptance.json', productionAcceptanceEvidence(SHA, '2978538209'));
    const proof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: evidence.sha256
    }), fixedNow, undefined, evidence.path);
    assert.equal(proof.status, 'UNVERIFIED');
    assert.equal(proof.releaseTag, null);
    assert.equal(proof.sourceCommitIdentitySource, 'unverified');
    assert.equal(proof.ci.status, 'UNVERIFIED');
    assert.equal(proof.ci.pipelineId, null);
    assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
    assert.equal(proof.packageFingerprint.value, null);
    assert.equal(proof.productionAcceptance.status, 'NOT_VERIFIED');
    assert.equal(proof.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');
    assert.equal(proof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
    assert.equal(proof.gates.tenantRouteSecurityCoverage, 'NOT_VERIFIED');
    assert.equal(proof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED');
    assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
    assert.equal(proof.gates.mobileStoreArtifacts, 'REMAINING_BUYER');
    assert.equal(proof.gates.nativeTranslationReview, 'REMAINING_BUYER');
    assert.equal(proof.gates.licensedStreetMap, 'REMAINING_BUYER');
    assert.equal(proof.gates.commercialClosure, 'UNVERIFIED');
    assert.equal(proof.buyerResiduals.status, 'DISCLOSED');
    assert.equal(proof.buyerResiduals.count, 3);
    assert.deepEqual(proof.buyerResiduals.items.map(item => item.id), [
      'mobileStoreArtifacts', 'nativeTranslationReview', 'licensedStreetMap'
    ]);
    assert.match(proof.note, /REMAINING_BUYER/);
    assert.equal(proof.productionAcceptance.evidenceSha256, null);

    const mismatchedDatabase = writeJsonEvidence(dir, 'mismatched-database.json',
      productionAcceptanceEvidence(SHA, '2978538209', {
        migrationLedger: {
          ...productionAcceptanceEvidence().migrationLedger,
          databaseName: 'different_database',
          databaseIdentityMatch: false
        }
      })
    );
    const mismatchProof = readProductionAcceptanceEvidence({
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: mismatchedDatabase.sha256
    }, SHA, '2978538209', mismatchedDatabase.path, fixedNow);
    assert.equal(mismatchProof.status, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release proof ignores environment-only CI and package assertions for a SHA-256 source commit', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    VERCEL_GIT_COMMIT_SHA: SHA256_COMMIT,
    OPSC_RELEASE_CI_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_CI_PIPELINE_ID: '2984327380',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA
  }), fixedNow);
  assert.equal(proof.sourceCommit, SHA256_COMMIT);
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.ci.pipelineId, null);
  assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.sourceCommit, null);
  assert.equal(proof.sourceCommitIdentitySource, 'unverified');
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('release proof does not trust environment-only CLI provenance without embedded build identity', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'github-actions-cli',
    OPSC_RELEASE_CI_REF: 'main',
    VERCEL_GIT_COMMIT_SHA: SHA,
    OPSC_RELEASE_CI_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_CI_PIPELINE_ID: '2986455669',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA
  }), fixedNow);
  assert.equal(proof.sourceCommit, SHA,'native Vercel Git metadata may identify the source, but environment-only CLI values must not override it');
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.sourceCommitIdentitySource, 'unverified');
  assert.equal(proof.deployment.ref, 'main');
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
});

test('release tag is not trusted from environment without embedded build identity', () => {
  const proof = createPublicReleaseProof(deploymentEnv({ OPSC_RELEASE_TAG: 'v0.11.62-test' }), fixedNow);
  assert.equal(proof.releaseTag, null);
});

test('release proof rejects a forged evidence digest and incomplete tenant coverage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-acceptance-negative-'));
  try {
    const valid = productionAcceptanceEvidence(SHA, '2978538209');
    const validFile = writeJsonEvidence(dir, 'valid.json', valid);
    const forged = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: 'f'.repeat(64)
    }), fixedNow, undefined, validFile.path);
    assert.equal(forged.productionAcceptance.status, 'NOT_VERIFIED');
    assert.equal(forged.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');

    const incomplete = writeJsonEvidence(dir, 'incomplete.json', productionAcceptanceEvidence(SHA, '2978538209', {
      tenantTableCoverage: { status: 'PASS', totalTables: 17, testedTables: 16 }
    }));
    const incompleteProof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: incomplete.sha256
    }), fixedNow, undefined, incomplete.path);
    assert.equal(incompleteProof.productionAcceptance.status, 'NOT_VERIFIED');
    assert.equal(incompleteProof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release proof does not grant PASS_PRODUCTION from timestamps alone without evidence SHA-256', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
    OPSC_PRODUCTION_ACCEPTANCE_COMMIT: SHA,
    OPSC_PRODUCTION_ACCEPTANCE_AT: '2026-10-23T00:00:00.000Z'
  }), fixedNow);
  assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.value, null);
  assert.equal(proof.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
  assert.equal(proof.productionAcceptance.status, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('production behavioral evidence must carry the exact release commit hint', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-behavioral-binding-'));
  const sessionPath = path.join(dir, 'session.json');
  const recoveryPath = path.join(dir, 'recovery.json');
  const env = {
    OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true',
    VERCEL_DEPLOYMENT_ID: 'dpl_ProductionFixture123',
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-current-production',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance'
  };
  const session = {
    schemaVersion: 'opscore.production-session-isolation.v3',
    status: 'PASS',
    testedAt: '2026-10-23T00:00:00.000Z',
    sourceCommitHint: SHA,
    deploymentId: 'dpl_ProductionFixture123',
    pipelineId: '2978538209',
    databaseName: 'opscore_acceptance',
    verificationScope: 'dual-tenant-http-asset-create-read-event-write-denial-and-cleanup',
    parentBranchId: 'br-current-production',
    checks: {
      dualLogin: 'PASS',
      tenantPrincipalBinding: 'PASS',
      ownAssetCreate: 'PASS',
      ownAssetRead: 'PASS',
      tenantListIsolation: 'PASS',
      crossTenantAssetReadDenied: 'PASS',
      ownAssetEventWrite: 'PASS',
      crossTenantWriteDenied: 'PASS',
      unauthenticatedDenied: 'PASS',
      cleanupComplete: 'PASS'
    }
  };
  const recovery = {
    schemaVersion: 'opscore.production-recovery-point.v4',
    status: 'PASS',
    testedAt: '2026-10-23T00:00:00.000Z',
    sourceCommitHint: SHA,
    deploymentId: 'dpl_ProductionFixture123',
    pipelineId: '2978538209',
    parentBranchId: 'br-current-production',
    databaseName: 'opscore_acceptance',
    verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
    referenceBranchId: 'br-test-reference',
    recoveryBranchId: 'br-test-recovery',
    tableCountCompared: 134,
    mismatchCount: 0,
    coreTenantTableRowCountsMatch: true,
    contentIntegrity: fullDataRecoveryIntegrity(134),
    temporaryBranch: true,
    cleanup: { status: 'PASS', referenceBranchDeleted: true, recoveryBranchDeleted: true }
  };
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(session));
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'PASS');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'PASS');

    const legacyRowCountOnly = {
      ...recovery,
      schemaVersion: 'opscore.production-recovery-point.v3',
      verificationScope: 'branch-clone-public-table-count-and-core-tenant-row-counts-only'
    };
    delete legacyRowCountOnly.contentIntegrity;
    fs.writeFileSync(recoveryPath, JSON.stringify(legacyRowCountOnly));
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED',
      'legacy row-count-only evidence cannot satisfy full-data recovery scope');

    const mismatchedContent = {
      ...recovery,
      contentIntegrity: {
        ...recovery.contentIntegrity,
        tableResults: recovery.contentIntegrity.tableResults.map((row, index) => index === 0
          ? { ...row, recoverySha256: '0'.repeat(64) }
          : row)
      }
    };
    fs.writeFileSync(recoveryPath, JSON.stringify(mismatchedContent));
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED',
      'a per-table content hash mismatch must fail closed');

    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));
    fs.writeFileSync(recoveryPath, JSON.stringify({
      ...recovery,
      cleanup: { status: 'FAIL', referenceBranchDeleted: true, recoveryBranchDeleted: false }
    }));
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));

    assert.equal(readProductionSessionIsolationEvidence(sessionPath, {
      ...env, VERCEL_DEPLOYMENT_ID: 'dpl-other-deployment'
    }).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, {
      ...env, VERCEL_DEPLOYMENT_ID: 'dpl-other-deployment'
    }).status, 'NOT_VERIFIED');
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, {
      ...env, OPSC_PRODUCTION_DATABASE_NAME: 'wrong_database'
    }).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, {
      ...env, OPSC_PRODUCTION_DATABASE_NAME: 'wrong_database'
    }).status, 'NOT_VERIFIED');
    fs.writeFileSync(sessionPath, JSON.stringify({ ...session, schemaVersion: 'opscore.production-session-isolation.v1' }));
    fs.writeFileSync(recoveryPath, JSON.stringify({ ...recovery, schemaVersion: 'opscore.production-recovery-point.v1' }));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');
    fs.writeFileSync(sessionPath, JSON.stringify(session));
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));




    assert.equal(readProductionSessionIsolationEvidence(sessionPath, {
      ...env, OPSC_PRODUCTION_NEON_BRANCH_ID: ''
    }).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, {
      ...env, OPSC_PRODUCTION_NEON_BRANCH_ID: ''
    }).status, 'NOT_VERIFIED');
    fs.writeFileSync(sessionPath, JSON.stringify({ ...session, parentBranchId: 'br-stale-production' }));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
    fs.writeFileSync(sessionPath, JSON.stringify(session));
    fs.writeFileSync(recoveryPath, JSON.stringify({ ...recovery, parentBranchId: 'br-stale-production' }));
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));

    fs.writeFileSync(sessionPath, JSON.stringify({ ...session, sourceCommitHint: '0'.repeat(40) }));
    fs.writeFileSync(recoveryPath, JSON.stringify({ ...recovery, sourceCommitHint: '0'.repeat(40) }));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');

    fs.writeFileSync(sessionPath, JSON.stringify({ ...session, sourceCommitHint: undefined }));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('production behavioral evidence rejects any evidence rebind marker', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-evidence-rebind-'));
  const sessionPath = path.join(dir, 'session.json');
  const recoveryPath = path.join(dir, 'recovery.json');
  const env = {
    OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true',
    VERCEL_DEPLOYMENT_ID: 'dpl_ProductionFixture123',
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-current-production',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance'
  };
  const session = {
    schemaVersion: 'opscore.production-session-isolation.v3',
    status: 'PASS',
    testedAt: '2026-10-23T00:00:00.000Z',
    sourceCommitHint: SHA,
    deploymentId: 'dpl_ProductionFixture123',
    pipelineId: '2978538209',
    databaseName: 'opscore_acceptance',
    verificationScope: 'dual-tenant-http-asset-create-read-event-write-denial-and-cleanup',
    parentBranchId: 'br-current-production',
    checks: {
      dualLogin: 'PASS',
      tenantPrincipalBinding: 'PASS',
      ownAssetCreate: 'PASS',
      ownAssetRead: 'PASS',
      tenantListIsolation: 'PASS',
      crossTenantAssetReadDenied: 'PASS',
      ownAssetEventWrite: 'PASS',
      crossTenantWriteDenied: 'PASS',
      unauthenticatedDenied: 'PASS',
      cleanupComplete: 'PASS'
    },
    evidenceRebind: {
      kind: 'schema_compatible_candidate_rebind',
      fromCommit: '0'.repeat(40),
      toCommit: SHA,
      probesReexecuted: false
    }
  };
  const recovery = {
    schemaVersion: 'opscore.production-recovery-point.v4',
    status: 'PASS',
    testedAt: '2026-10-23T00:00:00.000Z',
    sourceCommitHint: SHA,
    deploymentId: 'dpl_ProductionFixture123',
    pipelineId: '2978538209',
    parentBranchId: 'br-current-production',
    databaseName: 'opscore_acceptance',
    verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
    referenceBranchId: 'br-test-reference',
    recoveryBranchId: 'br-test-recovery',
    tableCountCompared: 134,
    mismatchCount: 0,
    coreTenantTableRowCountsMatch: true,
    contentIntegrity: fullDataRecoveryIntegrity(134),
    temporaryBranch: true,
    cleanup: { status: 'PASS', referenceBranchDeleted: true, recoveryBranchDeleted: true },
    evidenceRebind: { ...session.evidenceRebind }
  };
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(session));
    fs.writeFileSync(recoveryPath, JSON.stringify(recovery));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');

    const executedSession = {
      ...session,
      evidenceRebind: { ...session.evidenceRebind, probesReexecuted: true }
    };
    const executedRecovery = {
      ...recovery,
      evidenceRebind: { ...recovery.evidenceRebind, probesReexecuted: true }
    };
    fs.writeFileSync(sessionPath, JSON.stringify(executedSession));
    fs.writeFileSync(recoveryPath, JSON.stringify(executedRecovery));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');

    const freshSession = { ...session };
    const freshRecovery = { ...recovery };
    delete freshSession.evidenceRebind;
    delete freshRecovery.evidenceRebind;
    fs.writeFileSync(sessionPath, JSON.stringify(freshSession));
    fs.writeFileSync(recoveryPath, JSON.stringify(freshRecovery));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'PASS');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'PASS');

    for (const malformedRebind of ['tampered', true, 1]) {
      fs.writeFileSync(sessionPath, JSON.stringify({ ...freshSession, evidenceRebind: malformedRebind }));
      fs.writeFileSync(recoveryPath, JSON.stringify({ ...freshRecovery, evidenceRebind: malformedRebind }));
      assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');
      assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');
    }

    fs.writeFileSync(sessionPath, JSON.stringify({
      ...executedSession,
      evidenceRebind: { ...executedSession.evidenceRebind, toCommit: '0'.repeat(40) }
    }));
    assert.equal(readProductionSessionIsolationEvidence(sessionPath, env).status, 'NOT_VERIFIED');

    assert.equal(readProductionSessionIsolationEvidence(sessionPath, {
      OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true'
    }).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, {
      OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true'
    }).status, 'NOT_VERIFIED');

    fs.writeFileSync(sessionPath, JSON.stringify(executedSession));
    fs.writeFileSync(recoveryPath, JSON.stringify({ ...executedRecovery, parentBranchId: 'br-old-production' }));
    assert.equal(readProductionRecoveryPointEvidence(recoveryPath, env).status, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release proof fails closed when CI, package, or production acceptance belongs to another commit', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_CI_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_RELEASE_PACKAGE_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
    OPSC_PRODUCTION_ACCEPTANCE_COMMIT: '0'.repeat(40),
    OPSC_PRODUCTION_ACCEPTANCE_AT: '2026-10-23T00:00:00.000Z'
  }), fixedNow);
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.value, null);
  assert.equal(proof.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
});

test('release HTML and route no longer contain an old hard-coded source commit or package fingerprint', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'web', 'verify', 'release.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'web', 'verify', 'release.json'), 'utf8');
  assert.doesNotMatch(html, /a3b242ded2faf533e4e7986e331b5ff23f26f97b|cb90978495b384e2d04ad680a09f1cb6ef9e1cfbdd6e58db21cb2811772ea3f1/);
  assert.doesNotMatch(server, /sourceCommit: 'e2f23d0ad1abf64e2b3876673a06a6692f61cf6c'|cb90978495b384e2d04ad680a09f1cb6ef9e1cfbdd6e58db21cb2811772ea3f1/);
  assert.match(server, /url\.pathname === '\/verify\/release\.json'/);
  assert.match(manifest, /authoritativeEndpoint/);
});


test('public release proof does not reuse a historical PostgreSQL HTTP PASS for a newer commit', () => {
  const evidencePath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json');
  let originalEvidence = null;
  try {
    originalEvidence = fs.readFileSync(evidencePath, 'utf8');
  } catch {
    originalEvidence = null;
  }

  // Isolate this proof contract from the preceding live acceptance test, which
  // writes its current PASS/FAIL result to the same evidence path during npm test.
  // This fixture must always represent an older successful candidate.
  const historicalEvidence = {
    schemaVersion: 'opscore.postgres-http-acceptance.v1',
    status: 'PASS',
    generatedAt: '2026-10-26T08:09:15.836Z',
    commit: '187f0cf939026032f1934b9d64f03747f17a1bfc89e268e096d9c2c60b260def',
    pipelineId: 2989308452
  };

  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify(historicalEvidence, null, 2) + '\n');
    const proof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: '345305843292b5773068eb98fa7f4f66ec3048921757e3399337a230b79ec317',
      OPSC_RELEASE_CI_PIPELINE_ID: '3014583826'
    }), fixedNow);
    assert.equal(proof.gates.postgresHttpAcceptance, 'NOT_VERIFIED');
    assert.equal(proof.postgresHttpAcceptance.historicalStatus, 'PASS');
    assert.equal(proof.postgresHttpAcceptance.currentCandidateMatch, false);
  } finally {
    if (originalEvidence === null) {
      try { fs.unlinkSync(evidencePath); } catch {}
    } else {
      fs.writeFileSync(evidencePath, originalEvidence);
    }
  }
});

test('embedded GitHub Actions identity gates production release only with signed same-run evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-vercel-identity-'));
  const identityPath = path.join(dir, 'identity.json');
  const pipelineId = '3014583826';
  const identity = {
    schemaVersion: 'opscore.vercel-release-identity.v1',
    deploymentSource: 'github-actions-cli',
    commitSha: SHA,
    pipelineId,
    runAttempt: 1,
    ref: 'main',
    repository: 'mosamiryamany-hub/opscore-platform',
    runUrl: `https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/${pipelineId}`,
    packageSha256: PACKAGE_SHA,
    packageCommit: SHA
  };
  const acceptance = writeJsonEvidence(dir, 'production-acceptance.json', productionAcceptanceEvidence(SHA, pipelineId));
  const postgresHttp = writeJsonEvidence(dir, 'postgres-http-acceptance.json', postgresHttpEvidence(SHA, pipelineId));
  const staleEnv = deploymentEnv({
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'cli',
    OPSC_RELEASE_CI_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '1',
    OPSC_RELEASE_CI_REF: 'old-branch',
    OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: acceptance.sha256,
    OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'
  });
  try {
    fs.writeFileSync(identityPath, JSON.stringify(identity));
    const proof = createPublicReleaseProof(staleEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path);
    assert.equal(proof.sourceCommit, SHA);
    assert.equal(proof.sourceCommitIdentitySource, 'github-actions-cli-assertion');
    assert.equal(proof.deployment.ref, 'main');
    assert.equal(proof.ci.status, 'PASS');
    assert.equal(proof.ci.pipelineUrl, identity.runUrl);
    assert.equal(proof.ci.runAttempt, 1);
    assert.equal(proof.packageFingerprint.status, 'PUBLISHED');
    assert.equal(proof.status, 'UNVERIFIED');
    assert.equal(proof.postgresHttpAcceptance.status, 'PASS');
    assert.equal(proof.productionAcceptance.status, 'PASS');
    assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
    assert.equal(proof.gates.neonPointInTimeRecovery, 'NOT_VERIFIED');
    assert.equal(hasVerifiedProductionRelease(staleEnv, identityPath, acceptance.path, postgresHttp.path), false);

    fs.writeFileSync(identityPath, JSON.stringify({ ...identity, commitSha: 'invalid' }));
    assert.equal(hasVerifiedProductionRelease(staleEnv, identityPath, acceptance.path, postgresHttp.path), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('isolated behavioral evidence cannot satisfy the production acceptance contract', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-behavioral-not-production-'));
  try {
    const behavioral = writeJsonEvidence(dir, 'PRODUCTION_ACCEPTANCE_BEHAVIORAL.json',
      productionAcceptanceEvidence(SHA, '2978538209', {
        // Every v1 acceptance field is populated and valid; the schema identity
        // is the only deliberately different field. This proves schema separation,
        // not merely rejection of an incomplete behavioral report.
        schemaVersion: 'opscore.production-acceptance-behavioral.v2',
        testedTarget: 'isolated disposable acceptance engine',
        productionHost: null,
        productionHostBehavioralStatus: 'REQUIRES_RETEST',
        productionCertification: false
      })
    );

    const result = readProductionAcceptanceEvidence({
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: behavioral.sha256
    }, SHA, '2978538209', behavioral.path, fixedNow);

    assert.equal(result.status, 'NOT_VERIFIED');
    assert.equal(result.evidenceSha256, null);
    assert.equal(result.sourceCommit, SHA);
    assert.equal(result.pipelineId, '2978538209');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('functionalApiRouteAcceptance flips to PASS_CONTRACT_SCOPE only with commit-and-pipeline-bound zero-failure evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-route-acceptance-gate-'));
  try {
    const identityPath = path.join(dir, 'identity.json');
    const pipelineId = '3014583826';
    const identity = {
      schemaVersion: 'opscore.vercel-release-identity.v1',
      deploymentSource: 'github-actions-cli',
      commitSha: SHA,
      pipelineId,
      runAttempt: 1,
      ref: 'main',
      repository: 'mosamiryamany-hub/opscore-platform',
      runUrl: `https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/${pipelineId}`,
      packageSha256: PACKAGE_SHA,
      packageCommit: SHA
    };
    const acceptance = writeJsonEvidence(dir, 'production-acceptance.json', productionAcceptanceEvidence(SHA, pipelineId));
    const postgresHttp = writeJsonEvidence(dir, 'postgres-http-acceptance.json', postgresHttpEvidence(SHA, pipelineId));
    const route = writeJsonEvidence(dir, 'api-route-acceptance.json', {
      schemaVersion: 'opscore.api-route-acceptance.v1', engine: 'sqlite', status: 'PASS', commitSha: SHA, pipelineId, testedRoutes: 358, inventoryRouteCount: 358, passed: 358, failed: 0
    });
    const env = deploymentEnv({
      OPSC_RELEASE_DEPLOYMENT_SOURCE: 'cli',
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: pipelineId,
      OPSC_RELEASE_CI_REF: 'main',
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: acceptance.sha256
    });
    fs.writeFileSync(identityPath, JSON.stringify(identity));
    const proof = createPublicReleaseProof(env, fixedNow, identityPath, acceptance.path, postgresHttp.path, route.path);
    assert.equal(proof.gates.functionalApiRouteAcceptance, 'PASS_CONTRACT_SCOPE');
    assert.equal(hasVerifiedProductionRelease(env, identityPath, acceptance.path, postgresHttp.path, route.path), false);

    const staleRoute = writeJsonEvidence(dir, 'stale-route.json', {
      schemaVersion: 'opscore.api-route-acceptance.v1', engine: 'sqlite', status: 'PASS', commitSha: '0'.repeat(40), pipelineId, testedRoutes: 358, inventoryRouteCount: 358, passed: 358, failed: 0
    });
    const staleProof = createPublicReleaseProof(env, fixedNow, identityPath, acceptance.path, postgresHttp.path, staleRoute.path);
    assert.equal(staleProof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED');
    assert.equal(hasVerifiedProductionRelease(env, identityPath, acceptance.path, postgresHttp.path, staleRoute.path), false);

    const incompleteRoute = writeJsonEvidence(dir, 'incomplete-route.json', {
      schemaVersion: 'opscore.api-route-acceptance.v1', engine: 'sqlite', status: 'PASS',
      commitSha: SHA, pipelineId, testedRoutes: 358, inventoryRouteCount: 359, passed: 358, failed: 0
    });
    const incompleteProof = createPublicReleaseProof(env, fixedNow, identityPath, acceptance.path, postgresHttp.path, incompleteRoute.path);
    assert.equal(incompleteProof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED', 'incomplete inventory evidence cannot pass');

    // A full Production route result requires exact PostgreSQL, database,
    // deployment, commit and pipeline binding plus zero-failure route and
    // business-flow inventories. This fixture validates only the proof contract;
    // it is not evidence that the current live deployment has passed it.
    const productionEnv = {
      ...env,
      OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance',
      OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-proud-salad-bcshhdap',
      OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_123456',
      VERCEL_DEPLOYMENT_ID: 'dpl_final654321'
    };
    const apiInventoryBytes = fs.readFileSync(path.join(__dirname, '..', 'docs', 'API_INVENTORY.json'));
    const apiInventory = JSON.parse(apiInventoryBytes.toString('utf8'));
    const routeTestedAt = fixedNow().toISOString();
    const routeResults = apiInventory.routes.map((route, index) => {
      const contract = apiRouteAcceptancePolicy.probeContractForRoute(route);
      const observation = {
        probeContract: contract.id,
        contentType: 'application/json; charset=utf-8',
        statusCode: contract.kind === 'public' ? 200 : contract.statusCodes[0],
        responseCode: contract.kind === 'public' ? null : (contract.responseCodes[0] || null),
        bodyAssertion: contract.id === 'logout-without-session-noop'
      };
      const verdict = apiRouteAcceptancePolicy.evaluateRouteObservation(
        route, observation, { statusCode: 404, responseCode: 'NOT_FOUND' }
      );
      return {
        method: route.method,
        route: route.route,
        path: apiRouteAcceptancePolicy.materializeRoutePath(route.route, SHA, index),
        auth: route.auth,
        ...observation,
        testedAt: routeTestedAt,
        verdict: verdict.ok ? 'PASS' : 'FAIL',
        reason: verdict.reason
      };
    });
    const businessFlowInventory = apiRouteAcceptancePolicy.BUSINESS_FLOW_INVENTORY;
    const productionRoute = writeJsonEvidence(dir, 'production-route-acceptance.json', {
      schemaVersion: 'opscore.api-route-acceptance.v2',
      engine: 'postgres',
      environment: 'production',
      verificationScope: 'PRODUCTION_POSTGRESQL_HTTP_FULL_ROUTE_AND_BUSINESS_FLOW_INVENTORY',
      status: 'PASS',
      commitSha: SHA,
      pipelineId,
      deploymentId: 'dpl_123456',
      databaseName: 'opscore_acceptance',
      databaseBranchId: 'br-proud-salad-bcshhdap',
      testedAt: routeTestedAt,
      inventorySha256: crypto.createHash('sha256').update(apiInventoryBytes).digest('hex'),
      testedRoutes: apiInventory.routes.length,
      inventoryRouteCount: apiInventory.routeCount,
      passed: routeResults.filter(row => row.verdict === 'PASS').length,
      failed: routeResults.filter(row => row.verdict !== 'PASS').length,
      unknownRouteProbe: {
        path: apiRouteAcceptancePolicy.buildUnknownRoutePath(SHA),
        statusCode: 404,
        responseCode: 'NOT_FOUND'
      },
      routes: routeResults,
      businessFlowCoverage: {
        status: 'PASS',
        testedFlows: businessFlowInventory.length,
        inventoryFlowCount: businessFlowInventory.length,
        passed: businessFlowInventory.length,
        failed: 0,
        businessFlowInventorySha256: apiRouteAcceptancePolicy.businessFlowInventorySha256(),
        flows: businessFlowInventory.map(flow => ({
          id: flow.id,
          status: 'PASS',
          routeKeys: flow.routeKeys,
          tenantAStatus: 'PASS',
          tenantBStatus: 'PASS',
          crossTenantDenialStatus: 'PASS',
          cleanupStatus: 'PASS',
          signedRouteEvidenceSha256: 'b'.repeat(64),
          candidateFixtureEvidenceSha256: 'c'.repeat(64),
          ...(flow.id === 'same-tenant-asset-event-lifecycle'
            ? { sessionIsolationEvidenceSha256: 'd'.repeat(64) }
            : {})
        }))
      }
    });
    const productionProof = createPublicReleaseProof(
      productionEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path, productionRoute.path
    );
    assert.equal(productionProof.gates.functionalApiRouteAcceptance, 'PASS_PRODUCTION_FUNCTIONAL_SCOPE');
    assert.equal(productionProof.gates.commercialClosure, 'UNVERIFIED',
      'route-scope evidence alone must not certify the complete release');

    const wrongDeployment = writeJsonEvidence(dir, 'wrong-deployment-route-acceptance.json', {
      ...JSON.parse(fs.readFileSync(productionRoute.path, 'utf8')),
      deploymentId: 'dpl_999999'
    });
    const wrongDeploymentProof = createPublicReleaseProof(
      productionEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path, wrongDeployment.path
    );
    assert.equal(wrongDeploymentProof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED',
      'evidence from another Production deployment cannot qualify this candidate');

    const missingRoute = writeJsonEvidence(dir, 'missing-route-evidence.json', {
      ...JSON.parse(fs.readFileSync(productionRoute.path, 'utf8')),
      routes: JSON.parse(fs.readFileSync(productionRoute.path, 'utf8')).routes.slice(1)
    });
    const missingRouteProof = createPublicReleaseProof(
      productionEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path, missingRoute.path
    );
    assert.equal(missingRouteProof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED',
      'all 358 actual HTTP route results are required');

    const staleRoutePayload = JSON.parse(fs.readFileSync(productionRoute.path, 'utf8'));
    staleRoutePayload.testedAt = '2026-10-22T17:59:59.000Z';
    staleRoutePayload.routes = staleRoutePayload.routes.map(row => ({ ...row, testedAt: staleRoutePayload.testedAt }));
    const staleRoute = writeJsonEvidence(dir, 'stale-route-evidence.json', staleRoutePayload);
    const staleRouteProof = createPublicReleaseProof(
      productionEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path, staleRoute.path
    );
    assert.equal(staleRouteProof.gates.functionalApiRouteAcceptance, 'NOT_VERIFIED',
      'stale Production API acceptance evidence must not qualify');

    const sqliteOnlyProof = createPublicReleaseProof(
      productionEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path, route.path
    );
    assert.equal(sqliteOnlyProof.gates.functionalApiRouteAcceptance, 'PASS_CONTRACT_SCOPE');
    assert.equal(sqliteOnlyProof.gates.commercialClosure, 'UNVERIFIED',
      'SQLite contract coverage cannot satisfy Production PostgreSQL functional acceptance');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});









test('Production signed-session route validator rejects structurally consistent manifests without runtime signed-route coverage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-signed-route-coverage-'));
  const file = path.join(dir, 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json');
  const manifestPath = path.join(dir, 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
  const inventoryPath = path.join(dir, 'API_INVENTORY.json');
  const env = {
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '3099988776',
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-current-production',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance',
    VERCEL_DEPLOYMENT_ID: 'dpl_ProductionFixture123'
  };
  const routes = Array.from({ length: 67 }, (_, index) => ({
    method: index < 34 ? 'GET' : 'POST',
    path: '/api/v1/signed-route-' + String(index + 1),
    operation: index < 34 ? 'read' : 'write',
    status: 'PASS',
    signedContextBound: true,
    sessionBound: true,
    transactionBound: true,
    rawGucTamperDenied: true,
    ...(index < 34
      ? { tenantARead: true, tenantBRead: true, crossTenantReadDenied: true }
      : { tenantAWrite: true, tenantBWrite: true, crossTenantWriteDenied: true })
  }));
  const inventory = {
    routeCount: 67,
    routes: routes.map(route => ({
      method: route.method,
      route: route.path,
      auth: 'session'
    }))
  };
  const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2) + '\n');
  const inventorySha256 = crypto.createHash('sha256').update(inventoryBytes).digest('hex');
  const manifest = {
    schemaVersion: 'opscore.signed-tenant-context-route-manifest.v1',
    routeCount: 67,
    routeInventorySha256: inventorySha256,
    routes: routes.map(route => ({
      method: route.method,
      path: route.path,
      operation: route.operation
    }))
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  const evidence = {
    schemaVersion: 'opscore.signed-tenant-context-production-coverage.v1',
    environment: 'production',
    status: 'PASS',
    databaseName: 'opscore_acceptance',
    sourceCommitHint: SHA,
    deploymentId: 'dpl_ProductionFixture123',
    pipelineId: '3099988776',
    parentBranchId: 'br-current-production',
    expectedRouteCount: 67,
    coveredRouteCount: 67,
    failedRouteCount: 0,
    routeManifestSha256: manifestSha256,
    routeInventorySha256: inventorySha256,
    testedAt: '2026-11-16T09:00:00.000Z',
    routes
  };
  const validate = () => readProductionSignedTenantRouteCoverageEvidence(
    file, env, manifestPath, inventoryPath
  );
  try {
    fs.writeFileSync(inventoryPath, inventoryBytes);
    fs.writeFileSync(manifestPath, manifestBytes);
    fs.writeFileSync(file, JSON.stringify(evidence));
    assert.equal(validate().status, 'NOT_VERIFIED', 'inventory and evidence agreement cannot certify routes absent from the runtime signed-route policy');

    const duplicate = { ...evidence, routes: [...routes.slice(0, 66), routes[0]] };
    fs.writeFileSync(file, JSON.stringify(duplicate));
    assert.equal(validate().status, 'NOT_VERIFIED');

    fs.writeFileSync(file, JSON.stringify({ ...evidence, pipelineId: '3099988777' }));
    assert.equal(validate().status, 'NOT_VERIFIED');

    fs.writeFileSync(file, JSON.stringify({ ...evidence, coveredRouteCount: 66 }));
    assert.equal(validate().status, 'NOT_VERIFIED');

    fs.writeFileSync(file, JSON.stringify({ ...evidence, databaseName: 'opscore_http_acceptance' }));
    assert.equal(validate().status, 'NOT_VERIFIED');

    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, routes: manifest.routes.slice(0, 66) }));
    fs.writeFileSync(file, JSON.stringify(evidence));
    assert.equal(validate().status, 'NOT_VERIFIED', 'the evidence cannot exceed the approved route manifest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('Production session and recovery evidence bind to the explicit probe deployment rather than rebinding to the final deployment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-probe-deployment-evidence-'));
  const probeDeploymentId = 'dpl_CandidateProbe123';
  const finalDeploymentId = 'dpl_FinalRelease456';
  const baseEnv = {
    OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance',
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-proud-salad-bcshhdap',
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: probeDeploymentId,
    VERCEL_DEPLOYMENT_ID: finalDeploymentId
  };

  try {
    const session = writeJsonEvidence(dir, 'session.json', {
      schemaVersion: 'opscore.production-session-isolation.v3',
      status: 'PASS',
      environment: 'production',
      databaseName: 'opscore_acceptance',
      verificationScope: 'dual-tenant-http-asset-create-read-event-write-denial-and-cleanup',
      sourceCommitHint: SHA,
      pipelineId: '2978538209',
      parentBranchId: 'br-proud-salad-bcshhdap',
      deploymentId: probeDeploymentId,
      evidenceRebind: null,
      checks: {
        dualLogin: 'PASS',
        tenantPrincipalBinding: 'PASS',
        ownAssetCreate: 'PASS',
        ownAssetRead: 'PASS',
        tenantListIsolation: 'PASS',
        crossTenantAssetReadDenied: 'PASS',
        ownAssetEventWrite: 'PASS',
        crossTenantWriteDenied: 'PASS',
        unauthenticatedDenied: 'PASS',
        cleanupComplete: 'PASS'
      }
    });

    const recovery = writeJsonEvidence(dir, 'recovery.json', {
      schemaVersion: 'opscore.production-recovery-point.v4',
      status: 'PASS',
      databaseName: 'opscore_acceptance',
      verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
      referenceBranchId: 'br-candidate-reference-20261118',
      recoveryBranchId: 'br-candidate-recovery-20261118',
      tableCountCompared: 137,
      coreTenantTableRowCountsMatch: true,
      contentIntegrity: fullDataRecoveryIntegrity(137),
    temporaryBranch: true,
    cleanup: { status: 'PASS', referenceBranchDeleted: true, recoveryBranchDeleted: true },
      mismatchCount: 0,
      sourceCommitHint: SHA,
      pipelineId: '2978538209',
      parentBranchId: 'br-proud-salad-bcshhdap',
      deploymentId: probeDeploymentId,
      evidenceRebind: null
    });

    const sessionProof = readProductionSessionIsolationEvidence(session.path, baseEnv);
    const recoveryProof = readProductionRecoveryPointEvidence(recovery.path, baseEnv);
    assert.equal(sessionProof.status, 'PASS');
    assert.equal(sessionProof.deploymentIdBound, true);
    assert.equal(recoveryProof.status, 'PASS');
    assert.equal(recoveryProof.deploymentIdBound, true);

    const withoutProbePin = { ...baseEnv };
    delete withoutProbePin.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID;
    assert.equal(readProductionSessionIsolationEvidence(session.path, withoutProbePin).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recovery.path, withoutProbePin).status, 'NOT_VERIFIED');

    const wrongProbePin = { ...baseEnv, OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_UnrelatedProbe789' };
    assert.equal(readProductionSessionIsolationEvidence(session.path, wrongProbePin).status, 'NOT_VERIFIED');
    assert.equal(readProductionRecoveryPointEvidence(recovery.path, wrongProbePin).status, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('release archive attestation verifies HMAC against the exact commit, pipeline and archive digest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-archive-hmac-'));
  const filePath = path.join(dir, 'RELEASE_ARCHIVE_ATTESTATION.json');
  const key = 'unit-test-only-release-attestation-key-2026';
  const pipelineId = '44783575124';
  const payload = [
    'opscore.release-archive-attestation.v1',
    SHA,
    pipelineId,
    PACKAGE_SHA
  ].join('|');
  const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
  const baseEvidence = {
    schemaVersion: 'opscore.release-archive-attestation.v1',
    status: 'PASS',
    attestationVerified: true,
    signatureVerified: true,
    sourceCommit: SHA,
    pipelineId: Number(pipelineId),
    sha256: PACKAGE_SHA,
    signatureAlgorithm: 'HMAC-SHA256',
    signature,
    attestedAt: '2026-11-20T00:00:00.000Z'
  };
  const env = {
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: pipelineId,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
    OPSC_RELEASE_PACKAGE_ATTESTATION_KEY: key
  };
  const write = value => fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
  try {
    write(baseEvidence);
    const valid = readReleaseArchiveAttestation(filePath, env);
    assert.equal(valid.status, 'PASS');
    assert.equal(valid.signatureVerified, true);
    assert.equal(valid.sha256, PACKAGE_SHA);

    assert.equal(
      readReleaseArchiveAttestation(filePath, { ...env, OPSC_RELEASE_PACKAGE_ATTESTATION_KEY: 'different-secret-key-material' }).status,
      'NOT_VERIFIED',
      'a wrong HMAC key must not pass'
    );
    assert.equal(
      readReleaseArchiveAttestation(filePath, { ...env, OPSC_RELEASE_CI_COMMIT: '0'.repeat(40) }).status,
      'NOT_VERIFIED',
      'a signature cannot be rebound to another source commit'
    );
    assert.equal(
      readReleaseArchiveAttestation(filePath, { ...env, OPSC_RELEASE_CI_PIPELINE_ID: '44783575125' }).status,
      'NOT_VERIFIED',
      'a signature cannot be rebound to another pipeline'
    );
    assert.equal(
      readReleaseArchiveAttestation(filePath, { ...env, OPSC_RELEASE_PACKAGE_SHA256: 'f'.repeat(64) }).status,
      'NOT_VERIFIED',
      'a signature cannot be rebound to another archive digest'
    );
    assert.equal(
      readReleaseArchiveAttestation(filePath, { ...env, OPSC_RELEASE_PACKAGE_ATTESTATION_KEY: '' }).status,
      'NOT_VERIFIED',
      'missing signing material must fail closed'
    );

    write({ ...baseEvidence, signature: '0'.repeat(64) });
    assert.equal(readReleaseArchiveAttestation(filePath, env).status, 'NOT_VERIFIED');
    write({ ...baseEvidence, signatureVerified: false });
    assert.equal(
      readReleaseArchiveAttestation(filePath, env).status,
      'PASS',
      'the verifier recomputes the HMAC and does not trust the embedded boolean flag'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
