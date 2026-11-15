'use strict';

const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const REQUIRED_JSON_PATHS = [
  '/api/health',
  '/api/verify/deployment',
  '/api/verify/database',
  '/api/verify/database-security',
  '/api/verify/release'
];

function parseDeploymentUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch { throw new Error('DEPLOYMENT_URL_INVALID'); }
  if (url.protocol !== 'https:' || !(url.hostname.toLowerCase() === 'opscore-platform.vercel.app' || (url.hostname.toLowerCase().startsWith('opscore-platform-') && url.hostname.toLowerCase().endsWith('.vercel.app'))) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DEPLOYMENT_URL_NOT_ALLOWED');
  }
  return url;
}

function parseCurlResponse(output) {
  const raw = String(output || '');
  const marker = '__OPSC_HTTP_STATUS__:';
  const markerIndex = raw.lastIndexOf(marker);
  let statusText = null;
  let response = raw;
  if (markerIndex >= 0) {
    statusText = raw.slice(markerIndex + marker.length).trim();
    response = raw.slice(0, markerIndex);
  } else {
    const statusLines = [...raw.matchAll(/^HTTP\/(?:1\.[01]|2|3)\s+(\d{3})(?:\s+[^\r\n]*)?$/gim)];
    if (!statusLines.length) throw new Error('CURL_STATUS_MISSING');
    statusText = statusLines[statusLines.length - 1][1];
  }
  if (!/^\d{3}$/.test(String(statusText || ''))) throw new Error('CURL_STATUS_INVALID');
  let separator = response.lastIndexOf('\r\n\r\n');
  let separatorLength = 4;
  if (separator < 0) {
    separator = response.lastIndexOf('\n\n');
    separatorLength = 2;
  }
  if (separator < 0) throw new Error('CURL_HEADERS_MISSING');
  const headers = response.slice(0, separator);
  const body = response.slice(separator + separatorLength);
  if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) throw new Error('RESPONSE_TOO_LARGE');
  const contentTypes = [...headers.matchAll(/(?:^|\r?\n)content-type:\s*([^\r\n]+)/ig)];
  return {
    statusCode: Number(statusText),
    contentType: contentTypes.length ? contentTypes[contentTypes.length - 1][1].trim() : '',
    body
  };
}

function buildVercelCurlArgs(deploymentUrl, requestPath, connectTimeoutSeconds, maxTimeSeconds, env = process.env) {
  const scope = String(env.VERCEL_SCOPE || env.VERCEL_ORG_SLUG || env.VERCEL_ORG_ID || '').trim();
  if (!scope || !/^[A-Za-z0-9_-]{1,128}$/.test(scope)) throw new Error('VERCEL_SCOPE_REQUIRED');
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) throw new Error('VERCEL_TOKEN_REQUIRED');
  let deployment;
  try { deployment = new URL(String(deploymentUrl || '')); }
  catch { throw new Error('VERCEL_DEPLOYMENT_URL_INVALID'); }
  if (deployment.protocol !== 'https:' || !deployment.hostname.toLowerCase().endsWith('.vercel.app') ||
      deployment.username || deployment.password || deployment.search || deployment.hash || deployment.pathname !== '/') {
    throw new Error('VERCEL_DEPLOYMENT_URL_INVALID');
  }
  const pathValue = String(requestPath || '');
  if (!pathValue.startsWith('/') || pathValue.includes('\r') || pathValue.includes('\n')) {
    throw new Error('VERCEL_REQUEST_PATH_INVALID');
  }
  return [
    '--no-color', '--scope', scope, '--token', token, 'curl', pathValue,
    '--deployment', deployment.origin, '--include'
  ];
}

