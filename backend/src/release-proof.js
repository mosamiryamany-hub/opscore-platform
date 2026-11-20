'use strict';

const { createDeploymentProof } = require('./deployment-proof');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const signedTenantContextPolicy = require('./signed-tenant-context-policy');

const SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
const IDENTITY_SCHEMA = 'opscore.vercel-release-identity.v1';

// These are real buyer-owned deliverables, not seller release failures. Keep them
// explicit in the public proof so a technical PASS cannot imply buyer completion.
const BUYER_RESIDUALS = Object.freeze([
  {
    id: 'mobileStoreArtifacts',
    status: 'REMAINING_BUYER',
    scope: 'Buyer-specific Android/iOS signing, native builds, physical-device QA, and app-store publication are not included.'
  },
  {
    id: 'nativeTranslationReview',
    status: 'REMAINING_BUYER',
    scope: 'Native-speaker review and production language qualification remain 0/114 locales.'
  },
  {
    id: 'licensedStreetMap',
    status: 'REMAINING_BUYER',
    scope: 'Licensed maps, road-routing, provider credentials, attribution, quotas, and buyer-specific acceptance remain buyer-owned.'
  }
]);
function embeddedEvidencePath(fileName) {
  const embedded = path.join(__dirname, 'embedded-evidence', fileName);
  if (fs.existsSync(embedded)) return embedded;
  return path.join(__dirname, '..', 'docs', 'verification', fileName);
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

function readCurrentPostgresHttpAcceptance(env, filePath = embeddedEvidencePath('POSTGRES_HTTP_ACCEPTANCE_RESULT.json')) {
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

function readProductionAcceptanceEvidence(env, expectedCommit, expectedPipelineId, evidencePath = embeddedEvidencePath('PRODUCTION_ACCEPTANCE_RESULT.json'), now = () => new Date()) {
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
  // Full parity OR staged Preview-only signed-context migrations (non-blocking for production).
  const stagedPreviewPending = Number(migrationLedger.stagedPreviewPendingCount || 0);
  const productionBlockingPending = Number(
    migrationLedger.productionBlockingPendingCount != null
      ? migrationLedger.productionBlockingPendingCount
      : migrationLedger.pendingCount || 0
  );
  const migrationStatusOk = migrationLedger.status === 'PASS' ||
    (migrationLedger.status === 'PASS_WITH_STAGED_PREVIEW_MIGRATIONS' &&
      stagedPreviewPending > 0 &&
      productionBlockingPending === 0);
  const migrationSafe = migrationStatusOk &&
    migrationLedger.databaseIdentityMatch === true &&
    typeof migrationLedger.databaseName === 'string' && migrationLedger.databaseName.length > 0 &&
    migrationLedger.databaseName === role.databaseName &&
    Number.isSafeInteger(migrationLedger.sourceMigrationCount) && migrationLedger.sourceMigrationCount > 0 &&
    Number.isSafeInteger(migrationLedger.ledgerRowCount) && migrationLedger.ledgerRowCount > 0 &&
    Number.isSafeInteger(migrationLedger.matchedCount) &&
    migrationLedger.matchedCount === migrationLedger.ledgerRowCount &&
    productionBlockingPending === 0 &&
    Number(migrationLedger.blockerCount || 0) === 0;
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


function readProductionSessionIsolationEvidence(filePath = embeddedEvidencePath('PRODUCTION_SESSION_ISOLATION.json'), env = process.env) {
  if (String(env.OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE || '').trim().toLowerCase() !== 'true') {
    return { status: 'NOT_VERIFIED', testedAt: null, checks: null };
  }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED', testedAt: null, checks: null }; }

  const checks = evidence.checks && typeof evidence.checks === 'object' ? evidence.checks : {};
  const required = [
    'dualLogin', 'tenantPrincipalBinding', 'ownAssetCreate', 'ownAssetRead',
    'tenantListIsolation', 'crossTenantAssetReadDenied', 'ownAssetEventWrite',
    'crossTenantWriteDenied', 'unauthenticatedDenied', 'cleanupComplete'
  ];
  const expectedDatabaseName = String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const scopeValid = Boolean(expectedDatabaseName)
    && evidence.schemaVersion === 'opscore.production-session-isolation.v3'
    && evidence.status === 'PASS'
    && evidence.verificationScope === 'dual-tenant-http-asset-create-read-event-write-denial-and-cleanup'
    && evidence.databaseName === expectedDatabaseName
    && required.every(key => checks[key] === 'PASS');
  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA || env.OPSC_SOURCE_COMMIT_SHA);
  const evidenceCommit = normalizedSha(evidence.sourceCommitHint);
  const commitBound = /^[a-f0-9]{40}$/.test(expectedCommit || '') && evidenceCommit === expectedCommit;
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.GITHUB_RUN_ID || '').trim();
  const pipelineBound = PIPELINE_RE.test(expectedPipelineId) && String(evidence.pipelineId || '') === expectedPipelineId;
  const expectedParentBranchId = String(env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const parentBranchBound = /^[a-z0-9-]{8,80}$/.test(expectedParentBranchId)
    && String(evidence.parentBranchId || '').trim() === expectedParentBranchId;
  const expectedDeploymentId = String(env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || '').trim();
  const deploymentIdBound = /^dpl_[A-Za-z0-9]+$/.test(expectedDeploymentId)
    && String(evidence.deploymentId || '').trim() === expectedDeploymentId;
  const noEvidenceRebind = evidence.evidenceRebind === undefined || evidence.evidenceRebind === null;
  return {
    status: scopeValid && commitBound && pipelineBound && parentBranchBound && deploymentIdBound && noEvidenceRebind ? 'PASS' : 'NOT_VERIFIED',
    testedAt: evidence.testedAt || null,
    checks,
    httpBase: evidence.httpBase || null,
    databaseName: evidence.databaseName || null,
    verificationScope: evidence.verificationScope || null,
    pipelineId: String(evidence.pipelineId || '') || null,
    evidenceClass: evidence.evidenceClass || null,
    sourceCommitHint: evidenceCommit || null,
    commitBound,
    pipelineBound,
    parentBranchBound,
    deploymentIdBound,
    noEvidenceRebind
  };
}

function readProductionRecoveryPointEvidence(filePath = embeddedEvidencePath('PRODUCTION_RECOVERY_POINT.json'), env = process.env) {
  if (String(env.OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE || '').trim().toLowerCase() !== 'true') {
    return { status: 'NOT_VERIFIED', testedAt: null };
  }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED', testedAt: null }; }

  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA || env.OPSC_SOURCE_COMMIT_SHA);
  const evidenceCommit = normalizedSha(evidence.sourceCommitHint);
  const commitBound = /^[a-f0-9]{40}$/.test(expectedCommit || '') && evidenceCommit === expectedCommit;
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.GITHUB_RUN_ID || '').trim();
  const pipelineBound = PIPELINE_RE.test(expectedPipelineId) && String(evidence.pipelineId || '') === expectedPipelineId;
  const expectedParentBranchId = String(env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const parentBranchBound = /^[a-z0-9-]{8,80}$/.test(expectedParentBranchId)
    && String(evidence.parentBranchId || '').trim() === expectedParentBranchId;
  const expectedDeploymentId = String(env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || '').trim();
  const deploymentIdBound = /^dpl_[A-Za-z0-9]+$/.test(expectedDeploymentId)
    && String(evidence.deploymentId || '').trim() === expectedDeploymentId;
  const expectedDatabaseName = String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const cleanupVerified = evidence.temporaryBranch === true
    && evidence.cleanup && evidence.cleanup.status === 'PASS'
    && evidence.cleanup.referenceBranchDeleted === true
    && evidence.cleanup.recoveryBranchDeleted === true
    && /^br-[a-z0-9-]{8,80}$/.test(String(evidence.referenceBranchId || ''))
    && /^br-[a-z0-9-]{8,80}$/.test(String(evidence.recoveryBranchId || ''))
    && evidence.referenceBranchId !== evidence.recoveryBranchId;
  const contentIntegrity = evidence.contentIntegrity && typeof evidence.contentIntegrity === 'object'
    ? evidence.contentIntegrity
    : {};
  const tableResults = Array.isArray(contentIntegrity.tableResults) ? contentIntegrity.tableResults : [];
  const seenTables = new Set();
  const tableContentValid = tableResults.length >= 130 && tableResults.every(row => {
    if (!row || typeof row !== 'object' || row.schema !== 'public') return false;
    const table = String(row.table || '');
    const sourceHash = String(row.sourceSha256 || '').toLowerCase();
    const recoveryHash = String(row.recoverySha256 || '').toLowerCase();
    const sourceRows = Number(row.sourceRowCount);
    const recoveryRows = Number(row.recoveryRowCount);
    const valid = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(table)
      && !seenTables.has(table)
      && HASH_RE.test(sourceHash)
      && HASH_RE.test(recoveryHash)
      && sourceHash === recoveryHash
      && Number.isSafeInteger(sourceRows)
      && sourceRows >= 0
      && sourceRows === recoveryRows
      && row.status === 'PASS';
    if (valid) seenTables.add(table);
    return valid;
  });
  const contentManifestMatch = HASH_RE.test(String(contentIntegrity.sourceManifestSha256 || ''))
    && HASH_RE.test(String(contentIntegrity.recoveryManifestSha256 || ''))
    && String(contentIntegrity.sourceManifestSha256).toLowerCase() === String(contentIntegrity.recoveryManifestSha256).toLowerCase();
  const recoveryRlsExceptionTables = Array.isArray(contentIntegrity.rlsExceptionTables)
    ? contentIntegrity.rlsExceptionTables.map(value => String(value)).sort()
    : [];
  const recoveryRlsExceptionsExact = JSON.stringify(recoveryRlsExceptionTables) === JSON.stringify(['spatial_ref_sys']);
  const comparedRowsTotal = tableResults.reduce((total, row) => total + Number(row && row.sourceRowCount), 0);
  const contentIntegrityValid = contentIntegrity.status === 'PASS'
    && contentIntegrity.algorithm === 'SHA-256'
    && Number(contentIntegrity.tableCountCompared) >= 130
    && Number(contentIntegrity.tableCountCompared) === tableResults.length
    && Number(contentIntegrity.tableCountCompared) === Number(evidence.tableCountCompared)
    && Number(contentIntegrity.catalogTableCount) >= 136
    && recoveryRlsExceptionsExact
    && Number.isSafeInteger(Number(contentIntegrity.rowsCompared))
    && Number(contentIntegrity.rowsCompared) > 0
    && Number(contentIntegrity.rowsCompared) === comparedRowsTotal
    && Number(contentIntegrity.mismatchCount) === 0
    && Number(contentIntegrity.rlsPolicyTableCount) >= 135
    && Number(contentIntegrity.rlsPolicyMismatchCount) === 0
    && Number(contentIntegrity.forceRlsMismatchCount) === 0
    && contentManifestMatch
    && tableContentValid;
  const scopeValid = Boolean(expectedDatabaseName)
    && evidence.schemaVersion === 'opscore.production-recovery-point.v4'
    && evidence.databaseName === expectedDatabaseName
    && evidence.verificationScope === 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts'
    && evidence.coreTenantTableRowCountsMatch === true
    && Number(evidence.tableCountCompared) >= 130
    && Number(evidence.mismatchCount) === 0
    && contentIntegrityValid
    && typeof evidence.recoveryBranchId === 'string'
    && /^[a-z0-9-]{8,80}$/.test(evidence.recoveryBranchId)
    && cleanupVerified;
  const noEvidenceRebind = evidence.evidenceRebind === undefined || evidence.evidenceRebind === null;
  const ok = evidence.status === 'PASS' && scopeValid && commitBound && pipelineBound && parentBranchBound && deploymentIdBound && noEvidenceRebind;
  return {
    status: ok ? 'PASS' : 'NOT_VERIFIED',
    testedAt: evidence.testedAt || null,
    recoveryBranchId: evidence.recoveryBranchId || null,
    temporaryBranch: evidence.temporaryBranch === true,
    cleanupVerified,
    databaseName: evidence.databaseName || null,
    verificationScope: evidence.verificationScope || null,
    tableCountCompared: Number(evidence.tableCountCompared) || null,
    mismatchCount: evidence.mismatchCount,
    evidenceClass: evidence.evidenceClass || null,
    sourceCommitHint: evidenceCommit || null,
    pipelineId: String(evidence.pipelineId || '') || null,
    commitBound,
    pipelineBound,
    parentBranchBound,
    deploymentIdBound,
    noEvidenceRebind
  };
}

function readProductionNativePitrEvidence(filePath = embeddedEvidencePath('PRODUCTION_NATIVE_PITR_EVIDENCE.json'), env = process.env) {
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED' }; }

  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA || env.OPSC_SOURCE_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.GITHUB_RUN_ID || '').trim();
  const expectedParentBranchId = String(env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const commitBound = /^[a-f0-9]{40}$/.test(expectedCommit || '') && normalizedSha(evidence.sourceCommit) === expectedCommit;
  const pipelineBound = PIPELINE_RE.test(expectedPipelineId) && String(evidence.pipelineId || '') === expectedPipelineId;
  const sourceBranchBound = /^[a-z0-9-]{8,80}$/.test(expectedParentBranchId)
    && String(evidence.sourceBranchId || '').trim() === expectedParentBranchId;
  const expectedDatabaseName = String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const contentIntegrity = evidence.contentIntegrity && typeof evidence.contentIntegrity === 'object'
    ? evidence.contentIntegrity
    : {};
  const restoreStartedAt = Date.parse(String(evidence.restoreStartedAt || ''));
  const restoreCompletedAt = Date.parse(String(evidence.restoreCompletedAt || ''));
  const targetTimestampMs = Date.parse(String(evidence.targetTimestampUtc || ''));
  const restoreDurationMs = Number(evidence.restoreDurationMs);
  const targetPointAgeAtCompletionMs = Number(evidence.targetPointAgeAtCompletionMs);
  const pitrCleanup = evidence.cleanup && typeof evidence.cleanup === 'object' ? evidence.cleanup : {};
  const comparisonBranchId = String(evidence.comparisonBranchId || '').trim();
  const pitrCleanupVerified = pitrCleanup.status === 'PASS'
    && pitrCleanup.restoredBranchDeleted === true
    && pitrCleanup.comparisonBranchDeleted === true
    && /^br-[a-z0-9-]{8,80}$/.test(comparisonBranchId)
    && comparisonBranchId !== String(evidence.restoredBranchId || '')
    && comparisonBranchId !== String(evidence.sourceBranchId || '');
  const pitrTableResults = Array.isArray(contentIntegrity.tableResults) ? contentIntegrity.tableResults : [];
  const seenPitrTables = new Set();
  const pitrTableContentValid = pitrTableResults.length >= 130 && pitrTableResults.every(row => {
    if (!row || typeof row !== 'object' || row.schema !== 'public') return false;
    const table = String(row.table || '');
    const sourceHash = String(row.sourceSha256 || '').toLowerCase();
    const restoredHash = String(row.restoredSha256 || '').toLowerCase();
    const sourceRows = Number(row.sourceRowCount);
    const restoredRows = Number(row.restoredRowCount);
    const valid = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(table)
      && !seenPitrTables.has(table)
      && row.status === 'PASS'
      && HASH_RE.test(sourceHash)
      && HASH_RE.test(restoredHash)
      && sourceHash === restoredHash
      && Number.isSafeInteger(sourceRows)
      && sourceRows >= 0
      && sourceRows === restoredRows;
    if (valid) seenPitrTables.add(table);
    return valid;
  });
  const pitrRowsCompared = pitrTableResults.reduce((total, row) => total + Number(row && row.sourceRowCount), 0);
  const pitrRlsExceptionTables = Array.isArray(contentIntegrity.rlsExceptionTables)
    ? contentIntegrity.rlsExceptionTables.map(value => String(value)).sort()
    : [];
  const pitrRlsExceptionsExact = JSON.stringify(pitrRlsExceptionTables) === JSON.stringify(['spatial_ref_sys']);
  const contentIntegrityValid = Boolean(
    contentIntegrity.status === 'PASS' &&
    contentIntegrity.algorithm === 'SHA-256' &&
    Number(contentIntegrity.tableCountCompared) >= 130 &&
    Number(contentIntegrity.tableCountCompared) === pitrTableResults.length &&
    Number(contentIntegrity.catalogTableCount) >= 136 &&
    pitrRlsExceptionsExact &&
    Number.isSafeInteger(Number(contentIntegrity.rowsCompared)) &&
    Number(contentIntegrity.rowsCompared) > 0 &&
    Number(contentIntegrity.rowsCompared) === pitrRowsCompared &&
    Number(contentIntegrity.mismatchCount) === 0 &&
    Number(contentIntegrity.rlsPolicyTableCount) >= 135 &&
    Number(contentIntegrity.rlsPolicyMismatchCount) === 0 &&
    Number(contentIntegrity.forceRlsMismatchCount) === 0 &&
    HASH_RE.test(String(contentIntegrity.sourceManifestSha256 || '')) &&
    HASH_RE.test(String(contentIntegrity.restoredManifestSha256 || '')) &&
    String(contentIntegrity.sourceManifestSha256).toLowerCase() === String(contentIntegrity.restoredManifestSha256).toLowerCase() &&
    pitrTableContentValid
  );
  const ok = evidence.schemaVersion === 'opscore.production-native-pitr.v2'
    && evidence.status === 'PASS'
    && evidence.environment === 'production'
    && evidence.mechanism === 'NEON_INSTANT_RESTORE_FROM_HISTORY'
    && evidence.dataIntegrity === 'PASS'
    && evidence.verificationScope === 'production-root-historical-branch-full-data-content-hash-and-rls-match'
    && expectedDatabaseName.length > 0
    && evidence.databaseName === expectedDatabaseName
    && contentIntegrityValid
    && Number.isFinite(targetTimestampMs)
    && Number.isFinite(restoreStartedAt)
    && Number.isFinite(restoreCompletedAt)
    && targetTimestampMs <= restoreStartedAt
    && restoreCompletedAt >= restoreStartedAt
    && restoreCompletedAt <= Date.now()
    && Number.isSafeInteger(restoreDurationMs)
    && restoreDurationMs === restoreCompletedAt - restoreStartedAt
    && Number.isSafeInteger(targetPointAgeAtCompletionMs)
    && targetPointAgeAtCompletionMs === restoreCompletedAt - targetTimestampMs
    && restoreDurationMs >= 0
    && targetPointAgeAtCompletionMs >= 0
    && /^br-[a-z0-9-]{8,80}$/.test(String(evidence.restoredBranchId || ''))
    && /^br-[a-z0-9-]{8,80}$/.test(String(evidence.sourceBranchId || ''))
    && evidence.restoredBranchId !== evidence.sourceBranchId
    && comparisonBranchId !== evidence.restoredBranchId
    && pitrCleanupVerified
    && HASH_RE.test(String(evidence.evidenceSha256 || ''))
    && (() => {
      const digestPayload = { ...evidence };
      delete digestPayload.evidenceSha256;
      const computedDigest = crypto.createHash('sha256').update(JSON.stringify(digestPayload), 'utf8').digest('hex');
      return computedDigest === String(evidence.evidenceSha256 || '').toLowerCase();
    })()
    && commitBound && pipelineBound && sourceBranchBound;
  if (!ok) return { status: 'NOT_VERIFIED' };
  return {
    status: 'PASS',
    environment: evidence.environment,
    mechanism: evidence.mechanism,
    dataIntegrity: evidence.dataIntegrity,
    targetTimestampUtc: evidence.targetTimestampUtc,
    restoredBranchId: evidence.restoredBranchId,
    comparisonBranchId,
    sourceBranchId: evidence.sourceBranchId,
    databaseName: evidence.databaseName || null,
    sourceCommit: normalizedSha(evidence.sourceCommit),
    pipelineId: String(evidence.pipelineId || ''),
    evidenceSha256: String(evidence.evidenceSha256),
    testedAt: evidence.testedAt || null,
    verificationScope: evidence.verificationScope || null,
    restoreDurationMs,
    targetPointAgeAtCompletionMs,
    cleanupVerified: pitrCleanupVerified,
    contentIntegrity: {
      status: contentIntegrity.status || 'NOT_VERIFIED',
      algorithm: contentIntegrity.algorithm || null,
      tableCountCompared: Number(contentIntegrity.tableCountCompared) || null,
      catalogTableCount: Number(contentIntegrity.catalogTableCount) || null,
      rowsCompared: Number(contentIntegrity.rowsCompared) || null,
      mismatchCount: Number(contentIntegrity.mismatchCount),
      rlsPolicyTableCount: Number(contentIntegrity.rlsPolicyTableCount) || null,
      rlsExceptionTables: pitrRlsExceptionTables,
      manifestMatched: contentIntegrityValid
    }
  };
}

function readReleaseArchiveAttestation(filePath = embeddedEvidencePath('RELEASE_ARCHIVE_ATTESTATION.json'), env = process.env) {
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { status: 'NOT_VERIFIED', reason: 'EVIDENCE_MISSING_OR_INVALID' }; }

  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA || env.OPSC_SOURCE_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.GITHUB_RUN_ID || '').trim();
  const packageSha = String(env.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const keyMaterial = String(env.OPSC_RELEASE_PACKAGE_ATTESTATION_KEY || '').trim();
  const signature = String(evidence.signature || '').trim().toLowerCase();

  const metadataBound = Boolean(
    evidence.schemaVersion === 'opscore.release-archive-attestation.v1' &&
    evidence.status === 'PASS' &&
    evidence.signatureAlgorithm === 'HMAC-SHA256' &&
    expectedCommit &&
    normalizedSha(evidence.sourceCommit) === expectedCommit &&
    PIPELINE_RE.test(expectedPipelineId) &&
    String(evidence.pipelineId || '') === expectedPipelineId &&
    HASH_RE.test(packageSha) &&
    HASH_RE.test(String(evidence.sha256 || '')) &&
    String(evidence.sha256).toLowerCase() === packageSha &&
    /^[a-f0-9]{64}$/.test(signature) &&
    keyMaterial.length >= 32
  );
  if (!metadataBound) return { status: 'NOT_VERIFIED', reason: 'ATTESTATION_METADATA_OR_KEY_INVALID' };

  const payload = [
    'opscore.release-archive-attestation.v1',
    expectedCommit,
    expectedPipelineId,
    packageSha
  ].join('|');
  const expectedSignature = crypto.createHmac('sha256', keyMaterial).update(payload).digest();
  const actualSignature = Buffer.from(signature, 'hex');
  const signatureVerified = actualSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(actualSignature, expectedSignature);
  if (!signatureVerified) return { status: 'NOT_VERIFIED', reason: 'HMAC_SIGNATURE_INVALID' };

  return {
    status: 'PASS',
    attestationVerified: true,
    signatureVerified: true,
    sourceCommit: expectedCommit,
    pipelineId: Number(expectedPipelineId),
    sha256: packageSha,
    signatureAlgorithm: 'HMAC-SHA256',
    attestedAt: evidence.attestedAt || null
  };
}

