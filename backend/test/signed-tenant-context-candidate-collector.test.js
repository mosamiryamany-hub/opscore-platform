'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CANDIDATE_ROUTE_PROOF_REQUIREMENTS,
  buildCandidateSignedTenantRouteCoverage,
  candidateOrigin,
  validateCandidateProbeEnvironment,
  validateCandidateRuntimeProofs,
  isSignedTenantManifestRoute,
  queryHttp
} = require('../scripts/signed-tenant-context-postgres-gate');

const fs = require('node:fs');
const path = require('node:path');
const manifestPath = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const inventoryPath = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');
const manifestBytes = fs.readFileSync(manifestPath);
const inventoryBytes = fs.readFileSync(inventoryPath);
const signedRouteManifest = JSON.parse(manifestBytes.toString('utf8'));
const routeInventory = JSON.parse(inventoryBytes.toString('utf8'));

const BASE = {
  OPSC_SIGNED_CONTEXT_CANDIDATE_HTTP_ORIGIN: 'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
  OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'a'.repeat(64),
  VERCEL_TRUSTED_OIDC_TOKEN: 'header.payload.signature',
  VERCEL_ENV: 'production',
  OPSC_PRODUCTION_HOLD: 'true',
  OPSC_RELEASE_VERIFIED: 'false',
  OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
  OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'false',
  OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'false'
};

test('candidate origin accepts only an HTTPS unaliased Vercel deployment for this project/team', () => {
  assert.equal(
    candidateOrigin(BASE.OPSC_SIGNED_CONTEXT_CANDIDATE_HTTP_ORIGIN),
    'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app'
  );
  for (const value of [
    'https://opscore-platform.vercel.app',
    'http://opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    'https://opscore-platform-candidate123-other-team.vercel.app',
    'https://example.com',
    'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app/path',
    'https://user:password@opscore-platform-candidate123-mosamiryamany-1692.vercel.app'
  ]) {
    assert.throws(() => candidateOrigin(value));
  }
});

test('candidate probe configuration requires Production plus an active hold and no release/autobind', () => {
  assert.equal(validateCandidateProbeEnvironment(BASE),
    'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app');

  const blocked = [
    { OPSC_PRODUCTION_HOLD: 'false' },
    { OPSC_RELEASE_VERIFIED: 'true' },
    { OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'false' },
    { OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'true' },
    { OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true' },
    { VERCEL_ENV: 'preview' },
    { OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'not-a-256-bit-hex-token' },
    { VERCEL_TRUSTED_OIDC_TOKEN: 'not-a-jwt' }
  ];
  for (const change of blocked) {
    assert.throws(() => validateCandidateProbeEnvironment({ ...BASE, ...change }));
  }
});

test('remote candidate HTTP requests carry the tenant probe token and Vercel Trusted OIDC token', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  const previousOidc = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
  let observed = null;
  process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN = BASE.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  process.env.VERCEL_TRUSTED_OIDC_TOKEN = BASE.VERCEL_TRUSTED_OIDC_TOKEN;
  global.fetch = async (url, options) => {
    observed = { url: String(url), options };
    return {
      status: 200,
      headers: { entries: () => [['content-type', 'application/json'], ['x-opscore-candidate-guc-tamper', 'applied']] },
      text: async () => JSON.stringify({ ok: true })
    };
  };
  try {
    const result = await queryHttp(
      'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
      '/api/v1/customers',
      'synthetic-session-token',
      { method: 'GET' }
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(observed.url,
      'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app/api/v1/customers');
    assert.equal(observed.options.headers.authorization, 'Bearer synthetic-session-token');
    assert.equal(observed.options.headers['x-opscore-signed-context-probe'], BASE.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN);
    assert.equal(observed.options.headers['x-vercel-trusted-oidc-idp-token'], BASE.VERCEL_TRUSTED_OIDC_TOKEN);
    assert.equal(observed.options.redirect, 'manual');
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
    else process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN = previousToken;
    if (previousOidc === undefined) delete process.env.VERCEL_TRUSTED_OIDC_TOKEN;
    else process.env.VERCEL_TRUSTED_OIDC_TOKEN = previousOidc;
  }
});

test('remote candidate HTTP helper refuses requests outside the candidate origin and API namespace', async () => {
  const previousFetch = global.fetch;
  process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN = BASE.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  process.env.VERCEL_TRUSTED_OIDC_TOKEN = BASE.VERCEL_TRUSTED_OIDC_TOKEN;
  global.fetch = async () => { throw new Error('FETCH_MUST_NOT_RUN'); };
  try {
    await assert.rejects(
      queryHttp('https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app', 'https://example.com/api/v1/customers', 'token'),
      /CANDIDATE_HTTP_ROUTE_ORIGIN_INVALID/
    );
    await assert.rejects(
      queryHttp('https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app', '/api/../admin', 'token'),
      /CANDIDATE_HTTP_ROUTE_ORIGIN_INVALID/
    );
  } finally {
    global.fetch = previousFetch;
    delete process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
    delete process.env.VERCEL_TRUSTED_OIDC_TOKEN;
  }
});


test('candidate mode does not open direct runtime-role Postgres connections for local HMAC replay probes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const gate = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'signed-tenant-context-postgres-gate.js'), 'utf8');
  for (const [label, needle] of [
    ['clientA', 'clientA = new Client({ connectionString: runtimeUrl });'],
    ['clientB', 'clientB = new Client({ connectionString: runtimeUrl });']
  ]) {
    const at = gate.indexOf(needle);
    assert.ok(at >= 0, label + ' runtime client must remain available to local CI tests');
    const before = gate.slice(Math.max(0, at - 500), at);
    assert.ok(before.includes('if (!candidateMode) {'),
      label + ' runtime client must be created only outside candidate mode');
  }
});