function classifyVercelCurlFailure(stderr, exitCode) {
  const diagnostic = String(stderr || '').slice(0, 8192).toLowerCase();
  if (/deployment protection|protection bypass|bypass token|sso|authentication required/.test(diagnostic)) return 'VERCEL_PROTECTION_AUTH_FAILED';
  if (/invalid token|token (?:is )?(?:invalid|expired)|unauthorized|401 unauthorized|authentication failed/.test(diagnostic)) return 'VERCEL_AUTH_FAILED';
  if (/project.{0,40}(?:not found|does not exist)|not linked to a project|team.{0,40}not found/.test(diagnostic)) return 'VERCEL_PROJECT_SCOPE_FAILED';
  if (/deployment.{0,40}(?:not found|does not exist)|could not find.{0,40}deployment/.test(diagnostic)) return 'VERCEL_DEPLOYMENT_NOT_FOUND';
  const curlExit = diagnostic.match(/curl:\s*\((\d{1,3})\)/i);
  if (curlExit) return `CURL_EXIT_${Number(curlExit[1])}`;
  if (/unknown command.{0,40}curl|command.{0,40}curl.{0,40}not found/.test(diagnostic)) return 'VERCEL_CURL_COMMAND_UNAVAILABLE';
  if (/unknown option|unknown argument|unexpected argument|invalid option/.test(diagnostic)) return 'VERCEL_CLI_ARGUMENT_ERROR';
  if (/timed out|timeout|etimedout/.test(diagnostic)) return 'NETWORK_TIMEOUT';
  if (/enotfound|econnreset|econnrefused|epipe|network connection/.test(diagnostic)) return 'NETWORK_CONNECTION_FAILED';
  const code = Number(exitCode);
  if (code === 2) return 'CLI_EXIT_2_UNCLASSIFIED';
  return Number.isInteger(code) && code > 0 && code < 256 ? `VERCEL_CLI_EXIT_${code}` : 'VERCEL_CURL_EXECUTION_FAILED';
}

async function readLimitedBody(response, maxBytes = 1024 * 1024) {
  const advertised = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
    return body;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('RESPONSE_TOO_LARGE');
      }
      body += decoder.decode(item.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock?.();
  }
}

