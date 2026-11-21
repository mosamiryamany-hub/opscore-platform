'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  readProductionDeploymentIdentity
} = require('./lib/production-deployment-identity');
const {
  EXPECTED_ROUTE_COUNT,
  BUSINESS_FLOW_INVENTORY,
  buildUnknownRoutePath,
  buildRouteProbePlan,
  materializeRoutePath,
  probeContractForRoute,
  evaluateRouteObservation,
  sha256
} = require('../src/production-api-route-acceptance-policy');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.join(BACKEND_ROOT, 'docs', 'API_INVENTORY.json');
const CANDIDATE_RESULT_PATH = path.join(BACKEND_ROOT, 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_CANDIDATE_RESULT.json');
const SIGNED_ROUTE_COVERAGE_PATH = path.join(BACKEND_ROOT, 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json');
const SESSION_ISOLATION_PATH = path.join(BACKEND_ROOT, 'docs', 'verification', 'PRODUCTION_SESSION_ISOLATION.json');
const DEFAULT_RESULT_PATH = path.join(BACKEND_ROOT, 'docs', 'verification', 'API_ROUTE_ACCEPTANCE_RESULT.json');
const RESULT_SCHEMA = 'opscore.api-route-acceptance.v2';
const VERIFICATION_SCOPE = 'PRODUCTION_POSTGRESQL_HTTP_FULL_ROUTE_AND_BUSINESS_FLOW_INVENTORY';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(code) {
  throw new Error(code);
}

function exactCommit(value) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''));
}

function exactPipeline(value) {
  return /^[1-9][0-9]{0,14}$/.test(String(value || ''));
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    fail(label + '_MISSING_OR_INVALID');
  }
}

function requireIdentity(env) {
  const expected = {
    commit: String(env.GITHUB_SHA || env.OPSC_EXPECTED_PRODUCTION_COMMIT_SHA || '').trim().toLowerCase(),
    pipelineId: String(env.GITHUB_RUN_ID || '').trim(),
    deploymentId: String(env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || '').trim(),
    databaseName: String(env.OPSC_PRODUCTION_DATABASE_NAME || '').trim(),
    parentBranchId: String(env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim(),
    origin: String(env.OPSC_PRODUCTION_HTTP_BASE || '').trim(),
    probeToken: String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || '').trim(),
    oidcToken: String(env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim()
  };
  if (!exactCommit(expected.commit) || !exactPipeline(expected.pipelineId)
      || !/^dpl_[A-Za-z0-9]+$/.test(expected.deploymentId)
      || expected.databaseName !== 'opscore_acceptance'
      || !/^[a-z0-9-]{8,80}$/.test(expected.parentBranchId)
      || !expected.probeToken || expected.probeToken.length < 32
      || expected.oidcToken.split('.').length !== 3) {
    fail('API_ROUTE_ACCEPTANCE_RUNTIME_IDENTITY_INVALID');
  }
  if (String(env.OPSC_PRODUCTION_CANDIDATE_MODE || '').toLowerCase() !== 'true'
      || String(env.OPSC_PRODUCTION_HOLD || '').toLowerCase() !== 'true'
      || String(env.OPSC_RELEASE_VERIFIED || '').toLowerCase() !== 'false'
      || String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED || '').toLowerCase() !== 'true') {
    fail('API_ROUTE_ACCEPTANCE_CANDIDATE_HOLD_NOT_ACTIVE');
  }
  return expected;
}

function zeroResidue(residue) {
  return Boolean(residue && typeof residue === 'object' && !Array.isArray(residue)
    && Object.keys(residue).length > 0
    && Object.values(residue).every(value => Number.isFinite(Number(value)) && Number(value) === 0));
}

