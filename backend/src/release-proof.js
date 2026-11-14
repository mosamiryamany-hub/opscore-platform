'use strict';

const { createDeploymentProof } = require('./deployment-proof');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
const IDENTITY_SCHEMA = 'opscore.vercel-release-identity.v1';
function normalizedReleaseTag(value) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(raw) ? raw : null;
}

function normalizedSha(value) {
  const raw = String(value || '').trim().toLowerCase();
  return SHA_RE.test(raw) ? raw : null;
}

function normalizedGithubRunUrl(value, repository, pipelineId) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ''))) return null;
  let url;
  try { url = new URL(String(value || '')); }
  catch { return null; }
  const expectedPath = `/${repository}/actions/runs/${pipelineId}`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password ||
      url.pathname !== expectedPath || url.search || url.hash) return null;
  return url.toString();
}

function readCurrentPostgresHttpAcceptance(env, filePath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json')) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      status: 'NOT_VERIFIED',
      historicalStatus: null,
      testedAt: null,
      evidenceCommit: null,
      evidencePipelineId: null
    };
  }

  const status = String(evidence.status || '');
  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.CI_PIPELINE_ID || '').trim();
  const evidenceCommit = normalizedSha(evidence.commit || evidence.testedCodeCommit || evidence.sourceCommit);
  const evidencePipelineId = String(evidence.pipelineId || '').trim();
  const exactMatch = Boolean(
    status === 'PASS' &&
    expectedCommit &&
    evidenceCommit === expectedCommit &&
    PIPELINE_RE.test(expectedPipelineId) &&
    evidencePipelineId === expectedPipelineId
  );

  return {
    status: status === 'FAIL' ? 'FAIL' : exactMatch ? 'PASS' : 'NOT_VERIFIED',
    historicalStatus: status || null,
    testedAt: evidence.testedAt || evidence.completedAt || evidence.generatedAt || null,
    evidenceCommit,
    evidencePipelineId: evidencePipelineId || null,
    currentCandidateMatch: exactMatch
  };
}

