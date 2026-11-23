'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORIGIN = 'https://opscore-platform.vercel.app';
const EXPECTED_PRODUCTION_COMMIT = '8011bc5550372a318dbf47bf89e6837059987f58';
const EXPECTED_PRODUCTION_DEPLOYMENT = 'dpl_6r4ZCJiuVHonja32AXhsjwMSDoig';
const MAX_RESPONSE_BYTES = 1024 * 1024;

const TARGETS = [
  { path: '/', kind: 'homepage', expected: 'html' },
  { path: '/terms.html', kind: 'legal-page', expected: 'html' },
  { path: '/privacy.html', kind: 'legal-page', expected: 'html' },
  { path: '/refund.html', kind: 'legal-page', expected: 'html' },
  { path: '/pricing.html', kind: 'legal-page', expected: 'html' },
  { path: '/legal.html', kind: 'legal-page', expected: 'html' },
  { path: '/security.html', kind: 'legal-page', expected: 'html' },
  { path: '/api/health', kind: 'read-only-api', expected: 'json' },
  { path: '/api/verify/deployment', kind: 'read-only-api', expected: 'json' },
  { path: '/api/verify/database', kind: 'read-only-api', expected: 'json' },
  { path: '/api/verify/database-security', kind: 'read-only-api', expected: 'json' },
  { path: '/api/verify/release', kind: 'read-only-api', expected: 'json' }
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function classifyLegalResponse({ statusCode, contentType, body, bodySha256, homepageSha256 }) {
  if (statusCode !== 200) return 'HTTP_NON_200';
  if (!String(contentType || '').toLowerCase().includes('text/html')) return 'CONTENT_TYPE_NOT_HTML';
  if (homepageSha256 && bodySha256 === homepageSha256) return 'SUSPECTED_HOMEPAGE_FALLBACK';
  if (/OWNER\s+DATA\s+REQUIRED/i.test(String(body || ''))) return 'REACHABLE_OWNER_DATA_REQUIRED';
  return 'REACHABLE_CONTENT_REQUIRES_OWNER_REVIEW';
}

function verifyDeploymentIdentity(payload, expected = {}) {
  const source = payload && payload.source && typeof payload.source === 'object' ? payload.source : {};
  const deployment = payload && payload.deployment && typeof payload.deployment === 'object' ? payload.deployment : {};
  const commit = String(source.commitSha || '').toLowerCase();
  const deploymentId = String(deployment.id || '');
  return {
    matches: payload?.status === 'identified'
      && commit === String(expected.commit || EXPECTED_PRODUCTION_COMMIT).toLowerCase()
      && source.ref === 'main'
      && deployment.environment === 'production'
      && deploymentId === String(expected.deploymentId || EXPECTED_PRODUCTION_DEPLOYMENT),
    observedCommit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
    observedRef: source.ref || null,
    observedEnvironment: deployment.environment || null,
    observedDeploymentId: /^dpl_[A-Za-z0-9]+$/.test(deploymentId) ? deploymentId : null
  };
}

async function requestTarget(target) {
  const started = Date.now();
  try {
    const response = await fetch(new URL(target.path, ORIGIN), {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        accept: target.expected === 'json' ? 'application/json' : 'text/html',
        'cache-control': 'no-store',
        'user-agent': 'opscore-production-public-route-diagnostic/1.0'
      },
      signal: AbortSignal.timeout(15000)
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      return {
        path: target.path, kind: target.kind, statusCode: response.status,
        contentType: response.headers.get('content-type') || '',
        classification: 'RESPONSE_TOO_LARGE', responseBytes: bytes.byteLength,
        elapsedMs: Date.now() - started
      };
    }
    const body = bytes.toString('utf8');
    const contentType = response.headers.get('content-type') || '';
    const ownerDataRequiredMarkerFound = target.kind === 'legal-page' && /OWNER\s+DATA\s+REQUIRED/i.test(body);
    const result = {
      path: target.path,
      kind: target.kind,
      expected: target.expected,
      ownerDataRequiredMarkerFound,
      statusCode: response.status,
      contentType,
      responseBytes: bytes.byteLength,
      responseSha256: sha256(bytes),
      elapsedMs: Date.now() - started,
      redirectLocationPath: null,
      jsonValid: null,
      semanticCheck: 'NOT_ASSESSED',
      classification: response.status === 200 ? 'HTTP_200' : 'HTTP_NON_200'
    };
    const location = response.headers.get('location');
    if (location) {
      try {
        const parsed = new URL(location, ORIGIN);
        result.redirectLocationPath = parsed.origin === ORIGIN ? parsed.pathname : 'EXTERNAL_ORIGIN_REDACTED';
      } catch {
        result.redirectLocationPath = 'INVALID_LOCATION_REDACTED';
      }
    }
    if (target.expected === 'html') {
      result.classification = classifyLegalResponse({
        statusCode: response.status,
        contentType,
        body,
        bodySha256: result.responseSha256,
        homepageSha256: null
      });
      if (target.path === '/') {
        result.classification = response.status === 200 && contentType.toLowerCase().includes('text/html')
          ? 'HOMEPAGE_HTTP_200_HTML'
          : result.classification;
      }
    } else {
      let payload = null;
      try { payload = JSON.parse(body); } catch { payload = null; }
      result.jsonValid = Boolean(payload && typeof payload === 'object' && !Array.isArray(payload));
      if (!result.jsonValid) result.classification = response.status === 200 ? 'HTTP_200_INVALID_JSON' : 'HTTP_NON_200';
      if (target.path === '/api/health' && result.jsonValid) {
        result.semanticCheck = payload.ok === true && payload.status === 'healthy' && payload.engine === 'postgres'
          ? 'HEALTH_CONTRACT_MATCH'
          : 'HEALTH_CONTRACT_MISMATCH';
      } else if (target.path === '/api/verify/deployment' && result.jsonValid) {
        const identity = verifyDeploymentIdentity(payload);
        result.deploymentIdentity = identity;
        result.semanticCheck = identity.matches ? 'EXACT_DEPLOYMENT_IDENTITY_MATCH' : 'DEPLOYMENT_IDENTITY_MISMATCH';
      } else if (target.path === '/api/verify/database' && result.jsonValid) {
        result.semanticCheck = payload.ok === true && payload.engine === 'postgres'
          ? 'DATABASE_CONNECTIVITY_CONTRACT_MATCH'
          : 'DATABASE_CONNECTIVITY_CONTRACT_MISMATCH';
      } else if (target.path === '/api/verify/database-security' && result.jsonValid) {
        result.semanticCheck = 'JSON_OBSERVED_SECURITY_STATUS_NOT_CERTIFIED';
        result.securitySummary = {
          status: payload.status || null,
          ordinaryTableCount: Number.isFinite(Number(payload.publicSchema?.ordinaryTableCount))
            ? Number(payload.publicSchema.ordinaryTableCount) : null,
          rlsEnabledTableCount: Number.isFinite(Number(payload.publicSchema?.rlsEnabledTableCount))
            ? Number(payload.publicSchema.rlsEnabledTableCount) : null,
          rlsForcedTableCount: Number.isFinite(Number(payload.publicSchema?.rlsForcedTableCount))
            ? Number(payload.publicSchema.rlsForcedTableCount) : null,
          runtimeRoleStatus: payload.runtimeRole?.status || null
        };
      } else if (target.path === '/api/verify/release' && result.jsonValid) {
        result.semanticCheck = 'RELEASE_PROOF_OBSERVED_NOT_REQUALIFIED';
        result.releaseStatus = payload.status || null;
      }
    }
    return result;
  } catch (error) {
    return {
      path: target.path,
      kind: target.kind,
      expected: target.expected,
      statusCode: null,
      contentType: '',
      responseBytes: 0,
      elapsedMs: Date.now() - started,
      jsonValid: null,
      semanticCheck: 'NOT_ASSESSED',
      classification: 'FETCH_ERROR',
      errorCode: String(error?.name || 'Error').slice(0, 64)
    };
  }
}

function finalizeLegalClassifications(observations) {
  const homepage = observations.find(row => row.path === '/');
  if (!homepage || !homepage.responseSha256) return observations;
  for (const row of observations) {
    if (row.kind !== 'legal-page' || row.statusCode !== 200) continue;
    row.classification = classifyLegalResponse({
      statusCode: row.statusCode,
      contentType: row.contentType,
      body: row.ownerDataRequiredMarkerFound ? 'OWNER DATA REQUIRED' : '',
      bodySha256: row.responseSha256,
      homepageSha256: homepage.responseSha256
    });
    if (row.classification === 'REACHABLE_CONTENT_REQUIRES_OWNER_REVIEW') {
      row.classification = 'REACHABLE_CONTENT_APPROVAL_NOT_ASSESSED';
    }
  }
  return observations;
}

async function run() {
  const observations = [];
  for (const target of TARGETS) observations.push(await requestTarget(target));
  finalizeLegalClassifications(observations);

  const deployment = observations.find(row => row.path === '/api/verify/deployment');
  const health = observations.find(row => row.path === '/api/health');
  const allHttp200 = observations.every(row => row.statusCode === 200);
  const allExpectedBodies = observations.every(row =>
    row.expected === 'html'
      ? String(row.contentType || '').toLowerCase().includes('text/html')
      : row.jsonValid === true
  );
  const exactDeploymentBinding = deployment?.deploymentIdentity?.matches === true;
  const report = {
    schemaVersion: 'opscore.production-public-route-diagnostic.v1',
    testedAt: new Date().toISOString(),
    targetOrigin: ORIGIN,
    requestPolicy: { method: 'GET_ONLY', credentials: 'NONE', writes: 0, redirects: 'NOT_FOLLOWED' },
    expectedProductionIdentity: {
      commitSha: EXPECTED_PRODUCTION_COMMIT,
      deploymentId: EXPECTED_PRODUCTION_DEPLOYMENT
    },
    observedProductionIdentity: deployment?.deploymentIdentity || null,
    diagnosticStatus: allHttp200 && allExpectedBodies && exactDeploymentBinding && health?.semanticCheck === 'HEALTH_CONTRACT_MATCH'
      ? 'OBSERVED'
      : 'INCOMPLETE',
    checks: {
      targetCount: observations.length,
      http200Count: observations.filter(row => row.statusCode === 200).length,
      fetchErrorCount: observations.filter(row => row.classification === 'FETCH_ERROR').length,
      exactDeploymentBinding: exactDeploymentBinding ? 'MATCH' : 'UNVERIFIED_OR_MISMATCH',
      healthContract: health?.semanticCheck || 'UNVERIFIED',
      legalRoutes: observations.filter(row => row.kind === 'legal-page').map(row => ({
        path: row.path,
        statusCode: row.statusCode,
        classification: row.classification,
        contentSha256: row.responseSha256 || null
      }))
    },
    scope: {
      productionCertification: false,
      legalContentApproval: 'NOT_ASSERTED',
      completeApiRouteAcceptance: 'NOT_PERFORMED',
      businessFlowAcceptance: 'NOT_PERFORMED',
      tenantIsolationAcceptance: 'NOT_PERFORMED',
      databaseMutation: false,
      productionDeployment: false
    },
    observations
  };

  const outputPath = path.resolve(process.env.OPSC_PRODUCTION_PUBLIC_ROUTE_RESULT_FILE
    || 'OPSC_PRODUCTION_PUBLIC_ROUTE_DIAGNOSTIC.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      '# Production public-route diagnostic',
      '',
      '**Diagnostic status:** ' + report.diagnosticStatus,
      '**Exact deployment binding:** ' + report.checks.exactDeploymentBinding,
      '**HTTP 200:** ' + report.checks.http200Count + '/' + report.checks.targetCount,
      '',
      '| Path | HTTP | Classification |',
      '|---|---:|---|',
      ...observations.map(row => '| ' + row.path + ' | ' + (row.statusCode ?? '—') + ' | ' + row.classification + ' |'),
      '',
      '> GET-only anonymous observations. This report is not production certification, legal approval, full route acceptance, business-flow acceptance, or tenant-isolation evidence.'
    ];
    fs.appendFileSync(summaryPath, lines.join('\n') + '\n');
  }
}

if (require.main === module) {
  run().catch(error => {
    console.error('PRODUCTION_PUBLIC_ROUTE_DIAGNOSTIC_FAILED', String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = { classifyLegalResponse, verifyDeploymentIdentity, finalizeLegalClassifications, TARGETS };