function readProductionSignedTenantRouteCoverageEvidence(
  filePath = embeddedEvidencePath('SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json'),
  env = process.env,
  manifestPath = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json'),
  inventoryPath = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json')
) {
  let evidence, manifest, inventory, manifestBytes, inventoryBytes;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { status: 'NOT_VERIFIED', testedRoutes: 0, failedRoutes: null, reason: 'EVIDENCE_MISSING_OR_INVALID' };
  }
  try {
    manifestBytes = fs.readFileSync(manifestPath);
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return { status: 'NOT_VERIFIED', testedRoutes: Array.isArray(evidence.routes) ? evidence.routes.length : 0, failedRoutes: null, reason: 'APPROVED_ROUTE_MANIFEST_MISSING_OR_INVALID' };
  }
  try {
    inventoryBytes = fs.readFileSync(inventoryPath);
    inventory = JSON.parse(inventoryBytes.toString('utf8'));
  } catch {
    return { status: 'NOT_VERIFIED', testedRoutes: Array.isArray(evidence.routes) ? evidence.routes.length : 0, failedRoutes: null, reason: 'API_ROUTE_INVENTORY_MISSING_OR_INVALID' };
  }

  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA || env.OPSC_SOURCE_COMMIT_SHA);
  const evidenceCommit = normalizedSha(evidence.sourceCommitHint);
  const commitBound = /^[a-f0-9]{40}$/.test(expectedCommit || '') && evidenceCommit === expectedCommit;
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.GITHUB_RUN_ID || '').trim();
  const pipelineBound = PIPELINE_RE.test(expectedPipelineId) && String(evidence.pipelineId || '') === expectedPipelineId;
  const expectedBranchId = String(env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const branchBound = /^[a-z0-9-]{8,80}$/.test(expectedBranchId) && String(evidence.parentBranchId || '') === expectedBranchId;
  const expectedDeploymentId = String(env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || '').trim();
  const deploymentIdBound = /^dpl_[A-Za-z0-9]+$/.test(expectedDeploymentId)
    && String(evidence.deploymentId || '').trim() === expectedDeploymentId;

  const inventorySha256 = crypto.createHash('sha256').update(inventoryBytes).digest('hex');
  const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  const inventoryRows = Array.isArray(inventory.routes) ? inventory.routes : [];
  const excludedRoutes = new Set([
    '/api/health',
    '/api/openapi.json',
    '/api/v1/billing/stripe/webhook',
    '/api/verify/database',
    '/api/verify/database-security',
    '/api/verify/deployment',
    '/metrics'
  ]);
  const eligibleInventoryKeys = new Set();
  for (const row of inventoryRows) {
    if (!row || typeof row !== 'object') continue;
    const method = String(row.method || '').toUpperCase();
    const pathname = String(row.route || '');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        || row.auth === 'public'
        || pathname.startsWith('/api/v1/auth/')
        || excludedRoutes.has(pathname)) continue;
    eligibleInventoryKeys.add(method + ' ' + pathname);
  }

  const manifestRows = Array.isArray(manifest.routes) ? manifest.routes : [];
  const expectedRoutes = new Map();
  let manifestRoutesValid = manifestRows.length === 67
    && Number(manifest.routeCount) === 67
    && inventoryRows.length > 0
    && Number(inventory.routeCount) === inventoryRows.length
    && manifest.routeInventorySha256 === inventorySha256;
  for (const row of manifestRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      manifestRoutesValid = false;
      continue;
    }
    const method = String(row.method || '').toUpperCase();
    const pathname = String(row.path || row.route || '');
    const operation = String(row.operation || '');
    const key = method + ' ' + pathname;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        || !pathname.startsWith('/api/')
        || pathname.includes('?')
        || !['read', 'write'].includes(operation)
        || !eligibleInventoryKeys.has(key)
        || !signedTenantContextPolicy.isSignedTenantContextRouteDefinition(method, pathname, operation)
        || expectedRoutes.has(key)) {
      manifestRoutesValid = false;
      continue;
    }
    expectedRoutes.set(key, operation);
  }
  const manifestBound = manifest.schemaVersion === 'opscore.signed-tenant-context-route-manifest.v1'
    && manifestRoutesValid
    && expectedRoutes.size === 67;
  const inventoryBound = manifest.routeInventorySha256 === inventorySha256
    && Number(inventory.routeCount) === inventoryRows.length;

  const routes = Array.isArray(evidence.routes) ? evidence.routes : [];
  const seen = new Set();
  let routeResultsValid = routes.length === 67;
  for (const route of routes) {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      routeResultsValid = false;
      continue;
    }
    const method = String(route.method || '').toUpperCase();
    const pathname = String(route.path || '');
    const operation = String(route.operation || '');
    const key = method + ' ' + pathname;
    const expectedOperation = expectedRoutes.get(key);
    const commonPass = expectedRoutes.has(key)
      && expectedOperation === operation
      && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && route.status === 'PASS'
      && route.signedContextBound === true
      && route.sessionBound === true
      && route.transactionBound === true
      && route.rawGucTamperDenied === true
      && !seen.has(key);
    const operationPass = operation === 'read'
      ? route.tenantARead === true && route.tenantBRead === true && route.crossTenantReadDenied === true
      : operation === 'write'
        ? route.tenantAWrite === true && route.tenantBWrite === true && route.crossTenantWriteDenied === true
        : false;
    if (!commonPass || !operationPass) routeResultsValid = false;
    seen.add(key);
  }

  const expectedDatabaseName = String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const exact = Boolean(expectedDatabaseName)
    && evidence.schemaVersion === 'opscore.signed-tenant-context-production-coverage.v1'
    && evidence.environment === 'production'
    && evidence.status === 'PASS'
    && evidence.databaseName === expectedDatabaseName
    && Number(evidence.expectedRouteCount) === 67
    && Number(evidence.coveredRouteCount) === 67
    && Number(evidence.failedRouteCount) === 0
    && evidence.routeManifestSha256 === manifestSha256
    && evidence.routeInventorySha256 === inventorySha256
    && manifestBound
    && inventoryBound
    && seen.size === 67
    && routeResultsValid
    && commitBound
    && pipelineBound
    && branchBound
    && deploymentIdBound
    && evidence.evidenceRebind == null;

  return {
    status: exact ? 'PASS' : 'NOT_VERIFIED',
    testedAt: evidence.testedAt || null,
    databaseName: evidence.databaseName || null,
    expectedRouteCount: Number(evidence.expectedRouteCount) || 0,
    coveredRouteCount: Number(evidence.coveredRouteCount) || 0,
    failedRouteCount: Number(evidence.failedRouteCount) || 0,
    testedRoutes: routes.length,
    commitBound,
    pipelineBound,
    parentBranchBound: branchBound,
    deploymentIdBound,
    manifestBound,
    inventoryBound,
    routeResultsValid
  };
}

