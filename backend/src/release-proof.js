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
    && evidence.cleanup.recoveryBranchDeleted === true;
  const scopeValid = Boolean(expectedDatabaseName)
    && evidence.schemaVersion === 'opscore.production-recovery-point.v3'
    && evidence.databaseName === expectedDatabaseName
    && evidence.verificationScope === 'branch-clone-public-table-count-and-core-tenant-row-counts-only'
    && evidence.coreTenantTableRowCountsMatch === true
    && Number(evidence.tableCountCompared) >= 130
    && Number(evidence.mismatchCount) === 0
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
  const isolationCertified = sessionIsolation.status === 'PASS'
    && recoveryPoint.status === 'PASS'
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
    isolationCertified
  );

  const sessionGate = sessionIsolation.status === 'PASS' ? 'PASS_PRODUCTION_PROBE_SCOPE' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED');
  const recoveryGate = recoveryPoint.status === 'PASS' ? 'PASS_PRODUCTION_ROW_COUNT_SCOPE' : (acceptanceVerified ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED');
  const pitrGate = recoveryPoint.status === 'PASS' ? 'PASS_BRANCH_POINT' : 'NOT_VERIFIED';
  const noteParts = [
    'Release evidence is bound to the source commit reported by the running Vercel deployment.'
  ];
  if (sessionIsolation.status === 'PASS') {
    noteParts.push('Production session probe scope passed for explicit dual-tenant asset creation, reads, event writes, cross-tenant denial, and cleanup. This does not replace the 67-route signed-session coverage gate.');
  } else {
    noteParts.push('Tenant session boundary remains test-scope unless production dual-tenant HTTP session evidence is present and activated.');
  }
  if (recoveryPoint.status === 'PASS') {
    noteParts.push('Production recovery-point row-count scope passed for the configured application database. It is not row-content equality, PITR, or full RPO/RTO certification.');
  } else {
    noteParts.push('PostgreSQL logical restore in CI remains test-scope only until a production recovery-point evidence file validates.');
  }
  if (isolationCertified) {
    noteParts.push('productionIsolationCertification is CERTIFIED only when the v2 live probes, v2 recovery-point evidence, all 67 signed-session route results, same-commit/same-pipeline identity, acceptance proof, and the explicit certification flag all pass together.');
  } else {
    noteParts.push('productionIsolationCertification remains NOT_CERTIFIED until all 67 signed-session routes are verified in Production, in addition to the v2 live probes, exact-database recovery-point evidence, commit-bound acceptance, and certification flag.');
  }
  noteParts.push(signedTenantRouteCoverage.status === 'PASS' ? 'All 67 signed-session tenant routes passed the independent production route matrix on this exact commit and pipeline.' : 'Signed tenant-session coverage across all 67 required routes remains NOT_VERIFIED; this blocks production isolation certification and release verification.');
  noteParts.push('Tenant route security coverage and functional API route acceptance remain separately scoped (CI fixtures / contract-scope) and are not full business-flow certification.');
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
    ['PASS_TEST_SCOPE', 'PASS_PRODUCTION_ROW_COUNT_SCOPE'].includes(proof.gates.productionRecoveryBundle) &&
    proof.gates.signedTenantSessionRouteCoverage === 'PASS_PRODUCTION_ROUTE_SCOPE' &&
    proof.gates.productionIsolationCertification === 'CERTIFIED' &&
    proof.gates.tenantRouteSecurityCoverage === 'PASS_TEST_SCOPE' &&
    ['NOT_VERIFIED', 'PASS_CONTRACT_SCOPE'].includes(proof.gates.functionalApiRouteAcceptance) &&
    ['NOT_VERIFIED', 'PASS_BRANCH_POINT'].includes(proof.gates.neonPointInTimeRecovery);
}

function readCurrentApiRouteAcceptance(env = process.env, filePath = embeddedEvidencePath('API_ROUTE_ACCEPTANCE_RESULT.json')) {
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

module.exports = { createPublicReleaseProof, hasVerifiedProductionRelease, readEmbeddedBuildIdentity, readProductionAcceptanceEvidence, readProductionSessionIsolationEvidence, readProductionRecoveryPointEvidence, readProductionSignedTenantRouteCoverageEvidence };

