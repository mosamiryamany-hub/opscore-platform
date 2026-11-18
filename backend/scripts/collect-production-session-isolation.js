#!/usr/bin/env node
'use strict';

/**
 * Production dual-tenant HTTP isolation evidence.
 * The connection target is independently verified against the Neon API before any write.
 * Probe fixtures are cleaned while retaining disabled users/orgs so immutable audit rows
 * retain resolvable actor and tenant identities.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readProductionDeploymentIdentity, candidateProbeOrigin } = require('./lib/production-deployment-identity');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'docs', 'verification', 'PRODUCTION_SESSION_ISOLATION.json');

function sourceCommit() {
  return String(process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
}
function makeId(prefix) {
  return prefix + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
function hashPassword(password) {
  const N = 131072, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return 'scrypt$' + N + '$' + r + '$' + p + '$' + salt.toString('base64url') + '$' + derived.toString('base64url');
}
function psql(uri, sql) {
  return execFileSync('psql', [uri, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024
  }).trim();
}
function sqlLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
async function neonApi(pathname, apiKey) {
  const response = await fetch('https://console.neon.tech/api/v2' + pathname, {
    method: 'GET',
    headers: { accept: 'application/json', authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error('NEON_IDENTITY_API_REJECTED:' + response.status);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('NEON_IDENTITY_RESPONSE_INVALID'); }
  return data;
}
async function verifyProductionDatabaseTarget(ownerUri) {
  let url;
  try { url = new URL(ownerUri); } catch { throw new Error('PRODUCTION_DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PRODUCTION_DATABASE_URL_PROTOCOL_INVALID');
  const projectId = String(process.env.NEON_PROJECT_ID || '').trim();
  const branchId = String(process.env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const expectedDatabase = String(process.env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const expectedRole = String(process.env.OPSC_PRODUCTION_OWNER_ROLE || 'neondb_owner').trim();
  const apiKey = String(process.env.NEON_API_KEY || '').trim();
  if (!projectId || !branchId || !expectedDatabase || !apiKey) throw new Error('PRODUCTION_DATABASE_IDENTITY_EXPECTATIONS_REQUIRED');
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const roleName = decodeURIComponent(url.username);
  if (databaseName !== expectedDatabase) throw new Error('PRODUCTION_DATABASE_NAME_MISMATCH');
  if (roleName !== expectedRole) throw new Error('PRODUCTION_DATABASE_OWNER_ROLE_MISMATCH');
  const hostname = url.hostname.trim().toLowerCase();
  const firstLabel = hostname.split('.')[0];
  const endpointId = firstLabel.replace(/-pooler$/, '');
  if (!/^ep-[a-z0-9-]+$/.test(endpointId)) throw new Error('PRODUCTION_NEON_ENDPOINT_ID_INVALID');
  const payload = await neonApi('/projects/' + encodeURIComponent(projectId) + '/endpoints?limit=100', apiKey);
  const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints : [];
  const matches = endpoints.filter(item => String(item.id || '') === endpointId);
  if (matches.length !== 1) throw new Error('PRODUCTION_NEON_ENDPOINT_NOT_UNIQUELY_RESOLVED');
  const endpoint = matches[0];
  const apiHost = String(endpoint.host || (endpoint.hosts && endpoint.hosts.read_write_host) || '').trim().toLowerCase();
  const normalizedApiHost = apiHost.replace(/-pooler(?=\.)/, '');
  const normalizedConnectionHost = hostname.replace(/-pooler(?=\.)/, '');
  if (String(endpoint.project_id || '') !== projectId) throw new Error('PRODUCTION_NEON_PROJECT_IDENTITY_MISMATCH');
  if (String(endpoint.branch_id || '') !== branchId) throw new Error('PRODUCTION_NEON_BRANCH_IDENTITY_MISMATCH');
  if (normalizedApiHost !== normalizedConnectionHost) throw new Error('PRODUCTION_NEON_ENDPOINT_HOST_IDENTITY_MISMATCH');
  if (String(endpoint.type || '').toLowerCase() !== 'read_write') throw new Error('PRODUCTION_NEON_READ_WRITE_ENDPOINT_REQUIRED');
  return { projectId, branchId, databaseName, roleName, endpointId, endpointType: 'read_write' };
}
async function httpJson(base, method, pathname, { token, body } = {}) {
  const candidateMode = String(process.env.OPSC_PRODUCTION_CANDIDATE_MODE || '').trim().toLowerCase() === 'true';
  const candidateHeaders = candidateMode ? (() => {
    const probeToken = String(process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || '').trim();
    const oidcToken = String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(probeToken) || oidcToken.split('.').length !== 3) {
      throw new Error('PRODUCTION_CANDIDATE_HTTP_PROBE_CREDENTIALS_REQUIRED');
    }
    return {
      'x-opscore-signed-context-probe': probeToken,
      'x-vercel-trusted-oidc-idp-token': oidcToken
    };
  })() : {};
  const response = await fetch(base + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...candidateHeaders,
      ...(token ? { authorization: 'Bearer ' + token } : {})
    },
    redirect: 'manual',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 200) }; }
  return { status: response.status, data };
}
function isIsolationDenial(status) {
  return status === 403 || status === 404;
}
function requireAssetId(value) {
  const id = String(value || '');
  if (!/^ast_[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('PRODUCTION_PROBE_ASSET_ID_INVALID');
  return id;
}
function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(outPath, body);
  fs.writeFileSync(outPath + '.sha256', crypto.createHash('sha256').update(body).digest('hex') + '  PRODUCTION_SESSION_ISOLATION.json\n');
}

async function main() {
  const collectorCommit = sourceCommit();
  if (!/^[a-f0-9]{40}$/.test(collectorCommit)) throw new Error('COLLECTOR_SOURCE_COMMIT_SHA_REQUIRED');
  const collectorPipelineId = String(process.env.GITHUB_RUN_ID || '').trim();
  if (!/^[1-9][0-9]{0,14}$/.test(collectorPipelineId)) throw new Error('COLLECTOR_PIPELINE_ID_REQUIRED');
  const projectId = String(process.env.NEON_PROJECT_ID || '').trim();
  const branchId = String(process.env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const databaseName = String(process.env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const roleName = String(process.env.OPSC_PRODUCTION_OWNER_ROLE || 'neondb_owner').trim();
  if (!projectId || !branchId || !databaseName || !String(process.env.NEON_API_KEY || '').trim()) {
    throw new Error('PRODUCTION_DATABASE_IDENTITY_EXPECTATIONS_REQUIRED');
  }
  const connectionQuery = new URLSearchParams({
    branch_id: branchId,
    database_name: databaseName,
    role_name: roleName,
    pooled: 'false'
  });
  const connection = await neonApi(
    '/projects/' + encodeURIComponent(projectId) + '/connection_uri?' + connectionQuery.toString(),
    String(process.env.NEON_API_KEY).trim()
  );
  const ownerUri = String(connection.uri || '').trim();
  if (!ownerUri) throw new Error('PRODUCTION_OWNER_CONNECTION_URI_MISSING');
  let ownerUrl;
  try { ownerUrl = new URL(ownerUri); } catch { throw new Error('PRODUCTION_OWNER_CONNECTION_URI_INVALID'); }
  if (ownerUrl.hostname.toLowerCase().includes('-pooler.')) throw new Error('PRODUCTION_OWNER_DIRECT_CONNECTION_REQUIRED');
  const httpBase = String(process.env.OPSC_PRODUCTION_HTTP_BASE || 'https://opscore-platform.vercel.app').replace(/\\/+$/, '');
  const httpUrl = new URL(httpBase);
  const isCandidateMode = String(process.env.OPSC_PRODUCTION_CANDIDATE_MODE || '').trim().toLowerCase() === 'true';
  if (httpUrl.origin !== httpBase || httpUrl.protocol !== 'https:') throw new Error('PRODUCTION_HTTP_ORIGIN_NOT_APPROVED');
  if (isCandidateMode) candidateProbeOrigin(httpBase, process.env);
  else if (httpUrl.hostname !== 'opscore-platform.vercel.app') throw new Error('PRODUCTION_HTTP_ORIGIN_NOT_APPROVED');
  const deploymentIdentity = await readProductionDeploymentIdentity(
    httpBase,
    String(process.env.OPSC_EXPECTED_PRODUCTION_COMMIT_SHA || '')
  );
  const commit = deploymentIdentity.commitSha;
  const pipelineId = deploymentIdentity.ciPipelineId;
  const target = await verifyProductionDatabaseTarget(ownerUri);
  const parentBranchId = target.branchId;

  const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const password = 'OpsCore-Probe-' + crypto.randomBytes(18).toString('hex') + '-x';
  const orgA = makeId('org'), orgB = makeId('org');
  const userA = makeId('usr'), userB = makeId('usr');
  const emailA = 'probe.a.' + stamp + '@prod-isolation.opscore.invalid';
  const emailB = 'probe.b.' + stamp + '@prod-isolation.opscore.invalid';
  const hashA = hashPassword(password), hashB = hashPassword(password);
  const now = new Date().toISOString();
  const organizationsSql = [orgA, orgB].map(sqlLiteral).join(',');
  const usersSql = [userA, userB].map(sqlLiteral).join(',');
  const probes = [];
  const checks = {};
  let seeded = false;
  let tokenA = null, tokenB = null;
  let assetAId = null, assetBId = null;
  let reportStatus = 'FAIL';
  let reportReason = null;
  let cleanupDetails = null;

  try {
    const seedSql = [
      'BEGIN;',
      'INSERT INTO organizations (id,name,created_at) VALUES (' + sqlLiteral(orgA) + ',' + sqlLiteral('Production Isolation Probe A ' + stamp) + ',' + sqlLiteral(now) + '),(' + sqlLiteral(orgB) + ',' + sqlLiteral('Production Isolation Probe B ' + stamp) + ',' + sqlLiteral(now) + ');',
      'INSERT INTO users (id,email,password_hash,status,created_at) VALUES (' + sqlLiteral(userA) + ',' + sqlLiteral(emailA) + ',' + sqlLiteral(hashA) + ',\'active\',' + sqlLiteral(now) + '),(' + sqlLiteral(userB) + ',' + sqlLiteral(emailB) + ',' + sqlLiteral(hashB) + ',\'active\',' + sqlLiteral(now) + ');',
      'INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES (' + sqlLiteral(userA) + ',' + sqlLiteral(orgA) + ',\'owner\',' + sqlLiteral(now) + '),(' + sqlLiteral(userB) + ',' + sqlLiteral(orgB) + ',\'owner\',' + sqlLiteral(now) + ');',
      'COMMIT;'
    ].join('\n');
    psql(ownerUri, seedSql);
    seeded = true;

    const loginA = await httpJson(httpBase, 'POST', '/api/v1/auth/mobile-login', { body: { email: emailA, password, organizationId: orgA } });
    probes.push({ phase: 'login', label: 'A', method: 'POST', path: '/api/v1/auth/mobile-login', status: loginA.status });
    const loginB = await httpJson(httpBase, 'POST', '/api/v1/auth/mobile-login', { body: { email: emailB, password, organizationId: orgB } });
    probes.push({ phase: 'login', label: 'B', method: 'POST', path: '/api/v1/auth/mobile-login', status: loginB.status });
    tokenA = loginA.data && loginA.data.token || null;
    tokenB = loginB.data && loginB.data.token || null;
    checks.dualLogin = loginA.status === 200 && loginB.status === 200 && Boolean(tokenA) && Boolean(tokenB) ? 'PASS' : 'FAIL';
    if (checks.dualLogin !== 'PASS') throw new Error('DUAL_TENANT_LOGIN_PROBE_FAILED');

    const meA = await httpJson(httpBase, 'GET', '/api/v1/me', { token: tokenA });
    const meB = await httpJson(httpBase, 'GET', '/api/v1/me', { token: tokenB });
    probes.push({ phase: 'own-read', label: 'A', method: 'GET', path: '/api/v1/me', status: meA.status });
    probes.push({ phase: 'own-read', label: 'B', method: 'GET', path: '/api/v1/me', status: meB.status });
    checks.tenantPrincipalBinding = meA.status === 200 && meB.status === 200
      && meA.data && meB.data
      && meA.data.organization && meB.data.organization
      && meA.data.organization.id === orgA && meB.data.organization.id === orgB
      && meA.data.organization.id !== meB.data.organization.id ? 'PASS' : 'FAIL';

    const assetA = await httpJson(httpBase, 'POST', '/api/v1/assets', {
      token: tokenA,
      body: { name: 'Production isolation probe A ' + stamp, assetType: 'security-probe', externalRef: 'probe-a-' + stamp }
    });
    probes.push({ phase: 'own-write', label: 'A', method: 'POST', path: '/api/v1/assets', status: assetA.status });
    const assetB = await httpJson(httpBase, 'POST', '/api/v1/assets', {
      token: tokenB,
      body: { name: 'Production isolation probe B ' + stamp, assetType: 'security-probe', externalRef: 'probe-b-' + stamp }
    });
    probes.push({ phase: 'own-write', label: 'B', method: 'POST', path: '/api/v1/assets', status: assetB.status });
    if (assetA.status === 201 && assetB.status === 201) {
      assetAId = requireAssetId(assetA.data && assetA.data.id);
      assetBId = requireAssetId(assetB.data && assetB.data.id);
    }
    checks.ownAssetCreate = assetA.status === 201 && assetB.status === 201 && Boolean(assetAId) && Boolean(assetBId) ? 'PASS' : 'FAIL';
    if (checks.ownAssetCreate !== 'PASS') throw new Error('OWN_TENANT_ASSET_CREATE_PROBE_FAILED');

    const listA = await httpJson(httpBase, 'GET', '/api/v1/assets', { token: tokenA });
    const listB = await httpJson(httpBase, 'GET', '/api/v1/assets', { token: tokenB });
    probes.push({ phase: 'own-read', label: 'A', method: 'GET', path: '/api/v1/assets', status: listA.status });
    probes.push({ phase: 'own-read', label: 'B', method: 'GET', path: '/api/v1/assets', status: listB.status });
    checks.tenantListIsolation = listA.status === 200 && listB.status === 200
      && Array.isArray(listA.data) && Array.isArray(listB.data)
      && listA.data.some(row => row.id === assetAId) && !listA.data.some(row => row.id === assetBId)
      && listB.data.some(row => row.id === assetBId) && !listB.data.some(row => row.id === assetAId) ? 'PASS' : 'FAIL';

    // Use the signed, manifest-covered asset collection route for both own-read
    // and foreign-tenant visibility checks. Candidate mode does not probe the
    // non-manifest /intelligence subroute.
    checks.ownAssetRead = listA.status === 200 && Array.isArray(listA.data)
      && listA.data.some(row => row.id === assetAId && row.organization_id === orgA)
      && !listA.data.some(row => row.id === assetBId) ? 'PASS' : 'FAIL';
    checks.crossTenantAssetReadDenied = listA.status === 200 && listB.status === 200
      && Array.isArray(listA.data) && Array.isArray(listB.data)
      && !listA.data.some(row => row.id === assetBId)
      && !listB.data.some(row => row.id === assetAId) ? 'PASS' : 'FAIL';

    const assetAEventBefore = Number(psql(ownerUri,
      'SELECT count(*) FROM asset_events WHERE organization_id=' + sqlLiteral(orgA) + ' AND asset_id=' + sqlLiteral(assetAId) + ';'));
    const ownEvent = await httpJson(httpBase, 'POST', '/api/v1/assets/' + encodeURIComponent(assetAId) + '/events', {
      token: tokenA,
      body: { eventType: 'inspection', details: { probeMarker: 'own-' + stamp } }
    });
    probes.push({ phase: 'own-write', label: 'A', method: 'POST', path: '/api/v1/assets/{id}/events', status: ownEvent.status });
    const assetAEventAfterOwn = Number(psql(ownerUri,
      'SELECT count(*) FROM asset_events WHERE organization_id=' + sqlLiteral(orgA) + ' AND asset_id=' + sqlLiteral(assetAId) + ';'));
    checks.ownAssetEventWrite = ownEvent.status === 201 && assetAEventAfterOwn === assetAEventBefore + 1 ? 'PASS' : 'FAIL';

    const crossWrite = await httpJson(httpBase, 'POST', '/api/v1/assets/' + encodeURIComponent(assetAId) + '/events', {
      token: tokenB,
      body: { eventType: 'inspection', details: { probeMarker: 'cross-' + stamp } }
    });
    probes.push({ phase: 'cross-write', label: 'B', method: 'POST', path: '/api/v1/assets/{id}/events', status: crossWrite.status });
    const assetAEventAfterCross = Number(psql(ownerUri,
      'SELECT count(*) FROM asset_events WHERE organization_id=' + sqlLiteral(orgA) + ' AND asset_id=' + sqlLiteral(assetAId) + ';'));
    checks.crossTenantWriteDenied = isIsolationDenial(crossWrite.status) && assetAEventAfterCross === assetAEventAfterOwn ? 'PASS' : 'FAIL';

    const unauth = await httpJson(httpBase, 'GET', '/api/v1/assets');
    probes.push({ phase: 'unauth', label: '-', method: 'GET', path: '/api/v1/assets', status: unauth.status });
    checks.unauthenticatedDenied = unauth.status === 401 || unauth.status === 403 ? 'PASS' : 'FAIL';

    const requiredChecks = [
      'dualLogin', 'tenantPrincipalBinding', 'ownAssetCreate', 'ownAssetRead',
      'tenantListIsolation', 'crossTenantAssetReadDenied', 'ownAssetEventWrite',
      'crossTenantWriteDenied', 'unauthenticatedDenied'
    ];
    reportStatus = requiredChecks.every(key => checks[key] === 'PASS') ? 'PASS' : 'FAIL';
    if (reportStatus !== 'PASS') reportReason = 'ONE_OR_MORE_REQUIRED_HTTP_ISOLATION_PROBES_FAILED';
  } catch (error) {
    reportStatus = 'FAIL';
    reportReason = String(error && (error.code || error.message) || error).slice(0, 250);
    console.error('production_session_probe_failed', reportReason);
  } finally {
    try {
      const cleanupSql = [
        'BEGIN;',
        'DELETE FROM assets WHERE organization_id IN (' + organizationsSql + ');',
        'DELETE FROM sessions WHERE user_id IN (' + usersSql + ');',
        'DELETE FROM memberships WHERE user_id IN (' + usersSql + ') OR organization_id IN (' + organizationsSql + ');',
        'UPDATE users SET status=\'disabled\' WHERE id IN (' + usersSql + ');',
        'UPDATE organizations SET name=\'Archived Production Isolation Probe ' + stamp + ' \' || right(id,12) WHERE id IN (' + organizationsSql + ');',
        'COMMIT;',
        'SELECT json_build_object(' +
          '\'organizationsRetained\', (SELECT count(*) FROM organizations WHERE id IN (' + organizationsSql + ')),' +
          '\'disabledUsers\', (SELECT count(*) FROM users WHERE id IN (' + usersSql + ') AND status=\'disabled\'),' +
          '\'sessionsRemaining\', (SELECT count(*) FROM sessions WHERE user_id IN (' + usersSql + ')),' +
          '\'membershipsRemaining\', (SELECT count(*) FROM memberships WHERE user_id IN (' + usersSql + ') OR organization_id IN (' + organizationsSql + ')),' +
          '\'assetsRemaining\', (SELECT count(*) FROM assets WHERE organization_id IN (' + organizationsSql + ')),' +
          '\'assetEventsRemaining\', (SELECT count(*) FROM asset_events WHERE organization_id IN (' + organizationsSql + '))' +
        ')::text;'
      ].join('\n');
      const cleanupText = psql(ownerUri, cleanupSql);
      // psql -c with multiple statements prints command tags (BEGIN, UPDATE n, COMMIT)
      // before the json_build_object row. Parse only the JSON result line.
      const cleanupJsonLine = cleanupText.split('\n').map(s => s.trim()).filter(s => s.startsWith('{')).pop();
      cleanupDetails = JSON.parse(cleanupJsonLine || cleanupText);
      const cleanupOk = Number(cleanupDetails.organizationsRetained) === 2
        && Number(cleanupDetails.disabledUsers) === 2
        && Number(cleanupDetails.sessionsRemaining) === 0
        && Number(cleanupDetails.membershipsRemaining) === 0
        && Number(cleanupDetails.assetsRemaining) === 0
        && Number(cleanupDetails.assetEventsRemaining) === 0;
      checks.cleanupComplete = cleanupOk ? 'PASS' : 'FAIL';
    } catch (error) {
      checks.cleanupComplete = 'FAIL';
      cleanupDetails = { error: String(error && (error.code || error.message) || error).slice(0, 250) };
      console.error('production_session_cleanup_failed', cleanupDetails.error);
    }
  }

  const requiredFinalChecks = [
    'dualLogin', 'tenantPrincipalBinding', 'ownAssetCreate', 'ownAssetRead',
    'tenantListIsolation', 'crossTenantAssetReadDenied', 'ownAssetEventWrite',
    'crossTenantWriteDenied', 'unauthenticatedDenied', 'cleanupComplete'
  ];
  const allPass = requiredFinalChecks.every(key => checks[key] === 'PASS');
  const report = {
    schemaVersion: 'opscore.production-session-isolation.v3',
    status: allPass ? 'PASS' : 'FAIL',
    environment: 'production',
    httpBase,
    databaseName: target.databaseName,
    databaseBranchId: target.branchId,
    neonEndpointId: target.endpointId,
    testedAt: new Date().toISOString(),
    verificationScope: 'dual-tenant-http-asset-create-read-event-write-denial-and-cleanup',
    tenants: {
      A: { organizationId: orgA, userId: userA },
      B: { organizationId: orgB, userId: userB }
    },
    checks,
    probes,
    cleanup: { status: checks.cleanupComplete, details: cleanupDetails, retainedAuditPrincipalsDisabled: true },
    note: 'Live HTTP probes tested both tenant principals, own asset creation/read, own asset event write, cross-tenant asset read denial, cross-tenant event write denial confirmed by unchanged database row count, unauthenticated denial, and verified fixture cleanup. sourceCommitHint and pipelineId come from the running Vercel deployment proof, not from the collector workflow; collectorCommit and collectorPipelineId are recorded separately. Users are disabled and probe organizations retained under archived names to keep immutable audit actor references resolvable. No evidence rebind.',
    sourceCommitHint: commit,
    pipelineId,
    parentBranchId,
    deploymentId: deploymentIdentity.deploymentId,
    deploymentRef: deploymentIdentity.ref,
    deploymentIdentitySource: deploymentIdentity.sourceCommitIdentitySource,
    deploymentIdentityObservedAt: deploymentIdentity.observedAt,
    collectorCommit,
    collectorPipelineId,
    evidenceClass: 'PRODUCTION_DUAL_TENANT_HTTP'
  };
  if (!allPass && !reportReason) reportReason = 'REQUIRED_PROBE_OR_CLEANUP_FAILED';
  if (reportReason) report.reason = reportReason;
  writeReport(report);
  process.stdout.write(JSON.stringify({ status: report.status, checks, sourceCommitHint: commit, databaseName: target.databaseName }) + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch(error => {
  console.error('PRODUCTION_SESSION_ISOLATION_UNEXPECTED_FAILURE', String(error && (error.code || error.message) || error).slice(0, 250));
  process.exit(1);
});