async function runTrustedOidcFetch(baseUrl, requestPath, options = {}) {
  const token = String(options.token || process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
  if (!token) throw new Error('VERCEL_TRUSTED_OIDC_TOKEN_REQUIRED');
  let deployment;
  try { deployment = new URL(String(baseUrl || '')); }
  catch { throw new Error('VERCEL_DEPLOYMENT_URL_INVALID'); }
  if (deployment.protocol !== 'https:' ||
      !(deployment.hostname.toLowerCase() === 'opscore-platform.vercel.app' ||
        (deployment.hostname.toLowerCase().startsWith('opscore-platform-') && deployment.hostname.toLowerCase().endsWith('.vercel.app'))) ||
      deployment.username || deployment.password || deployment.pathname !== '/' || deployment.search || deployment.hash) {
    throw new Error('VERCEL_DEPLOYMENT_URL_NOT_ALLOWED');
  }
  const pathValue = String(requestPath || '');
  if (!pathValue.startsWith('/') || /[\r\n]/.test(pathValue) || pathValue.startsWith('//')) {
    throw new Error('VERCEL_REQUEST_PATH_INVALID');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('VERCEL_TRUSTED_FETCH_UNAVAILABLE');
  const timeoutMs = Number.isSafeInteger(options.processTimeoutMs) && options.processTimeoutMs > 0
    ? options.processTimeoutMs : 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(pathValue, deployment.origin).toString(), {
      method: 'GET',
      headers: {
        'x-vercel-trusted-oidc-idp-token': token,
        accept: '*/*'
      },
      redirect: 'manual',
      signal: controller.signal
    });
    const contentType = String(response.headers?.get?.('content-type') || '');
    const body = await readLimitedBody(response, 1024 * 1024);
    return { statusCode: Number(response.status), contentType, body };
  } catch (error) {
    if (error && error.message === 'RESPONSE_TOO_LARGE') throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error('NETWORK_TIMEOUT');
    throw new Error('NETWORK_CONNECTION_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

function runVercelCurl(baseUrl, path, options = {}) {
  if (String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim() || String(options.token || '').trim()) {
    return runTrustedOidcFetch(baseUrl, path, options);
  }
  return new Promise((resolve, reject) => {
    const token = String(process.env.VERCEL_TOKEN || '').trim();
    if (!token) return reject(new Error('VERCEL_TOKEN_REQUIRED'));
    const targetUrl = new URL(path, baseUrl).toString();
    const connectTimeoutSeconds = Number.isSafeInteger(options.connectTimeoutSeconds) && options.connectTimeoutSeconds > 0
      ? options.connectTimeoutSeconds : 5;
    const maxTimeSeconds = Number.isSafeInteger(options.maxTimeSeconds) && options.maxTimeSeconds > 0
      ? options.maxTimeSeconds : 10;
    const processTimeoutMs = Number.isSafeInteger(options.processTimeoutMs) && options.processTimeoutMs > 0
      ? options.processTimeoutMs : 30000;
    let args;
    try { args = buildVercelCurlArgs(baseUrl.toString(), path, connectTimeoutSeconds, maxTimeSeconds, process.env); }
    catch (error) { return reject(error); }
    let child;
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      child?.kill('SIGKILL');
      finish(new Error('NETWORK_TIMEOUT'));
    }, processTimeoutMs);
    try {
      child = spawn('vercel', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      });
    } catch {
      finish(new Error('VERCEL_CLI_START_FAILED'));
      return;
    }
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > 2 * 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('RESPONSE_TOO_LARGE'));
      }
    });
    child.stderr.on('data', chunk => {
      const remaining = 8192 - Buffer.byteLength(stderr, 'utf8');
      if (remaining > 0) stderr += chunk.toString('utf8').slice(0, remaining);
    });
    child.on('error', error => {
      const code = String(error?.code || '');
      finish(new Error(code === 'ETIMEDOUT' ? 'NETWORK_TIMEOUT' : 'VERCEL_CLI_START_FAILED'));
    });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        if (code === 28) finish(new Error('NETWORK_TIMEOUT'));
        else if ([7, 55, 56].includes(code)) finish(new Error('NETWORK_CONNECTION_FAILED'));
        else finish(new Error(classifyVercelCurlFailure(stderr, code)));
        return;
      }
      try { finish(null, parseCurlResponse(stdout)); }
      catch (error) { finish(error); }
    });
  });
}
function requireObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function validateEndpoint(path, statusCode, payload, expectedCommit, contentType = '') {
  if (statusCode !== 200) throw new Error(`HTTP_${statusCode}`);
  if (path === '/') {
    if (!String(contentType).toLowerCase().includes('text/html')) throw new Error('ROOT_CONTENT_TYPE_INVALID');
    return true;
  }

  const body = requireObject(payload, 'JSON_BODY_INVALID');
  if (path === '/api/health') {
    if (body.ok !== true || body.status !== 'healthy' || body.engine !== 'postgres') {
      throw new Error('HEALTH_CONTRACT_FAILED');
    }
    return true;
  }
  if (path === '/api/verify/deployment') {
    if (body.status !== 'identified' || body.source?.commitSha !== expectedCommit ||
        body.source?.ref !== 'main' || body.deployment?.environment !== 'production' ||
        !/^dpl_[A-Za-z0-9]+$/.test(String(body.deployment?.id || ''))) {
      throw new Error('DEPLOYMENT_IDENTITY_MISMATCH');
    }
    return true;
  }
  if (path === '/api/verify/database') {
    if (body.ok !== true || body.engine !== 'postgres') throw new Error('DATABASE_CONNECTIVITY_FAILED');
    return true;
  }
  if (path === '/api/verify/database-security') {
    const catalog = body.publicSchema && typeof body.publicSchema === 'object' ? body.publicSchema : {};
    const spatial = catalog.postgisSpatialRefSys && typeof catalog.postgisSpatialRefSys === 'object'
      ? catalog.postgisSpatialRefSys : {};
    const metadataViews = catalog.postgisMetadataViews && typeof catalog.postgisMetadataViews === 'object'
      ? catalog.postgisMetadataViews : {};
    const ledger = body.migrationLedger && typeof body.migrationLedger === 'object' ? body.migrationLedger : {};
    const controlPlane = body.controlPlaneTenantBoundaryPolicies && typeof body.controlPlaneTenantBoundaryPolicies === 'object'
      ? body.controlPlaneTenantBoundaryPolicies : {};
    const controlPrivileges = body.controlPlaneRuntimePrivileges && typeof body.controlPlaneRuntimePrivileges === 'object'
      ? body.controlPlaneRuntimePrivileges : {};
    const systemOperational = body.systemOperationalTables && typeof body.systemOperationalTables === 'object'
      ? body.systemOperationalTables : {};
    const identityPlane = body.identityPlane && typeof body.identityPlane === 'object' ? body.identityPlane : {};
    const runtime = body.runtimeRole && typeof body.runtimeRole === 'object' ? body.runtimeRole : {};
    const ordinaryTables = Number(catalog.ordinaryTableCount);
    const rlsEnabled = Number(catalog.rlsEnabledTableCount);
    const rlsForced = Number(catalog.rlsForcedTableCount);
    const tablesWithoutRls = Number(catalog.tablesWithoutRlsCount);
    const validInteger = value => Number.isSafeInteger(value) && value >= 0;
    const catalogCoverageSafe =
      validInteger(ordinaryTables) && ordinaryTables > 0 &&
      validInteger(rlsEnabled) && rlsEnabled === ordinaryTables - 1 &&
      validInteger(rlsForced) && rlsForced === ordinaryTables - 1 &&
      validInteger(tablesWithoutRls) && tablesWithoutRls === 1 &&
      catalog.nonPostgisTablesWithoutRlsCount === 0 &&
      catalog.nonPostgisTablesWithoutForceRlsCount === 0 &&
      spatial.allowedNoRlsCatalog === true &&
      spatial.runtimeWriteAccessCount === 0 &&
      metadataViews.status === 'READ_ONLY' &&
      validInteger(Number(metadataViews.viewCount)) &&
      metadataViews.runtimeWriteAccessCount === 0;
    const ledgerSafe = ledger.tableCount === 1 && ledger.forceRls === true &&
      ledger.runtimePrivilegesCount === 0 && ledger.status === 'OWNER_ONLY';
    const controlPlaneSafe = controlPlane.status === 'CATALOG_ENFORCED' &&
      controlPlane.tableCount === 3 && controlPlane.validatedTableCount === 3 &&
      controlPrivileges.status === 'LEAST_PRIVILEGE_PRESENT' &&
      controlPrivileges.tableCount === 3 && controlPrivileges.privilegeGapCount === 0;
    const systemOperationalSafe = systemOperational.tableCount === 3 &&
      systemOperational.policyValidTableCount === 3 &&
      systemOperational.runtimePrivilegeGapCount === 0 &&
      systemOperational.status === 'LEAST_PRIVILEGE_PRESENT';
    const runtimeRoleSafe = runtime.name === 'opscore_runtime' &&
      runtime.status === 'LEAST_PRIVILEGE_PRESENT' &&
      runtime.login === true && runtime.superuser === false &&
      runtime.bypassRls === false && runtime.createRole === false &&
      runtime.createDatabase === false && runtime.appRoleMembership === false &&
      runtime.elevatedMembershipCount === 0;
    const identityPlaneSafe = identityPlane.criticalTablesWithoutRlsButAccessibleToRuntimeRole === 0 &&
      identityPlane.status === 'RLS_ENFORCED';
    if (body.schemaVersion !== 'opscore.public-database-security-proof.v2' ||
        body.status !== 'IDENTITY_PLANE_RLS_ENFORCED' ||
        ![ 'NOT_CERTIFIED', 'CERTIFIED' ].includes(body.productionIsolationCertification) ||
        !catalogCoverageSafe || !ledgerSafe || !controlPlaneSafe ||
        !systemOperationalSafe || !runtimeRoleSafe || !identityPlaneSafe) {
      throw new Error('DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE');
    }
    return true;
  }
  if (path === '/api/verify/release') {
    const ci = body.ci && typeof body.ci === 'object' ? body.ci : {};
    const deployment = body.deployment && typeof body.deployment === 'object' ? body.deployment : {};
    const httpAcceptance = body.postgresHttpAcceptance && typeof body.postgresHttpAcceptance === 'object'
      ? body.postgresHttpAcceptance : {};
    const acceptance = body.productionAcceptance && typeof body.productionAcceptance === 'object'
      ? body.productionAcceptance : {};
    const gates = body.gates && typeof body.gates === 'object' ? body.gates : {};
    const packageFingerprint = body.packageFingerprint && typeof body.packageFingerprint === 'object'
      ? body.packageFingerprint : {};
    const pipelineId = Number(ci.pipelineId);
    const acceptancePipelineId = String(acceptance.pipelineId || '');
    const httpPipelineId = String(httpAcceptance.evidencePipelineId || '');
    const identityBound = body.schemaVersion === 'opscore.public-release-proof.v2' &&
      body.status === 'PASS_WITH_BUYER_RESIDUALS' &&
      body.sourceCommit === expectedCommit &&
      body.sourceCommitIdentitySource === 'github-actions-cli-assertion' &&
      ci.status === 'PASS' && ci.commitSha === expectedCommit &&
      Number.isSafeInteger(pipelineId) && pipelineId > 0 &&
      deployment.status === 'identified' &&
      deployment.environment === 'production' && deployment.ref === 'main' &&
      /^dpl_[A-Za-z0-9]+$/.test(String(deployment.id || ''));
    const acceptanceBound = httpAcceptance.status === 'PASS' &&
      httpAcceptance.currentCandidateMatch === true &&
      httpAcceptance.evidenceCommit === expectedCommit &&
      httpPipelineId === String(pipelineId) &&
      acceptance.status === 'PASS' &&
      acceptance.commitSha === expectedCommit &&
      acceptancePipelineId === String(pipelineId) &&
      /^[a-f0-9]{64}$/.test(String(acceptance.evidenceSha256 || ''));
    const sessionOk = ['PASS_TEST_SCOPE', 'PASS_PRODUCTION'].includes(gates.productionSessionTenantBoundary);
    const recoveryOk = ['PASS_TEST_SCOPE', 'PASS_PRODUCTION'].includes(gates.productionRecoveryBundle);
    const pitrOk = ['NOT_VERIFIED', 'PASS_BRANCH_POINT'].includes(gates.neonPointInTimeRecovery);
    const isolationOk = ['NOT_CERTIFIED', 'CERTIFIED'].includes(gates.productionIsolationCertification);
    // CERTIFIED requires both production-scope session and recovery gates.
    const isolationConsistent = gates.productionIsolationCertification !== 'CERTIFIED' || (
      gates.productionSessionTenantBoundary === 'PASS_PRODUCTION' &&
      gates.productionRecoveryBundle === 'PASS_PRODUCTION'
    );
    const gatesHonest = sessionOk && recoveryOk &&
      gates.tenantRouteSecurityCoverage === 'PASS_TEST_SCOPE' &&
      // The API route contract run is accepted only after release-proof.js binds its evidence to this exact commit and pipeline.
      // PASS_CONTRACT_SCOPE does not represent full business-flow acceptance.
      gates.functionalApiRouteAcceptance === 'PASS_CONTRACT_SCOPE' &&
      pitrOk && isolationOk && isolationConsistent;
    const packageBound = packageFingerprint.status === 'PUBLISHED' &&
      packageFingerprint.sourceCommit === expectedCommit &&
      /^[a-f0-9]{64}$/.test(String(packageFingerprint.value || ''));
    if (!identityBound || !acceptanceBound || !gatesHonest || !packageBound) {
      throw new Error('RELEASE_EVIDENCE_NOT_BOUND_TO_DEPLOYMENT');
    }
    return true;
  }
  throw new Error('SMOKE_PATH_NOT_ALLOWED');
}

