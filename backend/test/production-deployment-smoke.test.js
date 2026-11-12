'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeploymentUrl, parseCurlResponse, buildVercelCurlArgs, classifyVercelCurlFailure, validateEndpoint, runSmoke } = require('../../scripts/production-deployment-smoke');

const commit = '48ed78a825020986c53bd045e50c8ea852f53275';

test('Vercel curl command uses explicit team scope and authenticated token without logging it', () => {
  const env = { VERCEL_SCOPE: 'mosamiryamany-1692', VERCEL_ORG_ID: 'team_example', VERCEL_TOKEN: 'do-not-expose-this-token' };
  const args = buildVercelCurlArgs('https://opscore-platform-abc.vercel.app', '/api/health', 5, 45, env);
  assert.deepEqual(args.slice(0, 9), ['--no-color', '--scope', 'mosamiryamany-1692', '--token', env.VERCEL_TOKEN, 'curl', '/api/health', '--deployment', 'https://opscore-platform-abc.vercel.app']);
  assert.equal(args.filter(value => value === env.VERCEL_TOKEN).length, 1);
  assert.throws(() => buildVercelCurlArgs('https://opscore-platform-abc.vercel.app', '/api/health', 5, 45, { VERCEL_SCOPE: env.VERCEL_SCOPE }), /VERCEL_TOKEN_REQUIRED/);
  assert.throws(() => buildVercelCurlArgs('https://opscore-platform-abc.vercel.app', '/api/health', 5, 45, {}), /VERCEL_SCOPE_REQUIRED/);
  assert.throws(() => buildVercelCurlArgs('https://example.com', '/api/health', 5, 45, env), /VERCEL_DEPLOYMENT_URL_INVALID/);
  assert.throws(() => buildVercelCurlArgs('https://opscore-platform-abc.vercel.app', 'https://evil.example/path', 5, 45, env), /VERCEL_REQUEST_PATH_INVALID/);
});

test('Vercel CLI stderr is mapped to safe error classes without leaking its contents', () => {
  const secret = 'super-secret-token-value';
  const cases = [
    ['Deployment Protection requires authentication', 1, 'VERCEL_PROTECTION_AUTH_FAILED'],
    [`Error: Invalid token ${secret}`, 1, 'VERCEL_AUTH_FAILED'],
    ['Project not found in requested scope', 1, 'VERCEL_PROJECT_SCOPE_FAILED'],
    ['Deployment not found', 1, 'VERCEL_DEPLOYMENT_NOT_FOUND'],
    ['Unknown option --unknown', 1, 'VERCEL_CLI_ARGUMENT_ERROR'],
    ['connect ETIMEDOUT', 1, 'NETWORK_TIMEOUT'],
    ['connect ECONNRESET', 1, 'NETWORK_CONNECTION_FAILED'],
    ['argument parser returned usage error', 2, 'CLI_EXIT_2_UNCLASSIFIED'],
    ['curl: (2) no URL specified', 2, 'CURL_EXIT_2']
  ];
  for (const [stderr, exitCode, expected] of cases) {
    const result = classifyVercelCurlFailure(stderr, exitCode);
    assert.equal(result, expected);
    assert.equal(result.includes(secret), false);
    assert.match(result, /^[A-Z0-9_]+$/);
  }
});


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
  assert.throws(() => parseCurlResponse('missing response status'), /CURL_STATUS_MISSING/);
  const native = parseCurlResponse(['HTTP/2 204 No Content', 'content-type: application/json', '', ''].join(String.fromCharCode(13, 10)));
  assert.equal(native.statusCode, 204);
  assert.equal(native.body, '');
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
    productionIsolationCertification: 'CERTIFIED',
    controlPlaneTenantBoundaryPolicies: { status: 'CATALOG_ENFORCED', validatedTableCount: 3 },
    controlPlaneRuntimePrivileges: { status: 'LEAST_PRIVILEGE_PRESENT', privilegeGapCount: 0 },
    runtimeRole: { name: 'opscore_runtime', status: 'LEAST_PRIVILEGE_PRESENT', login: true, superuser: false, bypassRls: false, createRole: false, createDatabase: false, elevatedMembershipCount: 0 }
  };
  assert.equal(validateEndpoint('/api/verify/database-security', 200, valid, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/database-security', 200, {
    ...valid, controlPlaneTenantBoundaryPolicies: { status: 'REVIEW_REQUIRED', validatedTableCount: 0 }
  }, commit), /DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE/);
  assert.throws(() => validateEndpoint('/api/verify/database-security', 200, {
    ...valid, productionIsolationCertification: 'NOT_CERTIFIED'
  }, commit), /DATABASE_SECURITY_CATALOG_NOT_ACCEPTABLE/);
});