test('Production candidate routes tamper raw tenant GUCs only after verified signed context activation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');

  const helperStart = server.indexOf('function applyCandidateProbeTenantGucTampering(req, res)');
  const helperEnd = server.indexOf('function runSignedWorkOrdersRead', helperStart);
  const helper = server.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helper.includes('isCandidateProbeAuthorized(req, process.env, signedContextProductionReadiness)'));
  assert.ok(helper.includes("set_config('app.tenant_id'"));
  assert.ok(helper.includes("set_config('app.user_id'"));
  assert.ok(helper.includes("set_config('app.access_mode'"));
  assert.ok(helper.includes("x-opscore-candidate-guc-tamper"));

  const readStart = server.indexOf('function runSignedWorkOrdersRead(req, res, c, reader');
  const readActivate = server.indexOf('store.db.activateVerifiedTenantContext();', readStart);
  const readProbe = server.indexOf('applyCandidateProbeTenantGucTampering(req, res);', readActivate);
  const readQuery = server.indexOf('const result = reader();', readProbe);
  assert.ok(readStart >= 0 && readActivate > readStart && readProbe > readActivate && readQuery > readProbe,
    'candidate read GUC tampering must happen after signature activation and before the route query');

  assert.equal(server.includes('runSignedWorkOrdersRead(res, c,'), false);
  assert.equal(server.includes('runSignedWorkOrderWrite(res, c,'), false);

  const writeStart = server.indexOf('function runSignedWorkOrderWrite(req, res, c, writer');
  const writeActivate = server.indexOf('store.db.activateVerifiedTenantContext();', writeStart);
  const writeProbe = server.indexOf('applyCandidateProbeTenantGucTampering(req, res);', writeActivate);
  const writeQuery = server.indexOf('const result = store.withCallerManagedTransaction(writer, lifecycle);', writeProbe);
  assert.ok(writeStart >= 0 && writeActivate > writeStart && writeProbe > writeActivate && writeQuery > writeProbe,
    'candidate write GUC tampering must happen after signature activation and before the domain write');
});

