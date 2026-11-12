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
    '--no-color', '--scope', scope, 'curl', pathValue,
    '--deployment', deployment.toString(), '-sS', '-i',
    '--connect-timeout', String(connectTimeoutSeconds),
    '--max-time', String(maxTimeSeconds)
  ];
}

function classifyVercelCurlFailure(stderr, exitCode) {
  const diagnostic = String(stderr || '').slice(0, 8192).toLowerCase();
  if (/deployment protection|protection bypass|bypass token|sso|authentication required/.test(diagnostic)) return 'VERCEL_PROTECTION_AUTH_FAILED';
  if (/invalid token|token (?:is )?(?:invalid|expired)|unauthorized|401 unauthorized|authentication failed/.test(diagnostic)) return 'VERCEL_AUTH_FAILED';
  if (/project.{0,40}(?:not found|does not exist)|not linked to a project|team.{0,40}not found/.test(diagnostic)) return 'VERCEL_PROJECT_SCOPE_FAILED';
  if (/deployment.{0,40}(?:not found|does not exist)|could not find.{0,40}deployment/.test(diagnostic)) return 'VERCEL_DEPLOYMENT_NOT_FOUND';
  if (/unknown option|unknown argument|unexpected argument|invalid option/.test(diagnostic)) return 'VERCEL_CLI_ARGUMENT_ERROR';
  if (/timed out|timeout|etimedout/.test(diagnostic)) return 'NETWORK_TIMEOUT';
  if (/enotfound|econnreset|econnrefused|epipe|network connection/.test(diagnostic)) return 'NETWORK_CONNECTION_FAILED';
  const code = Number(exitCode);
  if (code === 2) return 'VERCEL_CLI_USAGE_ERROR';
  return Number.isInteger(code) && code > 0 && code < 256 ? `VERCEL_CLI_EXIT_${code}` : 'VERCEL_CURL_EXECUTION_FAILED';
}

function runVercelCurl(baseUrl, path, options = {}) {
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
    if (body.status !== 'IDENTITY_PLANE_RLS_ENFORCED' ||
        body.productionIsolationCertification !== 'CERTIFIED' ||
        body.controlPlaneTenantBoundaryPolicies?.status !== 'CATALOG_ENFORCED' ||
        body.controlPlaneTenantBoundaryPolicies?.validatedTableCount !== 3 ||
        body.controlPlaneRuntimePrivileges?.status !== 'LEAST_PRIVILEGE_PRESENT' ||
        body.controlPlaneRuntimePrivileges?.privilegeGapCount !== 0 ||
        body.runtimeRole?.name !== 'opscore_runtime' ||
        body.runtimeRole?.status !== 'LEAST_PRIVILEGE_PRESENT' ||
        body.runtimeRole?.login !== true ||
        body.runtimeRole?.superuser !== false ||
        body.runtimeRole?.bypassRls !== false ||
        body.runtimeRole?.createRole !== false ||
        body.runtimeRole?.createDatabase !== false ||
        body.runtimeRole?.elevatedMembershipCount !== 0) {
      throw new Error('DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE');
    }
    return true;
  }
  if (path === '/api/verify/release') {
    if (body.status !== 'PASS_WITH_BUYER_RESIDUALS' ||
        body.sourceCommit !== expectedCommit ||
        body.sourceCommitIdentitySource !== 'github-actions-cli-assertion' ||
        body.ci?.status !== 'PASS' ||
        body.ci?.commitSha !== expectedCommit ||
        body.deployment?.status !== 'identified' ||
        body.deployment?.environment !== 'production' ||
        body.deployment?.ref !== 'main' ||
        body.postgresHttpAcceptance?.status !== 'PASS' ||
        body.postgresHttpAcceptance?.evidenceCommit !== expectedCommit ||
        String(body.postgresHttpAcceptance?.evidencePipelineId || '') !== String(body.ci?.pipelineId || '') ||
        body.productionAcceptance?.status !== 'PASS' ||
        body.productionAcceptance?.commitSha !== expectedCommit ||
        !/^[a-f0-9]{64}$/.test(String(body.productionAcceptance?.evidenceSha256 || '')) ||
        body.gates?.productionSessionTenantBoundary !== 'PASS_PRODUCTION' ||
        body.gates?.productionRecoveryBundle !== 'PASS_PRODUCTION' ||
        body.gates?.productionIsolationCertification !== 'CERTIFIED' ||
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

module.exports = { parseDeploymentUrl, parseCurlResponse, buildVercelCurlArgs, classifyVercelCurlFailure, runVercelCurl, validateEndpoint, runSmoke };