function readProductionAcceptanceEvidence(env, expectedCommit, expectedPipelineId, evidencePath = path.join(__dirname, '..', 'docs', 'verification', 'PRODUCTION_ACCEPTANCE_RESULT.json'), now = () => new Date()) {
  let raw;
  let evidence;
  try {
    raw = fs.readFileSync(evidencePath, 'utf8');
    evidence = JSON.parse(raw);
  } catch {
    return { status: 'NOT_VERIFIED', evidenceSha256: null, sourceCommit: null, pipelineId: null, testedAt: null };
  }

  const evidenceSha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const publishedSha = String(env.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || '').trim().toLowerCase();
  const sourceCommit = normalizedSha(evidence.sourceCommit);
  const pipelineId = String(evidence.pipelineId || '').trim();
  const testedAt = String(evidence.testedAt || '').trim();
  const testedDate = testedAt ? new Date(testedAt) : null;
  const checks = evidence.checks && typeof evidence.checks === 'object' ? evidence.checks : {};
  const role = evidence.runtimeRole && typeof evidence.runtimeRole === 'object' ? evidence.runtimeRole : {};
  const tableCoverage = evidence.tenantTableCoverage && typeof evidence.tenantTableCoverage === 'object' ? evidence.tenantTableCoverage : {};
  const routeSecurity = evidence.tenantRouteSecurityCoverage && typeof evidence.tenantRouteSecurityCoverage === 'object' ? evidence.tenantRouteSecurityCoverage : {};
  const functionalRouteCoverage = evidence.apiRouteCoverage && typeof evidence.apiRouteCoverage === 'object' ? evidence.apiRouteCoverage : {};
  const migrationLedger = evidence.migrationLedger && typeof evidence.migrationLedger === 'object' ? evidence.migrationLedger : {};
  const scopes = evidence.evidenceScopes && typeof evidence.evidenceScopes === 'object' ? evidence.evidenceScopes : {};
  const recovery = evidence.productionRecovery && typeof evidence.productionRecovery === 'object' ? evidence.productionRecovery : {};
  const nowMs = now().getTime();
  const testedMs = testedDate ? testedDate.getTime() : NaN;
  const roleSafe = role.name === 'opscore_runtime' &&
    role.login === true && role.superuser === false && role.bypassRls === false &&
    role.createRole === false && role.createDatabase === false &&
    role.elevatedMembershipCount === 0;
  const coverageSafe = tableCoverage.status === 'PASS' &&
    Number.isSafeInteger(tableCoverage.totalTables) && tableCoverage.totalTables > 0 &&
    tableCoverage.testedTables === tableCoverage.totalTables &&
    routeSecurity.status === 'PASS_TEST_SCOPE' &&
    routeSecurity.scope === 'UNAUTHENTICATED_DENIAL_FOREIGN_ID_DENIAL_AND_CROSS_TENANT_FIXTURES_ONLY' &&
    Number.isSafeInteger(routeSecurity.tenantDataRoutes) && routeSecurity.tenantDataRoutes > 0 &&
    routeSecurity.unauthenticatedChecks === routeSecurity.tenantDataRoutes &&
    routeSecurity.foreignIdRoutes >= 0 &&
    routeSecurity.foreignIdChecks === routeSecurity.foreignIdRoutes &&
    Number.isSafeInteger(routeSecurity.crossTenantFixtureChecks) && routeSecurity.crossTenantFixtureChecks > 0 &&
    routeSecurity.functionalRouteAcceptance === 'NOT_VERIFIED' &&
    functionalRouteCoverage.status === 'NOT_VERIFIED' &&
    functionalRouteCoverage.reason === 'FUNCTIONAL_ROUTE_ACCEPTANCE_NOT_RUN';
  const migrationSafe = migrationLedger.status === 'PASS' &&
    migrationLedger.databaseIdentityMatch === true &&
    typeof migrationLedger.databaseName === 'string' && migrationLedger.databaseName.length > 0 &&
    migrationLedger.databaseName === role.databaseName &&
    Number.isSafeInteger(migrationLedger.sourceMigrationCount) && migrationLedger.sourceMigrationCount > 0 &&
    Number.isSafeInteger(migrationLedger.ledgerRowCount) && migrationLedger.ledgerRowCount === migrationLedger.sourceMigrationCount &&
    migrationLedger.matchedCount === migrationLedger.sourceMigrationCount &&
    migrationLedger.pendingCount === 0 && migrationLedger.blockerCount === 0;
  const checksSafe = checks.migrationLedgerParity === 'PASS' &&
    checks.tenantSessionIsolation === 'PASS_TEST_SCOPE' &&
    checks.crossTenantAccessDenied === 'PASS_TEST_SCOPE' &&
    checks.recoveryRestore === 'PASS_TEST_SCOPE' &&
    checks.backupIntegrity === 'PASS_TEST_SCOPE' &&
    checks.productionNeonPitr === 'NOT_VERIFIED';
  const scopesSafe = scopes.productionDatabase === 'LIVE_READ_ONLY' &&
    scopes.tenantIsolation === 'DISPOSABLE_POSTGRESQL_18_CI' &&
    scopes.tenantRouteSecurityCoverage === 'DISPOSABLE_POSTGRESQL_18_CI' &&
    scopes.apiRouteCoverage === 'NOT_VERIFIED_FUNCTIONAL_ACCEPTANCE_NOT_RUN' &&
    scopes.recoveryRestore === 'DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI' &&
    scopes.productionNeonPitr === 'NOT_VERIFIED' &&
    evidence.productionIsolationCertification === false &&
    recovery.logicalRestoreTestScope === 'PASS_TEST_SCOPE' &&
    recovery.neonPointInTimeRestore === 'NOT_VERIFIED';
  const evidenceHashesSafe = HASH_RE.test(String(evidence.tenantMatrixEvidenceSha256 || '')) &&
    HASH_RE.test(String(evidence.recoveryDrillEvidenceSha256 || ''));
  const exactMatch = Boolean(
    evidence.schemaVersion === 'opscore.production-acceptance.v2' &&
    evidence.status === 'PASS' &&
    evidence.environment === 'production' &&
    evidence.databaseEngine === 'postgres' &&
    sourceCommit && sourceCommit === expectedCommit &&
    PIPELINE_RE.test(String(expectedPipelineId || '')) &&
    pipelineId === String(expectedPipelineId) &&
    testedDate && !Number.isNaN(testedMs) && testedMs <= nowMs &&
    checksSafe && coverageSafe && migrationSafe && scopesSafe &&
    evidenceHashesSafe && roleSafe &&
    HASH_RE.test(publishedSha) && publishedSha === evidenceSha256
  );

  return {
    status: exactMatch ? 'PASS' : 'NOT_VERIFIED',
    evidenceSha256: exactMatch ? evidenceSha256 : null,
    sourceCommit,
    pipelineId: pipelineId || null,
    testedAt: testedDate && !Number.isNaN(testedMs) ? testedDate.toISOString() : null,
    tenantMatrixEvidenceSha256: evidenceHashesSafe ? evidence.tenantMatrixEvidenceSha256 : null,
    recoveryDrillEvidenceSha256: evidenceHashesSafe ? evidence.recoveryDrillEvidenceSha256 : null
  };
}