async function requestOnce(baseUrl, path, expectedCommit, curlRunner) {
  const response = await curlRunner(baseUrl, path);
  if (response.statusCode !== 200) throw new Error(`HTTP_${response.statusCode}`);
  if (path === '/') {
    validateEndpoint(path, response.statusCode, null, expectedCommit, response.contentType);
    return { path, status: 'PASS', httpStatus: response.statusCode };
  }
  let payload;
  try { payload = JSON.parse(response.body); }
  catch { throw new Error('JSON_RESPONSE_INVALID'); }
  validateEndpoint(path, response.statusCode, payload, expectedCommit);
  return { path, status: 'PASS', httpStatus: response.statusCode };
}

async function checkWithRetry(baseUrl, path, expectedCommit, curlRunner, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await requestOnce(baseUrl, path, expectedCommit, curlRunner);
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const transient = /^(?:HTTP_(?:408|425|429|5\d\d)|NETWORK_(?:TIMEOUT|CONNECTION_FAILED|ETIMEDOUT|ECONNRESET|EPIPE))/i.test(message);
      if (!transient || attempt === attempts) break;
      await delay(1500 * attempt);
    }
  }
  return { path, status: 'FAIL', attempts, reason: String(lastError?.message || 'SMOKE_CHECK_FAILED').slice(0, 120) };
}