function candidateRuntimeProofs(overrides = {}) {
  const commit = 'a'.repeat(40);
  const deploymentResponse = {
    status: 200,
    body: {
      status: 'identified',
      source: { commitSha: commit, ref: 'main' },
      deployment: { environment: 'production', id: 'dpl_CandidateIdentity123' }
    }
  };
  const databaseResponse = {
    status: 200,
    body: {
      schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
      deployment: { commitSha: commit, pipelineId: '123456789', ref: 'main' },
      environment: {
        vercelEnvironment: 'production',
        nodeEnvironmentProduction: true,
        databaseEnginePostgres: true,
        applicationDatabaseUrlAligned: true,
        migrationDatabaseUrlAbsent: true,
        bootstrapDatabaseUrlAbsent: true,
        productionHoldEffectiveActive: true,
        releaseVerifiedEffective: false,
        releaseProofVerified: false
      },
      database: {
        status: 'IDENTITY_RESOLVED',
        identityScope: 'APPLICATION_DATABASE',
        applicationDatabaseBinding: 'PRESENT',
        connectionSource: 'OPSC_DATABASE_URL',
        writeOperations: 0,
        identity: {
          database_name: 'opscore_acceptance',
          session_user: 'opscore_runtime',
          current_user: 'opscore_runtime',
          transaction_read_only: 'on'
        },
        roles: [{
          role_name: 'opscore_runtime',
          role_exists: true,
          can_login: true,
          superuser: false,
          bypass_rls: false,
          create_role: false,
          create_db: false,
          elevated_role_membership: false
        }]
      }
    }
  };
  if (overrides.deploymentResponse) Object.assign(deploymentResponse, overrides.deploymentResponse);
  if (overrides.databaseResponse) {
    Object.assign(databaseResponse, overrides.databaseResponse);
    if (overrides.databaseResponse.body) {
      databaseResponse.body = {
        ...databaseResponse.body,
        ...overrides.databaseResponse.body,
        deployment: {
          ...databaseResponse.body.deployment,
          ...(overrides.databaseResponse.body.deployment || {})
        },
        environment: {
          ...databaseResponse.body.environment,
          ...(overrides.databaseResponse.body.environment || {})
        },
        database: {
          ...databaseResponse.body.database,
          ...(overrides.databaseResponse.body.database || {}),
          identity: {
            ...databaseResponse.body.database.identity,
            ...((overrides.databaseResponse.body.database || {}).identity || {})
          },
          roles: (overrides.databaseResponse.body.database || {}).roles || databaseResponse.body.database.roles
        }
      };
    }
  }
  return { deploymentResponse, databaseResponse, commit };
}

test('candidate runtime identity requires exact deployment, application database, runtime role and active hold', () => {
  const { deploymentResponse, databaseResponse, commit } = candidateRuntimeProofs();
  const proof = validateCandidateRuntimeProofs(deploymentResponse, databaseResponse, {
    GITHUB_SHA: commit,
    GITHUB_RUN_ID: '123456789',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance'
  });
  assert.equal(proof.deploymentId, 'dpl_CandidateIdentity123');
  assert.equal(proof.sourceCommit, commit);
  assert.equal(proof.pipelineId, '123456789');
  assert.equal(proof.databaseName, 'opscore_acceptance');
  assert.equal(proof.currentUser, 'opscore_runtime');
  assert.equal(proof.readOnlyInspection, true);
  assert.equal(proof.writeOperations, 0);
  assert.equal(proof.holdActive, true);
  assert.equal(proof.releaseVerified, false);
  assert.equal(proof.releaseProofVerified, false);
});

test('candidate runtime identity rejects a different commit, pipeline, domain or database role', () => {
  const { deploymentResponse, databaseResponse, commit } = candidateRuntimeProofs();
  const env = {
    GITHUB_SHA: commit,
    GITHUB_RUN_ID: '123456789',
    OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance'
  };
  assert.throws(() => validateCandidateRuntimeProofs({
    ...deploymentResponse,
    body: { ...deploymentResponse.body, source: { ...deploymentResponse.body.source, commitSha: 'b'.repeat(40) } }
  }, databaseResponse, env), /CANDIDATE_DEPLOYMENT_IDENTITY_MISMATCH/);
  assert.throws(() => validateCandidateRuntimeProofs(deploymentResponse, {
    ...databaseResponse,
    body: { ...databaseResponse.body, deployment: { ...databaseResponse.body.deployment, pipelineId: '999999999' } }
  }, env), /CANDIDATE_RUNTIME_DATABASE_IDENTITY_MISMATCH/);
  assert.throws(() => validateCandidateRuntimeProofs(deploymentResponse, {
    ...databaseResponse,
    body: { ...databaseResponse.body, environment: { ...databaseResponse.body.environment, productionHoldEffectiveActive: false } }
  }, env), /CANDIDATE_RUNTIME_DATABASE_IDENTITY_MISMATCH/);
  assert.throws(() => validateCandidateRuntimeProofs(deploymentResponse, {
    ...databaseResponse,
    body: { ...databaseResponse.body, database: { ...databaseResponse.body.database, identity: { ...databaseResponse.body.database.identity, current_user: 'neondb_owner' } } }
  }, env), /CANDIDATE_RUNTIME_DATABASE_IDENTITY_MISMATCH/);
});