function createPublicReleaseProof(env = process.env, now = () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath = embeddedEvidencePath('API_ROUTE_ACCEPTANCE_RESULT.json'), signedTenantRouteCoveragePath) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  // Vercel project environment values can survive deployments. Without the identity
  // artifact embedded in this exact bundle, CI and package variables are only staleable
  // claims and must not turn the public proof green.
  const proofEnv = { ...env };
  for (const key of [
    'OPSC_RELEASE_DEPLOYMENT_SOURCE',
    'OPSC_RELEASE_CI_COMMIT',
    'OPSC_RELEASE_CI_PIPELINE_ID',
    'OPSC_RELEASE_CI_REF',
    'OPSC_SOURCE_COMMIT_SHA',
    'OPSC_RELEASE_PACKAGE_SHA256',
    'OPSC_RELEASE_PACKAGE_COMMIT',
    'OPSC_RELEASE_TAG',
    'CI_COMMIT_SHA',
    'CI_PIPELINE_ID',
    'CI_COMMIT_TAG'
  ]) delete proofEnv[key];
  if (identity) {
    proofEnv.OPSC_RELEASE_DEPLOYMENT_SOURCE = identity.deploymentSource;
    proofEnv.OPSC_RELEASE_CI_COMMIT = identity.commitSha;
    proofEnv.OPSC_RELEASE_CI_PIPELINE_ID = identity.pipelineId;
    proofEnv.OPSC_RELEASE_CI_REF = identity.ref;
    proofEnv.OPSC_SOURCE_COMMIT_SHA = identity.commitSha;
    proofEnv.OPSC_RELEASE_PACKAGE_SHA256 = identity.packageSha256;
    proofEnv.OPSC_RELEASE_PACKAGE_COMMIT = identity.packageCommit;
  }
  const deployment = createDeploymentProof(proofEnv, now);
  const releaseTag = null;
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
  const sessionIsolation = readProductionSessionIsolationEvidence(undefined, proofEnv);
  const recoveryPoint = readProductionRecoveryPointEvidence(undefined, proofEnv);
  const signedTenantRouteCoverage = readProductionSignedTenantRouteCoverageEvidence(
    signedTenantRouteCoveragePath || undefined,
    proofEnv
  );
  const nativePitr = readProductionNativePitrEvidence(undefined, proofEnv);
  const isolationCertified = sessionIsolation.status === 'PASS'
    && recoveryPoint.status === 'PASS'
    && nativePitr.status === 'PASS'
    && signedTenantRouteCoverage.status === 'PASS'
    && acceptanceVerified
    && String(proofEnv.OPSC_PRODUCTION_ISOLATION_CERTIFICATION || '').trim().toUpperCase() === 'CERTIFIED';
  const releaseVerified = Boolean(
    identity && identity.deploymentSource === 'github-actions-cli' && identity.packageSha256 &&
    identity.packageCommit === sourceCommit &&
    ciVerified &&
    packageVerified &&
    deployment.status === 'identified' &&
    deployment.deployment.environment === 'production' &&
    deployment.source.ref === 'main' &&
    postgresHttpAcceptance.status === 'PASS' &&
    acceptanceVerified &&
    isolationCertified &&
    nativePitr.status === 'PASS' &&
    apiRouteAcceptance.status === 'PASS_PRODUCTION_FUNCTIONAL_SCOPE'
  );

  const sessionGate = sessionIsolation.status === 'PASS' ? 'PASS_PRODUCTION_PROBE_SCOPE' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED');
  const recoveryGate = recoveryPoint.status === 'PASS' ? 'PASS_PRODUCTION_FULL_DATA_RECOVERY_SCOPE' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED');
  const archiveAttestation = readReleaseArchiveAttestation(undefined, proofEnv);
  const pitrGate = nativePitr.status === 'PASS'
    ? 'PASS_PRODUCTION_FULL_DATA_PITR_SCOPE'
    : 'NOT_VERIFIED';
  const noteParts = [
    'Release evidence is bound to the source commit reported by the running Vercel deployment.'
  ];
  if (sessionIsolation.status === 'PASS') {
    noteParts.push('Production session probe scope passed for explicit dual-tenant asset creation, reads, event writes, cross-tenant denial, and cleanup. This does not replace the 67-route signed-session coverage gate.');
  } else {
    noteParts.push('Tenant session boundary remains test-scope unless production dual-tenant HTTP session evidence is present and activated.');
  }
  if (recoveryPoint.status === 'PASS') {
    noteParts.push('Production recovery branch content-integrity scope passed for the configured application database: complete public-table inventory, deterministic SHA-256 content manifests, per-table row counts, and zero mismatches. This remains distinct from RPO/RTO measurement.');
  } else {
    noteParts.push('Production recovery content integrity is NOT_VERIFIED. Core row-count-only evidence and disposable PostgreSQL logical restore in CI do not satisfy the Production full-data recovery gate.');
  }
  if (nativePitr.status === 'PASS') {
    noteParts.push('Production native Neon PITR passed the full-data content-hash and RLS comparison contract on the exact source branch, database, commit and pipeline.');
  } else {
    noteParts.push('Production native Neon PITR full-data verification is NOT_VERIFIED; historical schema/catalog-only probe evidence is insufficient.');
  }
  if (isolationCertified) {
    noteParts.push('productionIsolationCertification is CERTIFIED only when the v2 live probes, v2 recovery-point evidence, all 67 signed-session route results, same-commit/same-pipeline identity, acceptance proof, and the explicit certification flag all pass together.');
  } else {
    noteParts.push('productionIsolationCertification remains NOT_CERTIFIED until all 67 signed-session routes are verified in Production, in addition to the v2 live probes, exact-database recovery-point evidence, commit-bound acceptance, and certification flag.');
  }
  noteParts.push(signedTenantRouteCoverage.status === 'PASS' ? 'All 67 signed-session tenant routes passed the independent production route matrix on this exact commit and pipeline.' : 'Signed tenant-session coverage across all 67 required routes remains NOT_VERIFIED; this blocks production isolation certification and release verification.');
  if (apiRouteAcceptance.status === 'PASS_PRODUCTION_FUNCTIONAL_SCOPE') {
    noteParts.push('Full API route and business-flow acceptance passed against the exact Production deployment and PostgreSQL database, with source commit, pipeline, deployment identity, route inventory and flow inventory bound together.');
  } else {
    noteParts.push('Full Production PostgreSQL HTTP route and business-flow acceptance is NOT_VERIFIED. SQLite route-contract evidence (PASS_CONTRACT_SCOPE), missing evidence, Preview evidence, or evidence for another deployment cannot satisfy this release gate.');
  }
  noteParts.push('Buyer residuals remain explicitly disclosed: mobile store artifacts, native-speaker translation review, and licensed maps/road-routing are REMAINING_BUYER; these do not invalidate the seller-reference technical release proof and do not authorize buyer use or distribution.');
  const releaseNote = noteParts.join(' ');

  return {
    schemaVersion: 'opscore.public-release-proof.v2',
    product: 'OpsCore',
    version: '0.11.62',
    releaseTag,
    sourceCommitIdentitySource: identity ? 'github-actions-cli-assertion' : 'unverified',
    status: releaseVerified ? 'PASS' : 'UNVERIFIED',
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
      mobileStoreArtifacts: 'REMAINING_BUYER',
      nativeTranslationReview: 'REMAINING_BUYER',
      licensedStreetMap: 'REMAINING_BUYER',
      livePostgresRls: ciVerified ? 'PASS_TEST_SCOPE' : 'UNVERIFIED',
      productionSessionTenantBoundary: sessionGate,
      productionRecoveryBundle: recoveryGate,
      signedTenantSessionRouteCoverage: signedTenantRouteCoverage.status === 'PASS' ? 'PASS_PRODUCTION_ROUTE_SCOPE' : 'NOT_VERIFIED',
      tenantRouteSecurityCoverage: acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED',
      functionalApiRouteAcceptance: apiRouteAcceptance.status,
      neonPointInTimeRecovery: pitrGate,
      productionIsolationCertification: isolationCertified ? 'CERTIFIED' : 'NOT_CERTIFIED',
      postgresHttpAcceptance: postgresHttpAcceptance.status
    },
    productionAcceptance: {
      status: acceptanceVerified ? 'PASS' : 'NOT_VERIFIED',
      commitSha: acceptanceVerified ? productionAcceptance.sourceCommit : null,
      pipelineId: acceptanceVerified ? productionAcceptance.pipelineId : null,
      checkedAt: acceptanceVerified ? productionAcceptance.testedAt : null,
      evidenceSha256: acceptanceVerified ? productionAcceptance.evidenceSha256 : null,
      evidenceNote: acceptanceVerified ? (
        sessionIsolation.status === 'PASS' && recoveryPoint.status === 'PASS'
          ? 'SHA-256 was recomputed and matched. CI acceptance remains read-only/test-scoped for disposable PostgreSQL; production dual-tenant HTTP session isolation and branch recovery-point parity were separately verified and bound as production-scope evidence.'
          : 'SHA-256 was recomputed and matched. Production DB checks were read-only; tenant/API tests and logical restore were run on disposable PostgreSQL 18 CI. This is not production tenant certification or Neon PITR.'
      ) : null
    },
    postgresHttpAcceptance,
    signedTenantRouteCoverage,
    buyerResiduals: {
      status: 'DISCLOSED',
      count: BUYER_RESIDUALS.length,
      items: BUYER_RESIDUALS
    },
    packageFingerprint: {
      algorithm: 'SHA-256',
      status: packageVerified ? 'PUBLISHED' : 'UNVERIFIED',
      value: packageVerified ? packageSha : null,
      sourceCommit: packageVerified ? packageCommit : null
    },
    productionPitrEvidence: nativePitr.status === 'PASS' ? nativePitr : undefined,
    releaseArchiveAttestation: archiveAttestation.status === 'PASS' ? archiveAttestation : undefined,
    checkedAt: now().toISOString(),
    note: releaseNote
  };
};