function readEmbeddedBuildIdentity(identityPath = path.join(__dirname, 'opscore-vercel-release-identity.json')) {
  let value;
  try { value = JSON.parse(fs.readFileSync(identityPath, 'utf8')); }
  catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const commitSha = normalizedSha(value.commitSha);
  const pipelineId = String(value.pipelineId || '').trim();
  const ref = String(value.ref || '').trim();
  if (value.schemaVersion !== IDENTITY_SCHEMA || value.deploymentSource !== 'github-actions-cli' ||
      !commitSha || !PIPELINE_RE.test(pipelineId) || ref !== 'main') return null;
  const runAttempt = Number(value.runAttempt);
  const packageSha256 = String(value.packageSha256 || '').trim().toLowerCase();
  const packageCommit = normalizedSha(value.packageCommit || value.commitSha);
  const packageOk = Boolean(packageSha256 && HASH_RE.test(packageSha256) && packageCommit && packageCommit === commitSha);
  return {
    deploymentSource: value.deploymentSource,
    commitSha,
    pipelineId,
    ref,
    runAttempt: Number.isSafeInteger(runAttempt) && runAttempt > 0 ? runAttempt : null,
    pipelineUrl: normalizedGithubRunUrl(value.runUrl, value.repository, pipelineId),
    packageSha256: packageOk ? packageSha256 : null,
    packageCommit: packageOk ? packageCommit : null
  };
}


function readProductionSessionIsolationEvidence(filePath = path.join(__dirname, '..', 'docs', 'verification', 'PRODUCTION_SESSION_ISOLATION.json'), env = process.env) {
  if (String(env.OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE || '').trim().toLowerCase() !== 'true') {
    return { status: 'NOT_VERIFIED', testedAt: null, checks: null };
  }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED', testedAt: null, checks: null }; }
  if (evidence.schemaVersion !== 'opscore.production-session-isolation.v1') {
    return { status: 'NOT_VERIFIED', testedAt: null, checks: null };
  }
  const checks = evidence.checks || {};
  const required = ['dualLogin','ownAssetCreate','tenantListIsolation','crossTenantAssetDenied','crossTenantWriteDenied','unauthenticatedDenied','cleanupComplete'];
  const allPass = evidence.status === 'PASS' && required.every((k) => checks[k] === 'PASS');
  return {
    status: allPass ? 'PASS' : 'FAIL',
    testedAt: evidence.testedAt || null,
    checks,
    httpBase: evidence.httpBase || null,
    evidenceClass: evidence.evidenceClass || null
  };
}