function validateCandidateEvidence(candidate, signedCoverage, session, expected) {
  if (!candidate || candidate.schemaVersion !== 'opscore.signed-tenant-context-ci-proof.v1'
      || candidate.status !== 'PASS'
      || candidate.cleanup?.status !== 'PASS'
      || !zeroResidue(candidate.cleanup && candidate.cleanup.residue)) {
    fail('API_ROUTE_ACCEPTANCE_CANDIDATE_FIXTURE_CLEANUP_NOT_PASS');
  }
  const runtime = candidate.candidateRuntimeIdentity || {};
  const runtimeRole = runtime.runtimeRole || {};
  if (runtime.deploymentId !== expected.deploymentId
      || String(runtime.sourceCommit || '').toLowerCase() !== expected.commit
      || String(runtime.pipelineId || '') !== expected.pipelineId
      || runtime.sourceRef !== 'main'
      || runtime.environment !== 'production'
      || runtime.databaseName !== expected.databaseName
      || runtime.currentUser !== 'opscore_runtime'
      || runtime.sessionUser !== 'opscore_runtime'
      || runtime.readOnlyInspection !== true
      || Number(runtime.writeOperations) !== 0
      || runtime.holdActive !== true
      || runtime.releaseVerified !== false
      || runtime.releaseProofVerified !== false
      || runtimeRole.role_name !== 'opscore_runtime'
      || runtimeRole.role_exists !== true
      || runtimeRole.can_login !== true
      || runtimeRole.superuser !== false
      || runtimeRole.bypass_rls !== false
      || runtimeRole.create_role !== false
      || runtimeRole.create_db !== false
      || runtimeRole.elevated_role_membership !== false) {
    fail('API_ROUTE_ACCEPTANCE_CANDIDATE_RUNTIME_IDENTITY_MISMATCH');
  }

  if (!signedCoverage
      || signedCoverage.schemaVersion !== 'opscore.signed-tenant-context-production-coverage.v1'
      || signedCoverage.evidenceClass !== 'LIVE_PRODUCTION_CANDIDATE_ROUTE_PROBES'
      || signedCoverage.environment !== 'production'
      || signedCoverage.status !== 'PASS'
      || signedCoverage.databaseName !== expected.databaseName
      || signedCoverage.sourceCommitHint !== expected.commit
      || String(signedCoverage.pipelineId || '') !== expected.pipelineId
      || signedCoverage.parentBranchId !== expected.parentBranchId
      || signedCoverage.deploymentId !== expected.deploymentId
      || Number(signedCoverage.expectedRouteCount) !== 67
      || Number(signedCoverage.coveredRouteCount) !== 67
      || Number(signedCoverage.failedRouteCount) !== 0
      || signedCoverage.evidenceRebind != null
      || !Array.isArray(signedCoverage.routes)
      || signedCoverage.routes.length !== 67) {
    fail('API_ROUTE_ACCEPTANCE_SIGNED_ROUTE_COVERAGE_IDENTITY_INVALID');
  }

  const sessionChecks = session && session.checks || {};
  const requiredSessionChecks = [
    'dualLogin', 'tenantPrincipalBinding', 'ownAssetCreate', 'ownAssetRead',
    'tenantListIsolation', 'crossTenantAssetReadDenied', 'ownAssetEventWrite',
    'crossTenantWriteDenied', 'unauthenticatedDenied', 'cleanupComplete'
  ];
  const cleanup = session && session.cleanup || {};
  const cleanupDetails = cleanup.details || {};
  if (!session
      || session.schemaVersion !== 'opscore.production-session-isolation.v3'
      || session.status !== 'PASS'
      || session.environment !== 'production'
      || session.databaseName !== expected.databaseName
      || session.databaseBranchId !== expected.parentBranchId
      || session.parentBranchId !== expected.parentBranchId
      || session.sourceCommitHint !== expected.commit
      || String(session.pipelineId || '') !== expected.pipelineId
      || session.deploymentId !== expected.deploymentId
      || session.evidenceRebind != null
      || requiredSessionChecks.some(key => sessionChecks[key] !== 'PASS')
      || cleanup.status !== 'PASS'
      || Number(cleanupDetails.organizationsRetained) !== 2
      || Number(cleanupDetails.disabledUsers) !== 2
      || Number(cleanupDetails.sessionsRemaining) !== 0
      || Number(cleanupDetails.membershipsRemaining) !== 0
      || Number(cleanupDetails.assetsRemaining) !== 0
      || Number(cleanupDetails.assetEventsRemaining) !== 0) {
    fail('API_ROUTE_ACCEPTANCE_SESSION_ISOLATION_OR_CLEANUP_INVALID');
  }
  if (String(session.collectorCommit || '').toLowerCase() !== expected.commit
      || String(session.collectorPipelineId || '') !== expected.pipelineId) {
    fail('API_ROUTE_ACCEPTANCE_SESSION_COLLECTOR_IDENTITY_MISMATCH');
  }

  const candidateBytes = fs.readFileSync(CANDIDATE_RESULT_PATH);
  const signedBytes = fs.readFileSync(SIGNED_ROUTE_COVERAGE_PATH);
  const sessionBytes = fs.readFileSync(SESSION_ISOLATION_PATH);
  return {
    signedRoutes: signedCoverage.routes,
    candidateCleanupSha256: sha256(candidateBytes),
    signedRouteEvidenceSha256: sha256(signedBytes),
    sessionIsolationEvidenceSha256: sha256(sessionBytes)
  };
}