test('candidate route matcher recognises exact manifest method and parameterized route paths only', () => {
  assert.equal(isSignedTenantManifestRoute('GET', '/api/v1/customers'), true);
  assert.equal(isSignedTenantManifestRoute('GET', '/api/v1/work-orders/wo_123/timeline'), true);
  assert.equal(isSignedTenantManifestRoute('PATCH', '/api/v1/assets/ast_123'), true);
  assert.equal(isSignedTenantManifestRoute('PUT', '/api/v1/evidence-uploads/up_123/chunks/12'), true);
  assert.equal(isSignedTenantManifestRoute('POST', '/api/v1/work-orders/wo_123/timeline'), false);
  assert.equal(isSignedTenantManifestRoute('GET', '/api/v1/autopilot/decision-memory'), false);
});

test('remote candidate manifest route requires explicit confirmation that GUC tampering executed', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  const previousOidc = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
  process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN = BASE.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  process.env.VERCEL_TRUSTED_OIDC_TOKEN = BASE.VERCEL_TRUSTED_OIDC_TOKEN;
  global.fetch = async () => ({
    status: 200,
    headers: { entries: () => [['content-type', 'application/json']] },
    text: async () => JSON.stringify([{ id: 'tenant-a-row' }])
  });
  try {
    await assert.rejects(
      queryHttp(
        'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
        '/api/v1/customers',
        'synthetic-session-token'
      ),
      /CANDIDATE_GUC_TAMPER_NOT_CONFIRMED/
    );
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
    else process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN = previousToken;
    if (previousOidc === undefined) delete process.env.VERCEL_TRUSTED_OIDC_TOKEN;
    else process.env.VERCEL_TRUSTED_OIDC_TOKEN = previousOidc;
  }
});