function readProductionRecoveryPointEvidence(filePath = path.join(__dirname, '..', 'docs', 'verification', 'PRODUCTION_RECOVERY_POINT.json'), env = process.env) {
  if (String(env.OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE || '').trim().toLowerCase() !== 'true') {
    return { status: 'NOT_VERIFIED', testedAt: null };
  }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED', testedAt: null }; }
  if (evidence.schemaVersion !== 'opscore.production-recovery-point.v1') {
    return { status: 'NOT_VERIFIED', testedAt: null };
  }
  const ok = evidence.status === 'PASS' &&
    evidence.coreTenantTablesMatch === true &&
    Number(evidence.tableCountCompared) >= 130 &&
    Number(evidence.mismatchCount) === 0 &&
    typeof evidence.recoveryBranchId === 'string' && evidence.recoveryBranchId.length > 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    testedAt: evidence.testedAt || null,
    recoveryBranchId: evidence.recoveryBranchId || null,
    tableCountCompared: evidence.tableCountCompared || null,
    mismatchCount: evidence.mismatchCount,
    historyRetentionSeconds: evidence.historyRetentionSeconds || null,
    evidenceClass: evidence.evidenceClass || null
  };
}

function createPublicReleaseProof(env = process.env, now = () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath = path.join(__dirname, '..', 'docs', 'verification', 'API_ROUTE_ACCEPTANCE_RESULT.json')) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  const proofEnv = identity ? {
    ...env,
    OPSC_RELEASE_DEPLOYMENT_SOURCE: identity.deploymentSource,
    OPSC_RELEASE_CI_COMMIT: identity.commitSha,
    OPSC_RELEASE_CI_PIPELINE_ID: identity.pipelineId,
    OPSC_RELEASE_CI_REF: identity.ref,
    OPSC_SOURCE_COMMIT_SHA: identity.commitSha,
    OPSC_RELEASE_PACKAGE_SHA256: identity.packageSha256 || env.OPSC_RELEASE_PACKAGE_SHA256,
    OPSC_RELEASE_PACKAGE_COMMIT: identity.packageCommit || identity.commitSha || env.OPSC_RELEASE_PACKAGE_COMMIT
  } : env;
  const deployment = createDeploymentProof(proofEnv, now);
  const releaseTag = normalizedReleaseTag(proofEnv.OPSC_RELEASE_TAG || proofEnv.CI_COMMIT_TAG);
  const sourceCommit = deployment.source.commitSha;
  const ciCommit = normalizedSha(proofEnv.OPSC_RELEASE_CI_COMMIT);
  const pipelineId = String(proofEnv.OPSC_RELEASE_CI_PIPELINE_ID || '').trim();
  const ciVerified = Boolean(sourceCommit && ciCommit === sourceCommit && PIPELINE_RE.test(pipelineId));
  const postgresHttpAcceptance = readCurrentPostgresHttpAcceptance({ ...proofEnv, OPSC_RELEASE_CI_COMMIT: ciCommit, OPSC_RELEASE_CI_PIPELINE_ID: pipelineId }, postgresHttpAcceptancePath);
  const apiRouteAcceptance = readCurrentApiRouteAcceptance({ ...proofEnv, OPSC_RELEASE_CI_COMMIT: ciCommit, OPSC_RELEASE_CI_PIPELINE_ID: pipelineId }, apiRouteAcceptancePath);

  const packageCommit = normalizedSha(proofEnv.OPSC_RELEASE_PACKAGE_COMMIT);
  const packageSha = String(proofEnv.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const packageVerified = Boolean(sourceCommit && packageCommit === sourceCommit && HASH_RE.test(packageSha));

  const productionAcceptance = readProductionAcceptanceEvidence(
    proofEnv,
    sourceCommit,
    pipelineId,
    productionAcceptanceEvidencePath,
    now
  );
  const acceptanceVerified = ciVerified && productionAcceptance.status === 'PASS';
  const releaseVerified = Boolean(
    identity && identity.deploymentSource === 'github-actions-cli' && identity.packageSha256 &&
    identity.packageCommit === sourceCommit &&
    ciVerified &&
    packageVerified &&
    deployment.status === 'identified' &&
    deployment.deployment.environment === 'production' &&
    deployment.source.ref === 'main' &&
    postgresHttpAcceptance.status === 'PASS' &&
    acceptanceVerified
  );

  const sessionIsolation = readProductionSessionIsolationEvidence(undefined, proofEnv);
  const recoveryPoint = readProductionRecoveryPointEvidence(undefined, proofEnv);

  return {
    schemaVersion: 'opscore.public-release-proof.v2',
    product: 'OpsCore',
    version: '0.11.62',
    releaseTag,
    sourceCommitIdentitySource: identity ? 'github-actions-cli-assertion' : 'unverified',
    status: releaseVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
    sourceCommit,
    deployment: {
      status: deployment.status,
      environment: deployment.deployment.environment,
      id: deployment.deployment.id,
      ref: deployment.source.ref,
      provider: deployment.source.provider
    },
    ci: {
      status: ciVerified ? 'PASS' : 'UNVERIFIED',
      pipelineId: ciVerified ? Number(pipelineId) : null,
      commitSha: ciVerified ? ciCommit : null,
      pipelineUrl: ciVerified ? identity?.pipelineUrl || null : null,
      runAttempt: ciVerified ? identity?.runAttempt || null : null,
      evidenceScope: 'GitHub Actions CI commit-match is bound to the embedded build identity; use pipelineUrl to inspect the full gate report.'
    },
    gates: {
      commercialClosure: releaseVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
      livePostgresRls: ciVerified ? 'PASS_TEST_SCOPE' : 'UNVERIFIED',
      productionSessionTenantBoundary: sessionIsolation.status === 'PASS' ? 'PASS_PRODUCTION' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED'),
      productionRecoveryBundle: recoveryPoint.status === 'PASS' ? 'PASS_PRODUCTION' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED'),
      tenantRouteSecurityCoverage: acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED',
      functionalApiRouteAcceptance: apiRouteAcceptance.status,
      neonPointInTimeRecovery: recoveryPoint.status === 'PASS' ? 'PASS_BRANCH_POINT' : 'NOT_VERIFIED',
      productionIsolationCertification: (sessionIsolation.status === 'PASS' && recoveryPoint.status === 'PASS' && acceptanceVerified && String(proofEnv.OPSC_PRODUCTION_ISOLATION_CERTIFICATION || '').trim().toUpperCase() === 'CERTIFIED') ? 'CERTIFIED' : 'NOT_CERTIFIED',
      mobileStoreArtifacts: 'REMAINING_BUYER',
      nativeTranslationReview: 'REMAINING_BUYER',
      licensedStreetMap: 'REMAINING_BUYER',
      postgresHttpAcceptance: postgresHttpAcceptance.status
    },
    productionAcceptance: {
      status: acceptanceVerified ? 'PASS' : 'NOT_VERIFIED',
      commitSha: acceptanceVerified ? productionAcceptance.sourceCommit : null,
      pipelineId: acceptanceVerified ? productionAcceptance.pipelineId : null,
      checkedAt: acceptanceVerified ? productionAcceptance.testedAt : null,
      evidenceSha256: acceptanceVerified ? productionAcceptance.evidenceSha256 : null,
      evidenceNote: acceptanceVerified ? 'SHA-256 was recomputed and matched. Production DB checks were read-only; tenant/API tests and logical restore were run on disposable PostgreSQL 18 CI. This is not production tenant certification or Neon PITR.' : null
    },
    postgresHttpAcceptance,
    packageFingerprint: {
      algorithm: 'SHA-256',
      status: packageVerified ? 'PUBLISHED' : 'UNVERIFIED',
      value: packageVerified ? packageSha : null,
      sourceCommit: packageVerified ? packageCommit : null
    },
    checkedAt: now().toISOString(),
    note: 'Release evidence is bound to the source commit reported by the running Vercel deployment. Tenant route security coverage is limited to unauthenticated-denial, foreign-ID-denial, and cross-tenant fixture probes on disposable PostgreSQL 18 CI; it is not functional acceptance of every API route and does not certify production isolation. PostgreSQL logical restore is also CI test-scope only. Functional API route acceptance is contract-scope only (existence + auth contract + no unhandled 5xx across all inventory routes; PASS_CONTRACT_SCOPE requires commit-and-pipeline-bound evidence with zero failures) and never a business-flow certification. Neon point-in-time restore and production tenant isolation certification remain NOT_VERIFIED. Live production DB checks are read-only and require the runtime and migration-owner connections to identify the same database. A Vercel environment flag alone can never certify these items. Signed mobile binaries, native-speaker localization review, and a licensed street-map provider remain buyer-owned.'
  };
};

