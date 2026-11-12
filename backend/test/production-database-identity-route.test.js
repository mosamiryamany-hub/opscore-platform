'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROUTE_PATH,
  createProductionDatabaseIdentityHandler
} = require('../src/production-database-identity-route');

const baseEnv = {
  VERCEL_ENV: 'production',
  VERCEL_URL: 'opscore-platform-staged-abc.vercel.app',
  NODE_ENV: 'production',
  DATABASE_ENGINE: 'postgres',
  OPSC_DATABASE_URL: 'postgresql://runtime:secret@ep-prod.example.neon.tech/app?sslmode=require&channel_binding=require',
  DATABASE_URL: 'postgresql://runtime:secret@ep-prod.example.neon.tech/app?sslmode=require&channel_binding=require',
  OPSC_PRODUCTION_HOLD: 'true',
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
    headers: { host: baseEnv.VERCEL_URL },
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
      tls_enabled: false,
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
    inspectDatabase: async () => { inspections++; return identityReport(); }
  });
  const res = responseSink();
  const previewEnv = { ...baseEnv, VERCEL_ENV: 'preview' };
  await handler(request(), res, previewEnv, previewEnv);
  assert.equal(res.statusCode, 404);
  assert.equal(inspections, 0);
});

test('production database diagnostic accepts GET only', async () => {
  let inspections = 0;
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => { inspections++; return identityReport(); }
  });
  const res = responseSink();
  await handler(request({ method: 'POST' }), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 405);
  assert.equal(inspections, 0);
});

test('production database diagnostic returns sanitized identity without secrets and never caches', async () => {
  const handler = createProductionDatabaseIdentityHandler({
    inspectDatabase: async () => identityReport(),
    hasVerifiedProductionRelease: () => false,
    readEmbeddedBuildIdentity: () => ({ commitSha: 'a'.repeat(40), pipelineId: '12345', ref: 'main' })
  });
  const res = responseSink();
  await handler(request(), res, baseEnv, baseEnv);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  const body = JSON.parse(res.body);
  assert.equal(body.deployment.commitSha, 'a'.repeat(40));
  assert.equal(body.deployment.ref, 'main');
  assert.equal(body.database.applicationDatabaseBinding, 'PRESENT');
  assert.equal(body.database.identity.current_user, 'opscore_runtime');
  assert.equal(body.database.identity.server_version, '18.6');
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
    })
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
    inspectDatabase: async () => { throw new Error('postgresql://user:secret@private-host'); }
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
