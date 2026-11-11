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
  if (markerIndex < 0) throw new Error('CURL_STATUS_MARKER_MISSING');
  const statusText = raw.slice(markerIndex + marker.length).trim();
  if (!/^\d{3}$/.test(statusText)) throw new Error('CURL_STATUS_INVALID');
  const response = raw.slice(0, markerIndex);
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

function runVercelCurl(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const token = String(process.env.VERCEL_TOKEN || '').trim();
    if (!token) return reject(new Error('VERCEL_TOKEN_REQUIRED'));
    const targetUrl = new URL(path, baseUrl).toString();
    const args = [
      'curl', targetUrl, '-sS', '-i',
      '--connect-timeout', '5',
      '--max-time', '10',
      '-w', '\n__OPSC_HTTP_STATUS__:%{http_code}',
      '--token', token,
      '--no-color'
    ];
    let child;
    let settled = false;
    let stdout = '';
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
    }, 30000);
    try {
      child = spawn('vercel', args, {
        stdio: ['ignore', 'pipe', 'ignore'],
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
    child.on('error', error => {
      const code = String(error?.code || '');
      finish(new Error(code === 'ETIMEDOUT' ? 'NETWORK_TIMEOUT' : 'VERCEL_CLI_START_FAILED'));
    });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        if (code === 28) finish(new Error('NETWORK_TIMEOUT'));
        else if ([7, 55, 56].includes(code)) finish(new Error('NETWORK_CONNECTION_FAILED'));
        else finish(new Error('VERCEL_CURL_EXECUTION_FAILED'));
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
        body.ci?.commitSha !== expectedCommit ||
        body.deployment?.status !== 'identified' ||
        body.deployment?.environment !== 'production' ||
        body.deployment?.ref !== 'main' ||
        body.postgresHttpAcceptance?.status !== 'PASS' ||
        body.postgresHttpAcceptance?.evidenceCommit !== expectedCommit ||
        String(body.postgresHttpAcceptance?.evidencePipelineId || '') !== String(body.ci?.pipelineId || '') ||
        body.packageFingerprint?.status !== 'PUBLISHED' ||
        body.packageFingerprint?.sourceCommit !== expectedCommit) {
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

module.exports = { parseDeploymentUrl, parseCurlResponse, validateEndpoint, runSmoke };