function hasVerifiedProductionRelease(env = process.env, identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath = path.join(__dirname, '..', 'docs', 'verification', 'API_ROUTE_ACCEPTANCE_RESULT.json')) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  if (!identity) return false;
  const proof = createPublicReleaseProof(env, () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath);
  return proof.status === 'PASS_WITH_BUYER_RESIDUALS' &&
    proof.ci.status === 'PASS' &&
    proof.packageFingerprint.status === 'PUBLISHED' &&
    proof.deployment.status === 'identified' &&
    proof.deployment.environment === 'production' &&
    proof.deployment.ref === 'main' &&
    proof.sourceCommitIdentitySource === 'github-actions-cli-assertion' &&
    proof.postgresHttpAcceptance.status === 'PASS' &&
    proof.productionAcceptance.status === 'PASS' &&
    ['PASS_TEST_SCOPE', 'PASS_PRODUCTION'].includes(proof.gates.productionSessionTenantBoundary) &&
    ['PASS_TEST_SCOPE', 'PASS_PRODUCTION'].includes(proof.gates.productionRecoveryBundle) &&
    proof.gates.tenantRouteSecurityCoverage === 'PASS_TEST_SCOPE' &&
    ['NOT_VERIFIED', 'PASS_CONTRACT_SCOPE'].includes(proof.gates.functionalApiRouteAcceptance) &&
    ['NOT_VERIFIED', 'PASS_BRANCH_POINT'].includes(proof.gates.neonPointInTimeRecovery) &&
    ['NOT_CERTIFIED', 'CERTIFIED'].includes(proof.gates.productionIsolationCertification);
}