function routeProofMap(routes) {
  const map = new Map();
  for (const row of routes) {
    const key = String(row.method || '').toUpperCase() + ' ' + String(row.path || '');
    if (map.has(key)) fail('API_ROUTE_ACCEPTANCE_SIGNED_ROUTE_DUPLICATE:' + key);
    map.set(key, row);
  }
  return map;
}

function flowRowPasses(routeMap, routeKeys) {
  for (const key of routeKeys) {
    const row = routeMap.get(key);
    if (!row || row.status !== 'PASS'
        || row.signedContextBound !== true
        || row.sessionBound !== true
        || row.transactionBound !== true
        || row.rawGucTamperDenied !== true) return false;
    if (row.operation === 'read') {
      if (row.tenantARead !== true || row.tenantBRead !== true || row.crossTenantReadDenied !== true) return false;
    } else if (row.operation === 'write') {
      if (row.tenantAWrite !== true || row.tenantBWrite !== true || row.crossTenantWriteDenied !== true) return false;
    } else {
      return false;
    }
  }
  return true;
}

function buildBusinessFlowCoverage(routeMap, candidateEvidence, nowIso) {
  const flows = [];
  for (const flow of BUSINESS_FLOW_INVENTORY) {
    const passes = flowRowPasses(routeMap, flow.routeKeys);
    const flowRecord = {
      id: flow.id,
      status: passes ? 'PASS' : 'FAIL',
      routeKeys: flow.routeKeys,
      tenantAStatus: passes ? 'PASS' : 'FAIL',
      tenantBStatus: passes ? 'PASS' : 'FAIL',
      crossTenantDenialStatus: passes ? 'PASS' : 'FAIL',
      cleanupStatus: candidateEvidence.candidateCleanupSha256 ? 'PASS' : 'FAIL',
      signedRouteEvidenceSha256: candidateEvidence.signedRouteEvidenceSha256,
      candidateFixtureEvidenceSha256: candidateEvidence.candidateCleanupSha256
    };
    if (flow.id === 'same-tenant-asset-event-lifecycle') {
      flowRecord.cleanupStatus = candidateEvidence.sessionIsolationEvidenceSha256 ? 'PASS' : 'FAIL';
      flowRecord.sessionIsolationEvidenceSha256 = candidateEvidence.sessionIsolationEvidenceSha256;
    }
    flows.push(flowRecord);
  }
  const passed = flows.filter(flow => flow.status === 'PASS' && flow.cleanupStatus === 'PASS').length;
  return {
    status: passed === BUSINESS_FLOW_INVENTORY.length ? 'PASS' : 'FAIL',
    testedFlows: flows.length,
    inventoryFlowCount: BUSINESS_FLOW_INVENTORY.length,
    passed,
    failed: flows.length - passed,
    businessFlowInventorySha256: require('../src/production-api-route-acceptance-policy').businessFlowInventorySha256(),
    flows,
    testedAt: nowIso
  };
}

function responseCode(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const code = payload.error && payload.error.code || payload.code || null;
  return code == null ? null : String(code).slice(0, 96);
}

async function requestJson(fetchImpl, url, method, body, headers) {
  const requestHeaders = { ...headers, accept: 'application/json', 'cache-control': 'no-store' };
  const options = {
    method,
    headers: requestHeaders,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  };
  if (body !== null && body !== undefined) {
    options.body = JSON.stringify(body);
    requestHeaders['content-type'] = 'application/json';
  }
  const response = await fetchImpl(url, options);
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) fail('API_ROUTE_ACCEPTANCE_RESPONSE_TOO_LARGE');
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  return {
    statusCode: response.status,
    contentType: String(response.headers.get('content-type') || ''),
    responseCode: responseCode(payload),
    bodyAssertion: Boolean(payload && payload.loggedOut === true)
  };
}

