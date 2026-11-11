'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeploymentUrl, parseCurlResponse, validateEndpoint } = require('../../scripts/production-deployment-smoke');

const commit = '48ed78a825020986c53bd045e50c8ea852f53275';

test('deployment URL accepts only HTTPS Vercel deployment hosts without paths or credentials', () => {
  assert.equal(parseDeploymentUrl('https://opscore-platform-abc.vercel.app').hostname, 'opscore-platform-abc.vercel.app');
  for (const value of [
    'http://opscore-platform-abc.vercel.app',
    'https://example.com',
    'https://other-project-abc.vercel.app',
    'https://user:pass@opscore-platform-abc.vercel.app',
    'https://opscore-platform-abc.vercel.app/path',
    'https://opscore-platform-abc.vercel.app/?token=x'
  ]) assert.throws(() => parseDeploymentUrl(value));
});

test('curl response parser extracts status, content type and body without exposing headers', () => {
  const parsed = parseCurlResponse(['HTTP/2 200', 'content-type: application/json; charset=utf-8', 'cache-control: no-store', '', '{"ok":true}', '__OPSC_HTTP_STATUS__:200'].join(String.fromCharCode(13, 10)));
  assert.equal(parsed.statusCode, 200);
  assert.equal(parsed.contentType, 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(parsed.body), { ok: true });
  assert.throws(() => parseCurlResponse('missing marker'), /CURL_STATUS_MARKER_MISSING/);
});

test('health proof requires healthy PostgreSQL service', () => {
  assert.equal(validateEndpoint('/api/health', 200, { ok: true, status: 'healthy', engine: 'postgres' }, commit), true);
  assert.throws(() => validateEndpoint('/api/health', 200, { ok: true, status: 'healthy', engine: 'sqlite' }, commit), /HEALTH_CONTRACT_FAILED/);
  assert.throws(() => validateEndpoint('/api/health', 500, {}, commit), /HTTP_500/);
});

test('deployment proof must identify the exact production main commit', () => {
  const valid = {
    status: 'identified',
    source: { commitSha: commit, ref: 'main' },
    deployment: { environment: 'production', id: 'dpl_123abc' }
  };
  assert.equal(validateEndpoint('/api/verify/deployment', 200, valid, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/deployment', 200, {
    ...valid, source: { ...valid.source, commitSha: 'f'.repeat(40) }
  }, commit), /DEPLOYMENT_IDENTITY_MISMATCH/);
});

test('database proof requires a successful PostgreSQL connectivity check', () => {
  assert.equal(validateEndpoint('/api/verify/database', 200, { ok: true, engine: 'postgres' }, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/database', 200, { ok: false, engine: 'postgres' }, commit), /DATABASE_CONNECTIVITY_FAILED/);
});

test('database security proof rejects missing restrictive policy catalog evidence', () => {
  const valid = {
    status: 'IDENTITY_PLANE_RLS_ENFORCED',
    controlPlaneTenantBoundaryPolicies: { status: 'CATALOG_ENFORCED', validatedTableCount: 3 },
    controlPlaneRuntimePrivileges: { status: 'LEAST_PRIVILEGE_PRESENT', privilegeGapCount: 0 }
  };
  assert.equal(validateEndpoint('/api/verify/database-security', 200, valid, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/database-security', 200, {
    ...valid, controlPlaneTenantBoundaryPolicies: { status: 'REVIEW_REQUIRED', validatedTableCount: 0 }
  }, commit), /DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE/);
});

test('release proof must bind CI, package, HTTP acceptance, and deployment to the exact commit', () => {
  const valid = {
    status: 'PASS_WITH_BUYER_RESIDUALS',
    sourceCommit: commit,
    ci: { status: 'PASS', commitSha: commit, pipelineId: 42949619029 },
    deployment: { status: 'identified', environment: 'production', ref: 'main' },
    postgresHttpAcceptance: { status: 'PASS', evidenceCommit: commit, evidencePipelineId: '42949619029' },
    packageFingerprint: { status: 'PUBLISHED', sourceCommit: commit }
  };
  assert.equal(validateEndpoint('/api/verify/release', 200, valid, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/release', 200, {
    ...valid, packageFingerprint: { status: 'PUBLISHED', sourceCommit: 'f'.repeat(40) }
  }, commit), /RELEASE_EVIDENCE_NOT_BOUND_TO_DEPLOYMENT/);
});

test('root page must return HTML and unsupported paths fail closed', () => {
  assert.equal(validateEndpoint('/', 200, null, commit, 'text/html; charset=utf-8'), true);
  assert.throws(() => validateEndpoint('/', 200, null, commit, 'application/json'), /ROOT_CONTENT_TYPE_INVALID/);
  assert.throws(() => validateEndpoint('/api/ready', 200, {}, commit), /SMOKE_PATH_NOT_ALLOWED/);
});