async function runSmoke(baseUrlRaw, expectedCommit, curlRunner = runVercelCurl) {
  const baseUrl = parseDeploymentUrl(baseUrlRaw);
  const commit = String(expectedCommit || '').trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw new Error('EXPECTED_COMMIT_INVALID');
  if (typeof curlRunner !== 'function') throw new Error('CURL_RUNNER_UNAVAILABLE');
  const paths = ['/', ...REQUIRED_JSON_PATHS];
  const results = [];
  for (const path of paths) results.push(await checkWithRetry(baseUrl, path, commit, curlRunner));
  const passed = results.every(result => result.status === 'PASS');
  return {
    schemaVersion: 'opscore.production-deployment-smoke.v1',
    host: baseUrl.hostname,
    expectedCommit: commit,
    passed,
    checks: results
  };
}

async function main() {
  const [url, commit] = process.argv.slice(2);
  const result = await runSmoke(url, commit);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({
      schemaVersion: 'opscore.production-deployment-smoke.v1',
      status: 'BLOCKED',
      reason: String(error?.message || 'SMOKE_EXECUTION_FAILED').slice(0, 120)
    }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { parseDeploymentUrl, parseCurlResponse, buildVercelCurlArgs, classifyVercelCurlFailure, readLimitedBody, runTrustedOidcFetch, runVercelCurl, validateEndpoint, runSmoke };