function readCurrentApiRouteAcceptance(env = process.env, filePath = path.join(__dirname, '..', 'docs', 'verification', 'API_ROUTE_ACCEPTANCE_RESULT.json')) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { status: 'NOT_VERIFIED', testedAt: null, evidenceCommit: null, evidencePipelineId: null, testedRoutes: null, failed: null };
  }
  const status = String(evidence.status || '');
  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.CI_PIPELINE_ID || '').trim();
  const evidenceCommit = normalizedSha(evidence.commitSha);
  const evidencePipelineId = String(evidence.pipelineId || '').trim();
  const testedRoutes = Number(evidence.testedRoutes);
  const inventoryRouteCount = Number(evidence.inventoryRouteCount);
  const passed = Number(evidence.passed);
  const exactMatch = Boolean(
    evidence.schemaVersion === 'opscore.api-route-acceptance.v1' &&
    evidence.engine === 'sqlite' &&
    status === 'PASS' &&
    expectedCommit &&
    evidenceCommit === expectedCommit &&
    PIPELINE_RE.test(expectedPipelineId) &&
    evidencePipelineId === expectedPipelineId &&
    Number.isSafeInteger(testedRoutes) &&
    testedRoutes >= 300 &&
    testedRoutes === inventoryRouteCount &&
    passed === testedRoutes &&
    Number(evidence.failed) === 0
  );
  return {
    status: exactMatch ? 'PASS_CONTRACT_SCOPE' : 'NOT_VERIFIED',
    testedAt: exactMatch ? String(evidence.generatedAt || '') : null,
    evidenceCommit: exactMatch ? evidenceCommit : null,
    evidencePipelineId: exactMatch ? evidencePipelineId : null,
    testedRoutes: exactMatch ? Number(evidence.testedRoutes) : null,
    failed: exactMatch ? Number(evidence.failed) : null
  };
}

module.exports = { createPublicReleaseProof, hasVerifiedProductionRelease, readEmbeddedBuildIdentity, readProductionAcceptanceEvidence, readProductionSessionIsolationEvidence, readProductionRecoveryPointEvidence };
