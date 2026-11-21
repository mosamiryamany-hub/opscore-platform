'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROUTE_PATH,
  createProductionDatabaseIdentityHandler
} = require('../src/production-database-identity-route');

const baseEnv = {
  VERCEL_ENV: 'production',
  VERCEL_URL: 'opscore-platform-staged-abc-mosamiryamany-1692.vercel.app',
  NODE_ENV: 'production',
  DATABASE_ENGINE: 'postgres',
  OPSC_DATABASE_URL: 'postgresql://runtime:secret@ep-prod.example.neon.tech/app?sslmode=require&channel_binding=require',
  DATABASE_URL: 'postgresql://runtime:secret@ep-prod.example.neon.tech/app?sslmode=require&channel_binding=require',
  OPSC_PRODUCTION_HOLD: 'true',
  OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
  OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'a'.repeat(64),
  OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
  OPSC_RELEASE_VERIFIED: 'false',
  OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'NOT_CERTIFIED'
};

function responseSink() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') { this.body = value; return value; }
  };
}

function request(overrides = {}) {
  return {
    method: 'GET',
    url: ROUTE_PATH,
    headers: {
      host: baseEnv.VERCEL_URL,
      'x-opscore-signed-context-probe': baseEnv.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN,
      'x-opscore-trusted-oidc-idp-token': 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature'
    },
    ...overrides
  };
}

function applicationTlsReport(overrides = {}) {
  return {
    negotiated: true, authorized: true, verified: true,
    protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384',
    bits: null, backendPid: 12345, databaseName: 'opscore',
    roleName: 'opscore_runtime', serverVersion: '18.6',
    ...overrides
  };
}

function identityReport() {
  return {
    schemaVersion: 'opscore.production-database-identity-preflight.v1',
    checkedAt: '2026-11-12T17:00:00.000Z',
    status: 'IDENTITY_RESOLVED',
    productionCertification: false,
    writeOperations: 0,
    transactionMode: 'READ ONLY',
    connectionSource: 'OPSC_DATABASE_URL',
    identityScope: 'APPLICATION_DATABASE',
    applicationDatabaseBinding: 'PRESENT',
    target: {
      provider: 'neon',
      endpointId: 'ep-prod-abc123',
      region: 'us-east-1',
      hostnameSha256: 'a'.repeat(64),
      clientSslMode: 'require',
      channelBinding: 'require',
      hostname: 'private-host.example',
      password: 'do-not-disclose'
    },
    environmentChecks: {
      opscDatabaseUrlPresent: true,
      selectedConnectionStringPresent: true,
      databaseUrlPresent: true,
      databaseUrlUnpooledPresent: false,
      databaseUrlMatchesOpscDatabaseUrl: true,
      rawUrl: 'postgresql://secret'
    },
    identity: {
      database_name: 'app',
      session_user: 'opscore_runtime',
      current_user: 'opscore_runtime',
      server_version: '18.6',
      transaction_read_only: 'on',
      tls_enabled: true,
      tls_version: 'TLSv1.3',
      tls_cipher: 'TLS_AES_256_GCM_SHA384',
      tls_bits: 256,
      connectionString: 'do-not-disclose'
    },
    roles: [{
      role_name: 'opscore_runtime',
      role_exists: true,
      can_login: true,
      superuser: false,
      bypass_rls: false,
      create_role: false,
      create_db: false,
      elevated_role_membership: false,
      password: 'do-not-disclose'
    }],
    authFunctionGrants: {
      required: 10, present: 10, securityDefiner: 10, runtimeExecute: 10,
      publicExecuteAbsent: 10, ownerBypassesRls: 10, searchPathPinned: 10,
      missingFunctions: [], missingRuntimeExecute: [], publicExecutePresent: [],
      connectionString: 'do-not-disclose'
    },
    rowLevelSecurity: { public_application_tables: 131, rls_enabled_tables: 131, force_rls_tables: 131 },
    migrationLedger: {
      status: 'MIGRATION_056_HASH_MATCH',
      migration056Recorded: true,
      migration056SourceHashMatches: true,
      latestFilename: '056_runtime_auth_definer_function_grants.sql',
      migrationCount: 56,
      sourceSha256: 'b'.repeat(64),
      connectionString: 'do-not-disclose'
    },
    connectionString: 'do-not-disclose'
  };
}

test('production database diagnostic is hidden outside exact protected production deployment host', async () => {
  let inspections = 0;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { inspections++; return identityReport(); },
    inspectApplicationConnection: async () => applicationTlsReport(),
    hasVerifiedProductionRelease: () => false,
    readEmbeddedBuildIdentity: () => null
  });
  const res = responseSink();
  await handler(request({ headers: { host: 'opscore-platform.vercel.app' } }), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '');
  assert.equal(inspections, 0);
});

test('production database diagnostic is unavailable to preview deployments', async () => {
  let inspections = 0;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { inspections++; return identityReport(); },
    inspectApplicationConnection: async () => applicationTlsReport()
  });
  const res = responseSink();
  const previewEnv = { ...baseEnv, VERCEL_ENV: 'preview' };
  await handler(request(), res, previewEnv, previewEnv);
  assert.equal(res.statusCode, 404);
  assert.equal(inspections, 0);
});

