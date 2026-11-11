'use strict';

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
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('DEPLOYMENT_URL_INVALID');
  }
  if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.vercel.app') ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DEPLOYMENT_URL_NOT_ALLOWED');
  }
  return url;
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
    if (body.status !== 'IDENTITY_PLANE_RLS_ENFORCED' ||
        body.controlPlaneTenantBoundaryPolicies?.status !== 'CATALOG_ENFORCED' ||
        body.controlPlaneTenantBoundaryPolicies?.validatedTableCount !== 3 ||
        body.controlPlaneRuntimePrivileges?.status !== 'LEAST_PRIVILEGE_PRESENT' ||
        body.controlPlaneRuntimePrivileges?.privilegeGapCount !== 0) {
      throw new Error('DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE');
    }
    return true;
  }

  if (path === '/api/verify/release') {
    if (body.status !== 'PASS_WITH_BUYER_RESIDUALS' ||
        body.sourceCommit !== expectedCommit ||
        body.ci?.status !== 'PASS' ||
        body.deployment?.status !== 'identified' ||
        body.deployment?.environment !== 'production' ||
        body.deployment?.ref !== 'main' ||
        body.postgresHttpAcceptance?.status !== 'PASS' ||
        body.packageFingerprint?.status !== 'PUBLISHED' ||
        body.packageFingerprint?.sourceCommit !== expectedCommit) {
      throw new Error('RELEASE_EVIDENCE_NOT_BOUND_TO_DEPLOYMENT');
    }
    return true;
  }

  throw new Error('SMOKE_PATH_NOT_ALLOWED');
}

async function requestOnce(baseUrl, path, fetchImpl) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: 'GET',
    headers: { accept: path === '/' ? 'text/html' : 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });
  const contentType = response.headers.get('content-type') || '';
  if (path === '/') {
    await response.body?.cancel();
    validateEndpoint(path, response.status, null, null, contentType);
    return { path, status: 'PASS', httpStatus: response.status };
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) throw new Error('RESPONSE_TOO_LARGE');
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error('JSON_RESPONSE_INVALID'); }
  validateEndpoint(path, response.status, payload, process.env.OPSC_EXPECTED_COMMIT);
  return { path, status: 'PASS', httpStatus: response.status };
}

async function checkWithRetry(baseUrl, path, fetchImpl, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await requestOnce(baseUrl, path, fetchImpl);
      return { ...result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const transient = /^(?:HTTP_(?:408|425|429|5\d\d)|fetch failed|The operation was aborted|ECONNRESET|ETIMEDOUT)/.test(message);
      if (!transient || attempt === attempts) break;
      await delay(1500 * attempt);
    }
  }
  return { path, status: 'FAIL', attempts, reason: String(lastError?.message || 'SMOKE_CHECK_FAILED').slice(0, 120) };
}

async function runSmoke(baseUrlRaw, expectedCommit, fetchImpl = globalThis.fetch) {
  const baseUrl = parseDeploymentUrl(baseUrlRaw);
  const commit = String(expectedCommit || '').trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw new Error('EXPECTED_COMMIT_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');

  process.env.OPSC_EXPECTED_COMMIT = commit;
  const paths = ['/', ...REQUIRED_JSON_PATHS];
  const results = await Promise.all(paths.map(path => checkWithRetry(baseUrl, path, fetchImpl)));
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

module.exports = { parseDeploymentUrl, validateEndpoint, runSmoke };