function setProofPath(target, locator, value = 'PASS') {
  const parts = locator.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current[part] ||= {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function completeCandidateProofFixture() {
  const proof = {};
  for (const requirement of Object.values(CANDIDATE_ROUTE_PROOF_REQUIREMENTS)) {
    for (const locator of [...requirement.a, ...requirement.b, ...requirement.cross]) {
      setProofPath(proof, locator);
    }
  }
  return proof;
}

test('candidate route proof requirements are a one-to-one inventory of the approved 67-route manifest', () => {
  const manifestKeys = signedRouteManifest.routes.map(route =>
    String(route.method).toUpperCase() + ' ' + route.path
  );
  const requirementKeys = Object.keys(CANDIDATE_ROUTE_PROOF_REQUIREMENTS);
  assert.equal(signedRouteManifest.routeCount, 67);
  assert.equal(signedRouteManifest.routes.length, 67);
  assert.equal(requirementKeys.length, 67);
  assert.deepEqual([...requirementKeys].sort(), [...manifestKeys].sort());
  assert.equal(new Set(requirementKeys).size, 67);
  assert.ok(CANDIDATE_ROUTE_PROOF_REQUIREMENTS[
    'PUT /api/v1/evidence-uploads/{id}/chunks/(\\d+)'
  ], 'numeric chunk route must match the manifest backslash encoding exactly');
});

test('candidate route coverage emits 67 rows and passes only routes with complete A/B and cross-tenant proofs', () => {
  const proof = completeCandidateProofFixture();
  const evidence = buildCandidateSignedTenantRouteCoverage({
    proof,
    manifest: signedRouteManifest,
    inventory: routeInventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    databaseName: 'opscore_acceptance',
    parentBranchId: 'br-proud-salad-bcshhdap',
    deploymentId: 'dpl_CandidateRouteProof123',
    sourceCommitHint: 'a'.repeat(40),
    pipelineId: '123456789'
  });
  const expectedCompleteRequirements = Object.values(CANDIDATE_ROUTE_PROOF_REQUIREMENTS)
    .filter(requirement => requirement.a.length > 0
      && requirement.b.length > 0
      && requirement.cross.length > 0).length;

  assert.equal(evidence.status, 'NOT_VERIFIED',
    'known incomplete route proofs must prevent the whole matrix from passing');
  assert.equal(evidence.expectedRouteCount, 67);
  assert.equal(evidence.coveredRouteCount, expectedCompleteRequirements);
  assert.equal(evidence.failedRouteCount, 67 - expectedCompleteRequirements);
  assert.equal(evidence.routes.length, 67);
  const completedRoute = evidence.routes.find(route =>
    route.method === 'PATCH' && route.path === '/api/v1/work-orders/{id}'
  );
  assert.equal(completedRoute.status, 'PASS');
  assert.equal(completedRoute.signedContextBound, true);
  assert.equal(completedRoute.sessionBound, true);
  assert.equal(completedRoute.transactionBound, true);
  assert.equal(completedRoute.rawGucTamperDenied, true);
  assert.equal(completedRoute.tenantAWrite, true);
  assert.equal(completedRoute.tenantBWrite, true);
  assert.equal(completedRoute.crossTenantWriteDenied, true);
  assert.match(evidence.routeManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.routeInventorySha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceRebind, null);
});
test('missing per-route proof reduces the covered count and keeps the affected rows NOT_VERIFIED', () => {
  const proof = completeCandidateProofFixture();
  const baseline = buildCandidateSignedTenantRouteCoverage({
    proof,
    manifest: signedRouteManifest,
    inventory: routeInventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true
  });
  delete proof.session.appointmentListTenantA;
  delete proof.session.appointmentCrossTenantUpdateDenied;

  const evidence = buildCandidateSignedTenantRouteCoverage({
    proof,
    manifest: signedRouteManifest,
    inventory: routeInventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    databaseName: 'opscore_acceptance',
    parentBranchId: 'br-proud-salad-bcshhdap',
    deploymentId: 'dpl_CandidateRouteProof123',
    sourceCommitHint: 'a'.repeat(40),
    pipelineId: '123456789'
  });

  assert.equal(evidence.status, 'NOT_VERIFIED');
  assert.equal(evidence.routes.length, 67);
  assert.equal(evidence.coveredRouteCount, baseline.coveredRouteCount - 2);
  assert.equal(evidence.failedRouteCount, 67 - evidence.coveredRouteCount);
  const list = evidence.routes.find(route => route.method === 'GET' && route.path === '/api/v1/appointments');
  assert.equal(list.status, 'NOT_VERIFIED');
  assert.equal(list.tenantARead, false);
  assert.equal(list.tenantBRead, true);
  assert.equal(list.crossTenantReadDenied, false);
  assert.ok(list.unresolvedReasons.includes('TENANT_A_ROUTE_PROOF_MISSING'));

  const patch = evidence.routes.find(route => route.method === 'PATCH' && route.path === '/api/v1/appointments/{id}');
  assert.equal(patch.crossTenantWriteDenied, false);
  assert.ok(patch.unresolvedReasons.includes('CROSS_TENANT_WRITE_DENIAL_PROOF_MISSING'));
});
test('the route matrix cannot certify from local CI proof maps without candidate-mode GUC tamper confirmation', () => {
  const evidence = buildCandidateSignedTenantRouteCoverage({
    proof: completeCandidateProofFixture(),
    manifest: signedRouteManifest,
    inventory: routeInventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: false,
    databaseName: 'opscore_http_acceptance',
    parentBranchId: 'br-local-test-branch',
    deploymentId: 'dpl_LocalFixture123',
    sourceCommitHint: 'a'.repeat(40),
    pipelineId: '123456789'
  });
  assert.equal(evidence.status, 'NOT_VERIFIED');
  assert.equal(evidence.coveredRouteCount, 0);
  assert.equal(evidence.failedRouteCount, 67);
  assert.equal(evidence.routes.every(route => route.rawGucTamperDenied === false), true);
});

test('manifest or inventory drift prevents the 67-route matrix from passing', () => {
  const driftedManifest = {
    ...signedRouteManifest,
    routes: signedRouteManifest.routes.slice(0, 66),
    routeCount: 66
  };
  const evidence = buildCandidateSignedTenantRouteCoverage({
    proof: completeCandidateProofFixture(),
    manifest: driftedManifest,
    inventory: routeInventory,
    manifestBytes,
    inventoryBytes,
    candidateMode: true,
    databaseName: 'opscore_acceptance',
    parentBranchId: 'br-proud-salad-bcshhdap',
    deploymentId: 'dpl_CandidateRouteProof123',
    sourceCommitHint: 'a'.repeat(40),
    pipelineId: '123456789'
  });
  assert.equal(evidence.status, 'NOT_VERIFIED');
  assert.equal(evidence.manifestComplete, false);
  assert.equal(evidence.routes.length, 66);
});