async function wait(ms) {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRateLimitRetry(fetchImpl, url, method, body, headers, pause) {
  let result = await requestJson(fetchImpl, url, method, body, headers);
  if (result.statusCode === 429) {
    await pause(65000);
    result = await requestJson(fetchImpl, url, method, body, headers);
  }
  return result;
}

async function runCollector(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const pause = options.pause || wait;
  const now = options.now || (() => new Date());
  const expected = requireIdentity(env);
  const base = expected.origin.replace(/\/+$/, '');
  const identity = await readProductionDeploymentIdentity(base, expected.commit, fetchImpl, { env });
  if (identity.deploymentId !== expected.deploymentId
      || identity.commitSha !== expected.commit
      || identity.ciPipelineId !== expected.pipelineId
      || identity.ref !== 'main'
      || identity.environment !== 'production') {
    fail('API_ROUTE_ACCEPTANCE_DEPLOYMENT_IDENTITY_MISMATCH');
  }

  const inventoryBytes = fs.readFileSync(options.inventoryPath || INVENTORY_PATH);
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const plan = buildRouteProbePlan(inventory).map((item, index) => ({
    ...item,
    path: materializeRoutePath(item.route, expected.commit, index)
  }));

  const candidate = readJson(options.candidateResultPath || CANDIDATE_RESULT_PATH, 'SIGNED_TENANT_CONTEXT_CANDIDATE_RESULT');
  const signedCoverage = readJson(options.signedCoveragePath || SIGNED_ROUTE_COVERAGE_PATH, 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE');
  const session = readJson(options.sessionIsolationPath || SESSION_ISOLATION_PATH, 'PRODUCTION_SESSION_ISOLATION');
  const candidateEvidence = validateCandidateEvidence(candidate, signedCoverage, session, expected);
  const routeMap = routeProofMap(candidateEvidence.signedRoutes);

  const headers = {
    'x-opscore-signed-context-probe': expected.probeToken,
    'x-opscore-trusted-oidc-idp-token': expected.oidcToken,
    'x-vercel-trusted-oidc-idp-token': expected.oidcToken,
    'user-agent': 'opscore-production-api-route-acceptance-v2'
  };
  const unknownPath = buildUnknownRoutePath(expected.commit);
  const unknown = await requestWithRateLimitRetry(
    fetchImpl, base + unknownPath, 'GET', null, headers, pause
  );
  if (unknown.statusCode !== 404 || !unknown.responseCode) {
    fail('API_ROUTE_ACCEPTANCE_UNKNOWN_ROUTE_MARKER_NOT_ESTABLISHED');
  }

  const results = [];
  const spacingMs = Number.isSafeInteger(Number(env.OPSC_API_ROUTE_PROBE_SPACING_MS))
    ? Math.max(250, Math.min(5000, Number(env.OPSC_API_ROUTE_PROBE_SPACING_MS)))
    : 1000;
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const contract = item.contract;
    const observation = await requestWithRateLimitRetry(
      fetchImpl,
      base + item.path,
      item.method,
      contract.body,
      headers,
      pause
    );
    const verdict = evaluateRouteObservation(item, {
      ...observation,
      probeContract: contract.id
    }, unknown);
    results.push({
      method: item.method,
      route: item.route,
      path: item.path,
      auth: item.auth,
      probeContract: contract.id,
      statusCode: observation.statusCode,
      contentType: observation.contentType,
      responseCode: observation.responseCode,
      bodyAssertion: observation.bodyAssertion,
      testedAt: now().toISOString(),
      verdict: verdict.ok ? 'PASS' : 'FAIL',
      reason: verdict.reason
    });
    if (index < plan.length - 1) await pause(spacingMs);
  }

  const flowCoverage = buildBusinessFlowCoverage(routeMap, candidateEvidence, now().toISOString());
  const passed = results.filter(row => row.verdict === 'PASS').length;
  const failed = results.length - passed;
  const report = {
    schemaVersion: RESULT_SCHEMA,
    engine: 'postgres',
    environment: 'production',
    verificationScope: VERIFICATION_SCOPE,
    status: passed === EXPECTED_ROUTE_COUNT && results.length === EXPECTED_ROUTE_COUNT
      && flowCoverage.status === 'PASS' ? 'PASS' : 'FAIL',
    testedAt: now().toISOString(),
    commitSha: expected.commit,
    pipelineId: expected.pipelineId,
    deploymentId: expected.deploymentId,
    databaseName: expected.databaseName,
    databaseBranchId: expected.parentBranchId,
    inventorySource: 'backend/docs/API_INVENTORY.json',
    inventorySha256: sha256(inventoryBytes),
    testedRoutes: results.length,
    inventoryRouteCount: EXPECTED_ROUTE_COUNT,
    passed,
    failed,
    unknownRouteProbe: {
      path: unknownPath,
      statusCode: unknown.statusCode,
      responseCode: unknown.responseCode
    },
    routes: results,
    businessFlowCoverage: flowCoverage,
    cleanup: {
      status: candidate.cleanup.status === 'PASS'
        && session.cleanup && session.cleanup.status === 'PASS'
        ? 'PASS' : 'FAIL',
      candidateFixtureCleanup: candidate.cleanup.status,
      candidateResidue: candidate.cleanup.residue,
      productionSessionCleanup: session.cleanup && session.cleanup.status,
      retainedDisabledAuditPrincipals: Number(session.cleanup?.details?.organizationsRetained) === 2
        && Number(session.cleanup?.details?.disabledUsers) === 2,
      mutableSessionResidueZero: Number(session.cleanup?.details?.sessionsRemaining) === 0
        && Number(session.cleanup?.details?.membershipsRemaining) === 0,
      mutableAssetResidueZero: Number(session.cleanup?.details?.assetsRemaining) === 0
        && Number(session.cleanup?.details?.assetEventsRemaining) === 0
    },
    failureReasons: results.filter(row => row.verdict !== 'PASS')
      .slice(0, 50).map(row => ({ key: row.method + ' ' + row.route, statusCode: row.statusCode, responseCode: row.responseCode, reason: row.reason }))
  };
  return report;
}

function writeEvidence(filePath, evidence) {
  const absolute = path.resolve(filePath);
  const directory = path.dirname(absolute);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = absolute + '.tmp-' + process.pid + '-' + crypto.randomUUID();
  try {
    fs.writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, absolute);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
}

async function main() {
  const outputPath = process.env.OPSC_API_ROUTE_ACCEPTANCE_RESULT_FILE || DEFAULT_RESULT_PATH;
  try {
    const report = await runCollector();
    writeEvidence(outputPath, report);
    process.stdout.write(JSON.stringify({
      status: report.status,
      testedRoutes: report.testedRoutes,
      passed: report.passed,
      failed: report.failed,
      testedFlows: report.businessFlowCoverage.testedFlows,
      databaseName: report.databaseName,
      commitSha: report.commitSha,
      pipelineId: report.pipelineId,
      deploymentId: report.deploymentId
    }) + '\n');
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const failure = {
      schemaVersion: RESULT_SCHEMA,
      engine: 'postgres',
      environment: 'production',
      verificationScope: VERIFICATION_SCOPE,
      status: 'FAIL',
      testedAt: new Date().toISOString(),
      reason: String(error && (error.code || error.message) || error).slice(0, 240),
      testedRoutes: 0,
      inventoryRouteCount: EXPECTED_ROUTE_COUNT,
      passed: 0,
      failed: 1,
      routes: [],
      businessFlowCoverage: { status: 'FAIL', testedFlows: 0, inventoryFlowCount: BUSINESS_FLOW_INVENTORY.length, passed: 0, failed: BUSINESS_FLOW_INVENTORY.length, flows: [] },
      cleanup: { status: 'NOT_VERIFIED' }
    };
    try { writeEvidence(outputPath, failure); } catch (_) {}
    process.stderr.write('PRODUCTION_API_ROUTE_ACCEPTANCE_FAILED:' + failure.reason + '\n');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('PRODUCTION_API_ROUTE_ACCEPTANCE_UNEXPECTED_FAILURE:' + String(error && error.message || error).slice(0, 240) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  requireIdentity,
  zeroResidue,
  validateCandidateEvidence,
  routeProofMap,
  flowRowPasses,
  buildBusinessFlowCoverage,
  responseCode,
  requestJson,
  requestWithRateLimitRetry,
  runCollector,
  writeEvidence,
  main
};