function hasVerifiedProductionRelease(env = process.env, identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath = embeddedEvidencePath('API_ROUTE_ACCEPTANCE_RESULT.json'), signedTenantRouteCoveragePath) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  if (!identity) return false;
  const proof = createPublicReleaseProof(env, () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath, apiRouteAcceptancePath, signedTenantRouteCoveragePath);
  return proof.status === 'PASS' &&
    proof.ci.status === 'PASS' &&
    proof.packageFingerprint.status === 'PUBLISHED' &&
    proof.deployment.status === 'identified' &&
    proof.deployment.environment === 'production' &&
    proof.deployment.ref === 'main' &&
    proof.sourceCommitIdentitySource === 'github-actions-cli-assertion' &&
    proof.postgresHttpAcceptance.status === 'PASS' &&
    proof.productionAcceptance.status === 'PASS' &&
    ['PASS_TEST_SCOPE', 'PASS_PRODUCTION_PROBE_SCOPE'].includes(proof.gates.productionSessionTenantBoundary) &&
    proof.gates.productionRecoveryBundle === 'PASS_PRODUCTION_FULL_DATA_RECOVERY_SCOPE' &&
    proof.gates.signedTenantSessionRouteCoverage === 'PASS_PRODUCTION_ROUTE_SCOPE' &&
    proof.gates.productionIsolationCertification === 'CERTIFIED' &&
    proof.gates.tenantRouteSecurityCoverage === 'PASS_TEST_SCOPE' &&
    proof.gates.functionalApiRouteAcceptance === 'PASS_PRODUCTION_FUNCTIONAL_SCOPE' &&
    proof.gates.neonPointInTimeRecovery === 'PASS_PRODUCTION_FULL_DATA_PITR_SCOPE';
}