test('release proof must bind CI, package, HTTP acceptance, and deployment to the exact commit', () => {
  const valid = {
    status: 'PASS_WITH_BUYER_RESIDUALS',
    sourceCommit: commit,
    sourceCommitIdentitySource: 'github-actions-cli-assertion',
    ci: { status: 'PASS', commitSha: commit, pipelineId: 42949619029 },
    deployment: { status: 'identified', environment: 'production', ref: 'main' },
    postgresHttpAcceptance: { status: 'PASS', evidenceCommit: commit, evidencePipelineId: '42949619029' },
    productionAcceptance: { status: 'PASS', commitSha: commit, evidenceSha256: 'a'.repeat(64) },
    gates: { productionSessionTenantBoundary: 'PASS_PRODUCTION', productionRecoveryBundle: 'PASS_PRODUCTION', productionIsolationCertification: 'CERTIFIED' },
    packageFingerprint: { status: 'PUBLISHED', sourceCommit: commit }
  };
  assert.equal(validateEndpoint('/api/verify/release', 200, valid, commit), true);
  assert.throws(() => validateEndpoint('/api/verify/release', 200, {
    ...valid, packageFingerprint: { status: 'PUBLISHED', sourceCommit: 'f'.repeat(40) }
  }, commit), /RELEASE_EVIDENCE_NOT_BOUND_TO_DEPLOYMENT/);
  assert.throws(() => validateEndpoint('/api/verify/release', 200, {
    ...valid, productionAcceptance: { status: 'NOT_VERIFIED', commitSha: null, evidenceSha256: null }
  }, commit), /RELEASE_EVIDENCE_NOT_BOUND_TO_DEPLOYMENT/);
});

test('full staged smoke requires every endpoint to match the same release identity', async () => {
  const requested = [];
  const pipelineId = 42949619029;
  const release = {
    status: 'PASS_WITH_BUYER_RESIDUALS',
    sourceCommit: commit,
    sourceCommitIdentitySource: 'github-actions-cli-assertion',
    ci: { status: 'PASS', commitSha: commit, pipelineId },
    deployment: { status: 'identified', environment: 'production', ref: 'main' },
    postgresHttpAcceptance: { status: 'PASS', evidenceCommit: commit, evidencePipelineId: String(pipelineId) },
    productionAcceptance: { status: 'PASS', commitSha: commit, evidenceSha256: 'b'.repeat(64) },
    gates: { productionSessionTenantBoundary: 'PASS_PRODUCTION', productionRecoveryBundle: 'PASS_PRODUCTION', productionIsolationCertification: 'CERTIFIED' },
    packageFingerprint: { status: 'PUBLISHED', sourceCommit: commit }
  };
  const bodies = {
    '/api/health': { ok: true, status: 'healthy', engine: 'postgres' },
    '/api/verify/deployment': { status: 'identified', source: { commitSha: commit, ref: 'main' }, deployment: { environment: 'production', id: 'dpl_123abc' } },
    '/api/verify/database': { ok: true, engine: 'postgres' },
    '/api/verify/database-security': {
      status: 'IDENTITY_PLANE_RLS_ENFORCED',
      productionIsolationCertification: 'CERTIFIED',
      controlPlaneTenantBoundaryPolicies: { status: 'CATALOG_ENFORCED', validatedTableCount: 3 },
      controlPlaneRuntimePrivileges: { status: 'LEAST_PRIVILEGE_PRESENT', privilegeGapCount: 0 },
      runtimeRole: { name: 'opscore_runtime', status: 'LEAST_PRIVILEGE_PRESENT', login: true, superuser: false, bypassRls: false, createRole: false, createDatabase: false, elevatedMembershipCount: 0 }
    },
    '/api/verify/release': release
  };
  const result = await runSmoke('https://opscore-platform-abc.vercel.app', commit, async (_base, path) => {
    requested.push(path);
    return path === '/'
      ? { statusCode: 200, contentType: 'text/html; charset=utf-8', body: '<html></html>' }
      : { statusCode: 200, contentType: 'application/json', body: JSON.stringify(bodies[path]) };
  });
  assert.equal(result.passed, true);
  assert.deepEqual(requested, ['/', '/api/health', '/api/verify/deployment', '/api/verify/database', '/api/verify/database-security', '/api/verify/release']);
  assert.equal(result.checks.length, 6);
});

test('full staged smoke fails closed when one live proof endpoint is unavailable', async () => {
  const result = await runSmoke('https://opscore-platform-abc.vercel.app', commit, async (_base, path) => ({
    statusCode: path === '/api/verify/database-security' ? 503 : 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, status: 'healthy', engine: 'postgres' })
  }));
  assert.equal(result.passed, false);
  assert.equal(result.checks.find(x => x.path === '/api/verify/database-security').status, 'FAIL');
});

test('root page must return HTML and unsupported paths fail closed', () => {
  assert.equal(validateEndpoint('/', 200, null, commit, 'text/html; charset=utf-8'), true);
  assert.throws(() => validateEndpoint('/', 200, null, commit, 'application/json'), /ROOT_CONTENT_TYPE_INVALID/);
  assert.throws(() => validateEndpoint('/api/ready', 200, {}, commit), /SMOKE_PATH_NOT_ALLOWED/);
});