test('production database diagnostic hides non-GET candidate requests before inspection', async () => {
  let inspections = 0;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { inspections++; return identityReport(); },
    inspectApplicationConnection: async () => applicationTlsReport()
  });
  const res = responseSink();
  await handler(request({ method: 'POST' }), res, baseEnv, baseEnv);
  // Candidate authorization is GET-only; do not run database or TLS probes.
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '');
  assert.equal(inspections, 0);
});

test('production database diagnostic returns sanitized identity without secrets and never caches', async () => {
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => identityReport(),
    inspectApplicationConnection: async () => applicationTlsReport(),
    hasVerifiedProductionRelease: () => false,
    readEmbeddedBuildIdentity: () => ({ commitSha: 'a'.repeat(40), pipelineId: '12345', ref: 'main' })
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  const body = JSON.parse(res.body);
  assert.equal(body.deployment.environment, 'production');
  assert.equal(body.environment.vercelEnvironment, 'production');
  assert.equal(body.deployment.commitSha, 'a'.repeat(40));
  assert.equal(body.deployment.ref, 'main');
  assert.equal(body.database.applicationDatabaseBinding, 'PRESENT');
  assert.equal(body.database.identity.current_user, 'opscore_runtime');
  assert.equal(body.database.identity.server_version, '18.6');
  assert.equal(body.applicationConnectionTls.scope, 'APPLICATION_POSTGRES_WORKER_CONNECTION');
  assert.equal(body.applicationConnectionTls.status, 'VERIFIED');
  assert.equal(body.applicationConnectionTls.authorized, true);
  assert.equal(body.applicationConnectionTls.bits, null);
  assert.equal(body.database.identity.tls_enabled, true);
  assert.equal(body.database.identity.tls_version, 'TLSv1.3');
  assert.equal(body.database.identity.tls_cipher, 'TLS_AES_256_GCM_SHA384');
  assert.equal(body.database.identity.tls_bits, 256);
  assert.equal(body.database.transactionMode, 'READ_ONLY');
  assert.equal(body.environment.productionHoldConfiguredFalse, false);
  assert.equal(body.environment.releaseProofVerified, false);
  assert.equal(JSON.stringify(body).includes('secret'), false);
  assert.equal(JSON.stringify(body).includes('private-host'), false);
  assert.equal(JSON.stringify(body).includes('connectionString'), false);
});

test('candidate database connections return 503 and remain explicitly unverified', async () => {
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => ({
      ...identityReport(),
      status: 'IDENTITY_RESOLVED_CANDIDATE',
      connectionSource: 'DATABASE_URL_UNPOOLED',
      identityScope: 'INTEGRATION_CANDIDATE_ONLY',
      applicationDatabaseBinding: 'UNVERIFIED'
    }),
    inspectApplicationConnection: async () => applicationTlsReport()
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.database.identityScope, 'INTEGRATION_CANDIDATE_ONLY');
  assert.equal(body.database.applicationDatabaseBinding, 'UNVERIFIED');
});

test('diagnostic failures return a fixed safe code without exception details', async () => {
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { throw new Error('postgresql://user:secret@private-host'); },
    inspectApplicationConnection: async () => applicationTlsReport()
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
    status: 'UNVERIFIED',
    reasonCode: 'PRODUCTION_RUNTIME_DIAGNOSTIC_FAILED',
    writeOperations: 0
  });
});

test('production database identity handler is wired into the server router and protected by candidate hold authorization', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.match(server, /createProductionDatabaseIdentityHandler\s*\}\s*=\s*require\('\.\/production-database-identity-route'\)/);
  assert.match(server, /url\.pathname === '\/api\/internal\/production-database-identity'/);
  assert.match(server, /isAuthorizedProductionCandidateDatabaseIdentityRequest\(req, process\.env, signedContextProductionReadiness\)/);
});

test('production database diagnostic preserves TLS evidence but rejects unsafe metadata', async () => {
  const report = identityReport();
  report.identity.tls_version = 'TLSv1.3\\nsecret';
  report.identity.tls_cipher = 'cipher;secret';
  report.identity.tls_bits = -1;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => report,
    inspectApplicationConnection: async () => applicationTlsReport(),
    hasVerifiedProductionRelease: () => false,
    readEmbeddedBuildIdentity: () => null
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  const identity = JSON.parse(res.body).database.identity;
  assert.equal(identity.tls_enabled, true);
  assert.equal(identity.tls_version, null);
  assert.equal(identity.tls_cipher, null);
  assert.equal(identity.tls_bits, null);
});

test('production database diagnostic remains inaccessible when the candidate is no longer held', async () => {
  let inspections = 0;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { inspections++; return identityReport(); },
    inspectApplicationConnection: async () => applicationTlsReport(),
    hasVerifiedProductionRelease: () => false
  });
  const res = responseSink();
  const releasedEnv = { ...baseEnv, OPSC_PRODUCTION_HOLD: 'false' };
  await handler(request(), res, releasedEnv, releasedEnv);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, '');
  assert.equal(inspections, 0);
});

test('production database diagnostic returns 503 unless application worker TLS is verified', async () => {
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => identityReport(),
    inspectApplicationConnection: async () => applicationTlsReport({ authorized: false, verified: false }),
    hasVerifiedProductionRelease: () => false
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.applicationConnectionTls.status, 'UNVERIFIED');
  assert.equal(body.applicationConnectionTls.authorized, false);
});