function readCurrentApiRouteAcceptance(env = process.env, filePath = embeddedEvidencePath('API_ROUTE_ACCEPTANCE_RESULT.json')) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      status: 'NOT_VERIFIED',
      scope: 'MISSING_OR_UNREADABLE_EVIDENCE',
      testedAt: null,
      evidenceCommit: null,
      evidencePipelineId: null,
      deploymentId: null,
      testedRoutes: null,
      testedFlows: null,
      failed: null
    };
  }

  const status = String(evidence.status || '');
  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.CI_PIPELINE_ID || '').trim();
  const evidenceCommit = normalizedSha(evidence.commitSha);
  const evidencePipelineId = String(evidence.pipelineId || '').trim();
  const testedRoutes = Number(evidence.testedRoutes);
  const inventoryRouteCount = Number(evidence.inventoryRouteCount);
  const passed = Number(evidence.passed);
  const failed = Number(evidence.failed);

  // Legacy SQLite route checks are contract evidence only. They must never be
  // treated as live PostgreSQL functional acceptance for a seller Production release.
  const contractMatch = Boolean(
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
    failed === 0
  );
  if (contractMatch) {
    return {
      status: 'PASS_CONTRACT_SCOPE',
      scope: 'SQLITE_ROUTE_CONTRACT_ONLY',
      testedAt: String(evidence.generatedAt || ''),
      evidenceCommit,
      evidencePipelineId,
      deploymentId: null,
      testedRoutes,
      testedFlows: null,
      failed
    };
  }

  const expectedDeploymentId = String(
    env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || ''
  ).trim();
  const runtimeDeploymentId = String(env.VERCEL_DEPLOYMENT_ID || '').trim();
  const expectedDatabaseName = String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const businessFlows = evidence.businessFlowCoverage && typeof evidence.businessFlowCoverage === 'object'
    ? evidence.businessFlowCoverage
    : {};
  const testedFlows = Number(businessFlows.testedFlows);
  const inventoryFlowCount = Number(businessFlows.inventoryFlowCount);
  const passedFlows = Number(businessFlows.passed);
  const failedFlows = Number(businessFlows.failed);
  const inventorySha256 = String(evidence.inventorySha256 || '').trim().toLowerCase();
  const testedAt = String(evidence.testedAt || '').trim();
  const testedAtMs = testedAt ? Date.parse(testedAt) : NaN;
  const productionMatch = Boolean(
    evidence.schemaVersion === 'opscore.api-route-acceptance.v2' &&
    evidence.engine === 'postgres' &&
    evidence.environment === 'production' &&
    evidence.verificationScope === 'PRODUCTION_POSTGRESQL_HTTP_FULL_ROUTE_AND_BUSINESS_FLOW_INVENTORY' &&
    status === 'PASS' &&
    expectedCommit &&
    evidenceCommit === expectedCommit &&
    PIPELINE_RE.test(expectedPipelineId) &&
    evidencePipelineId === expectedPipelineId &&
    /^dpl_[A-Za-z0-9]+$/.test(expectedDeploymentId) &&
    evidence.deploymentId === expectedDeploymentId &&
    (!runtimeDeploymentId || evidence.deploymentId === runtimeDeploymentId) &&
    expectedDatabaseName.length > 0 &&
    evidence.databaseName === expectedDatabaseName &&
    Number.isSafeInteger(testedRoutes) &&
    testedRoutes >= 300 &&
    testedRoutes === inventoryRouteCount &&
    passed === testedRoutes &&
    failed === 0 &&
    HASH_RE.test(inventorySha256) &&
    businessFlows.status === 'PASS' &&
    Number.isSafeInteger(testedFlows) &&
    testedFlows > 0 &&
    testedFlows === inventoryFlowCount &&
    passedFlows === testedFlows &&
    failedFlows === 0 &&
    Number.isFinite(testedAtMs) &&
    testedAtMs <= Date.now()
  );

  return {
    status: productionMatch ? 'PASS_PRODUCTION_FUNCTIONAL_SCOPE' : 'NOT_VERIFIED',
    scope: productionMatch ? evidence.verificationScope : 'PRODUCTION_FULL_FUNCTIONAL_SCOPE_NOT_PROVEN',
    testedAt: productionMatch ? new Date(testedAtMs).toISOString() : null,
    evidenceCommit: productionMatch ? evidenceCommit : null,
    evidencePipelineId: productionMatch ? evidencePipelineId : null,
    deploymentId: productionMatch ? evidence.deploymentId : null,
    databaseName: productionMatch ? evidence.databaseName : null,
    inventorySha256: productionMatch ? inventorySha256 : null,
    testedRoutes: productionMatch ? testedRoutes : null,
    testedFlows: productionMatch ? testedFlows : null,
    failed: productionMatch ? failed : null
  };
}

module.exports = { createPublicReleaseProof, hasVerifiedProductionRelease, readEmbeddedBuildIdentity, readProductionAcceptanceEvidence, readProductionSessionIsolationEvidence, readProductionRecoveryPointEvidence, readProductionNativePitrEvidence, readReleaseArchiveAttestation, readProductionSignedTenantRouteCoverageEvidence };

