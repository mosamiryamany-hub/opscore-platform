'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateRuntimeDiagnostic,
  evaluateRuntimeIdentityPreflight,
  DIAGNOSTIC_PATH,
  REQUIRED_DIAGNOSTIC_CHECKS,
  REQUIRED_IDENTITY_PREFLIGHT_CHECKS,
  ADVISORY_CHECKS,
  failClosedExitCode,
  runDiagnostic,
  runIdentityPreflight
} = require('./production-runtime-diagnostic');

function validPayload() {
  return {
    schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
    diagnostic: { status: 'VERIFIED', reasonCode: null },
    deployment: {
      environment: 'production',
      deploymentId: 'dpl_candidateabc123',
      expectedDeploymentHostMatched: true,
      commitSha: 'a'.repeat(40),
      pipelineId: '123456789',
      ref: 'main'
    },
    environment: {
      vercelEnvironment: 'production',
      nodeEnvironmentProduction: true,
      databaseEnginePostgres: true,
      opscDatabaseUrlPresent: true,
      applicationDatabaseUrlAligned: true,
      migrationDatabaseUrlAbsent: true,
      bootstrapDatabaseUrlAbsent: true,
      productionHoldConfiguredFalse: true,
      productionHoldEffectiveActive: false,
      releaseVerifiedConfiguredTrue: true,
      releaseVerifiedEffective: true,
      releaseProofVerified: true,
      isolationCertification: 'CERTIFIED',
      signedTenantContextProductionEnabled: false,
      sessionAutobindEnabled: false,
      candidateProbeEnabled: true,
      candidateModeEnabled: true
    },
    applicationConnectionTls: {
      scope: 'APPLICATION_POSTGRES_WORKER_CONNECTION',
      status: 'VERIFIED',
      negotiated: true,
      authorized: true,
      verified: true,
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      bits: null,
      backendPid: 32145,
      databaseName: 'opscore_acceptance',
      roleName: 'opscore_runtime',
      serverVersion: '18.6'
    },
    database: {
      status: 'IDENTITY_RESOLVED',
      applicationDatabaseBinding: 'PRESENT',
      identityScope: 'APPLICATION_DATABASE',
      connectionSource: 'OPSC_DATABASE_URL',
      productionCertification: false,
      writeOperations: 0,
      transactionMode: 'READ_ONLY',
      environmentChecks: {
        opscDatabaseUrlPresent: true,
        databaseUrlMatchesOpscDatabaseUrl: true
      },
      clientTls: {
        scope: 'READ_ONLY_PREFLIGHT_CONNECTION',
        negotiated: true,
        authorized: true,
        protocol: 'TLSv1.3',
        cipher: 'TLS_AES_256_GCM_SHA384'
      },
      target: {
        provider: 'neon',
        region: 'us-east-1',
        hostnameSha256: 'c'.repeat(64),
        clientSslMode: 'REQUIRE',
        channelBinding: 'REQUIRE'
      },
      identity: {
        database_name: 'opscore_acceptance',
        current_user: 'opscore_runtime',
        session_user: 'opscore_runtime',
        server_version: '18.6',
        transaction_read_only: 'on',
        tls_enabled: true,
        tls_version: 'TLSv1.3',
        tls_cipher: 'TLS_AES_256_GCM_SHA384',
        tls_bits: 256
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
      }],
      authFunctionGrants: {
        required: 10, present: 10, securityDefiner: 10, runtimeExecute: 10,
        publicExecuteAbsent: 10, ownerBypassesRls: 10, searchPathPinned: 10,
        missingFunctions: [], publicExecutePresent: []
      },
      rowLevelSecurity: {
        public_application_tables: 131,
        rls_enabled_tables: 131,
        force_rls_tables: 131
      },
      migrationLedger: {
        attestationFunctionPresent: true,
        attestationSecurityDefiner: true,
        attestationOwner: 'neondb_owner',
        attestationOwnerBypassesRls: true,
        attestationOwnerSuperuser: false,
        attestationRuntimeExecute: true,
        attestationPublicExecuteAbsent: true,
        attestationSearchPathPinned: true,
        attestationRowSecurityDisabled: true,
        status: 'MIGRATION_056_HASH_MATCH',
        migration056Recorded: true,
        migration056SourceHashMatches: true,
        sourceSha256: 'b'.repeat(64)
      }
    }
  };
}


function heldCandidatePayload() {
  const payload = validPayload();
  payload.environment.productionHoldConfiguredFalse = false;
  payload.environment.productionHoldEffectiveActive = true;
  payload.environment.releaseVerifiedConfiguredTrue = false;
  payload.environment.releaseVerifiedEffective = false;
  payload.environment.releaseProofVerified = false;
  payload.environment.isolationCertification = 'NOT_CERTIFIED';
  payload.environment.signedTenantContextProductionEnabled = false;
  payload.environment.sessionAutobindEnabled = false;
  payload.environment.candidateProbeEnabled = true;
  payload.environment.candidateModeEnabled = true;
  return payload;
}

test('held-candidate runtime identity preflight passes only with exact deployment, DB, role, RLS and application TLS proof', () => {
  const result = evaluateRuntimeIdentityPreflight(
    heldCandidatePayload(), 200, 'a'.repeat(40), '123456789', 'dpl_candidateabc123'
  );
  assert.equal(result.schemaVersion, 'opscore.production-runtime-identity-preflight.v1');
  assert.equal(result.status, 'PASS');
  assert.equal(result.identityPreflightAllowed, true);
  assert.equal(result.promotionAllowed, false, 'identity preflight is not release authorization');
  assert.equal(failClosedExitCode(result), 0);
  assert.deepEqual(result.checks.map(item => item.name), REQUIRED_IDENTITY_PREFLIGHT_CHECKS);
  assert.ok(result.checks.every(item => item.status === 'PASS'));
});

test('held-candidate identity preflight rejects wrong deployment ID and never promotes', () => {
  const result = evaluateRuntimeIdentityPreflight(
    heldCandidatePayload(), 200, 'a'.repeat(40), '123456789', 'dpl_anothercandidate'
  );
  assert.equal(result.identityPreflightAllowed, false);
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'deployment_id_binding' && item.status === 'BLOCKED'));
  assert.equal(failClosedExitCode(result), 1);
});

test('held-candidate identity preflight rejects a released HOLD or pre-enabled signed context', () => {
  for (const mutate of [
    payload => { payload.environment.productionHoldConfiguredFalse = true; payload.environment.productionHoldEffectiveActive = false; },
    payload => { payload.environment.signedTenantContextProductionEnabled = true; },
    payload => { payload.environment.candidateProbeEnabled = false; },
    payload => { payload.environment.sessionAutobindEnabled = true; }
  ]) {
    const payload = heldCandidatePayload();
    mutate(payload);
    const result = evaluateRuntimeIdentityPreflight(
      payload, 200, 'a'.repeat(40), '123456789', 'dpl_candidateabc123'
    );
    assert.equal(result.identityPreflightAllowed, false);
    assert.ok(result.checks.some(item => item.name === 'production_hold_active' && item.status === 'BLOCKED'));
  }
});

test('held-candidate identity preflight transport sends both OIDC headers and the per-run candidate token to the exact URL', async () => {
  let requestedUrl;
  let requestedOptions;
  const oidc = 'header.payload.signature';
  const candidateProbeToken = 'e'.repeat(64);
  const responsePayload = heldCandidatePayload();
  const result = await runIdentityPreflight(
    'https://opscore-platform-staged-abc.vercel.app',
    'a'.repeat(40), '123456789', 'dpl_candidateabc123',
    {
      token: oidc,
      candidateProbeToken,
      fetchImpl: async (url, options) => {
        requestedUrl = url;
        requestedOptions = options;
        return {
          status: 200,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify(responsePayload)
        };
      }
    }
  );
  assert.equal(requestedUrl, 'https://opscore-platform-staged-abc.vercel.app/api/internal/production-database-identity');
  assert.equal(requestedOptions.method, 'GET');
  assert.equal(requestedOptions.redirect, 'manual');
  assert.equal(requestedOptions.headers['x-opscore-trusted-oidc-idp-token'], oidc);
  assert.equal(requestedOptions.headers['x-vercel-trusted-oidc-idp-token'], oidc);
  assert.equal(requestedOptions.headers['x-opscore-signed-context-probe'], candidateProbeToken);
  assert.equal(result.identityPreflightAllowed, true);
});

test('identity preflight exit gate rejects incomplete, reordered, and promotion-forged inventories', () => {
  const passing = evaluateRuntimeIdentityPreflight(
    heldCandidatePayload(), 200, 'a'.repeat(40), '123456789', 'dpl_candidateabc123'
  );
  assert.equal(failClosedExitCode(passing), 0);
  assert.equal(failClosedExitCode({ ...passing, checks: passing.checks.slice(1) }), 1);
  assert.equal(failClosedExitCode({ ...passing, checks: [...passing.checks].reverse() }), 1);
  assert.equal(failClosedExitCode({ ...passing, promotionAllowed: true }), 1);
  assert.equal(failClosedExitCode({ ...passing, identityPreflightAllowed: false }), 1);
});

test('runtime diagnostic uses the protected internal route contract', () => {
  assert.equal(DIAGNOSTIC_PATH, '/api/internal/production-database-identity');
});

test('runtime diagnostic sends both Trusted OIDC headers only to the exact staged deployment host', async () => {
  let requestedUrl;
  let requestedOptions;
  const token = 'header.payload.signature';
  const candidateProbeToken = 'd'.repeat(64);
  const result = await runDiagnostic('https://opscore-platform-staged-abc.vercel.app', 'a'.repeat(40), '123456789', {
    token,
    candidateProbeToken,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return { status: 404, headers: { get: () => 'application/json' }, text: async () => '{}' };
    }
  });

  assert.equal(requestedUrl, 'https://opscore-platform-staged-abc.vercel.app/api/internal/production-database-identity');
  assert.equal(requestedOptions.method, 'GET');
  assert.equal(requestedOptions.redirect, 'manual');
  assert.equal(requestedOptions.headers['x-opscore-trusted-oidc-idp-token'], token);
  assert.equal(requestedOptions.headers['x-vercel-trusted-oidc-idp-token'], token);
  assert.equal(requestedOptions.headers['x-opscore-signed-context-probe'], candidateProbeToken);
  assert.equal(result.httpStatus, 404);
  assert.equal(result.promotionAllowed, false);
});

test('runtime diagnostic fails closed before transport when the candidate probe credential is absent or malformed', async () => {
  let requests = 0;
  for (const candidateProbeToken of ['', 'not-a-64-character-hex-token']) {
    await assert.rejects(
      runDiagnostic('https://opscore-platform-staged-abc.vercel.app', 'a'.repeat(40), '123456789', {
        token: 'header.payload.signature',
        candidateProbeToken,
        fetchImpl: async () => { requests++; throw new Error('must not be called'); }
      }),
      /CANDIDATE_PROBE_TOKEN_REQUIRED_OR_INVALID/
    );
  }
  assert.equal(requests, 0);
});

test('runtime diagnostic rejects an out-of-scope hostname before making an authenticated request', async () => {
  let requests = 0;
  await assert.rejects(
    runDiagnostic('https://opscore-platform-staged-abc.evil.com', 'a'.repeat(40), '123456789', {
      token: 'header.payload.signature',
      fetchImpl: async () => { requests++; throw new Error('must not be called'); }
    }),
    /DEPLOYMENT_URL_NOT_ALLOWED/
  );
  assert.equal(requests, 0);
});

test('runtime diagnostic blocks only if every production identity and release gate passes', () => {
  const result = evaluateRuntimeDiagnostic(validPayload(), 200, 'a'.repeat(40), '123456789');
  assert.equal(result.status, 'PASS');
  assert.equal(result.promotionAllowed, true);
  assert.ok(result.checks.every(item => item.status === 'PASS'));
  assert.deepEqual(result.runtimeDatabase, {
    name: 'opscore_acceptance',
    provider: 'neon',
    region: 'us-east-1',
    hostnameSha256: 'c'.repeat(64),
    runtimeRole: 'opscore_runtime',
    serverVersion: '18.6',
    tlsEvidenceScope: 'APPLICATION_POSTGRES_WORKER_CONNECTION',
    tlsEvidenceStatus: 'VERIFIED',
    tlsEnabled: true,
    tlsVersion: 'TLSv1.3',
    tlsCipher: 'TLS_AES_256_GCM_SHA384',
    tlsBits: null
  });
});

test('candidate connection or absent OPSC_DATABASE_URL cannot authorize promotion', () => {
  const payload = validPayload();
  payload.database.status = 'IDENTITY_RESOLVED_CANDIDATE';
  payload.database.identityScope = 'INTEGRATION_CANDIDATE_ONLY';
  payload.database.applicationDatabaseBinding = 'UNVERIFIED';
  payload.database.connectionSource = 'DATABASE_URL_UNPOOLED';
  payload.environment.opscDatabaseUrlPresent = false;
  const result = evaluateRuntimeDiagnostic(payload, 503, 'a'.repeat(40), '123456789');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'application_database_binding' && item.status === 'BLOCKED'));
});

test('production hold and missing production acceptance proof block promotion', () => {
  const payload = validPayload();
  payload.environment.productionHoldConfiguredFalse = false;
  payload.environment.productionHoldEffectiveActive = true;
  payload.environment.releaseProofVerified = false;
  payload.environment.releaseVerifiedEffective = false;
  payload.environment.releaseVerifiedConfiguredTrue = false;
  payload.deployment.commitSha = 'b'.repeat(40);
  payload.environment.isolationCertification = 'NOT_CERTIFIED';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'production_hold_released' && item.status === 'BLOCKED'));
  assert.ok(result.checks.some(item => item.name === 'production_release_proof' && item.status === 'BLOCKED'));
});

test('runtime diagnostic rejects cross-tenant privilege elevation and incomplete RLS', () => {
  const payload = validPayload();
  payload.database.roles[0].bypass_rls = true;
  payload.database.rowLevelSecurity.force_rls_tables = 130;
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'runtime_role_least_privilege' && item.status === 'BLOCKED'));
  assert.ok(result.checks.some(item => item.name === 'row_level_security_coverage' && item.status === 'BLOCKED'));
});

test('runtime diagnostic rejects mismatched build identity and migration hash', () => {
  const payload = validPayload();
  payload.deployment.commitSha = 'c'.repeat(40);
  payload.database.migrationLedger.status = 'LEDGER_UNREADABLE';
  payload.database.migrationLedger.attestationFunctionPresent = false;
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'deployment_commit_binding' && item.status === 'BLOCKED'));
  assert.ok(result.checks.some(item => item.name === 'migration_056_hash' && item.status === 'BLOCKED'));
});

test('runtime diagnostic blocks when the client socket did not negotiate TLS', () => {
  const payload = validPayload();
  payload.applicationConnectionTls = { negotiated: false, authorized: false, protocol: null, cipher: null };
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic does not accept sslmode=REQUIRE without negotiated client-socket evidence', () => {
  const payload = validPayload();
  payload.applicationConnectionTls = { negotiated: false, authorized: false, protocol: null, cipher: null };
  delete payload.database.identity.tls_enabled;
  delete payload.database.identity.tls_version;
  delete payload.database.identity.tls_cipher;
  delete payload.database.identity.tls_bits;
  assert.equal(payload.database.target.clientSslMode, 'REQUIRE');
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic blocks a negotiated socket with an unauthorized certificate chain', () => {
  const payload = validPayload();
  payload.applicationConnectionTls.authorized = false;
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic blocks TLS protocols older than TLS 1.2', () => {
  const payload = validPayload();
  payload.applicationConnectionTls.protocol = 'TLSv1.1';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic blocks weak non-AEAD cipher suites', () => {
  const payload = validPayload();
  payload.applicationConnectionTls.cipher = 'TLS_RSA_WITH_3DES_EDE_CBC_SHA';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic rejects unknown cipher labels even when they contain an AES strength token', () => {
  const payload = validPayload();
  payload.applicationConnectionTls.cipher = 'UNTRUSTED_AES_256_GCM_SHA384';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('runtime diagnostic accepts recognized TLS 1.2 AES-GCM and TLS 1.3 ChaCha20 suites', () => {
  for (const tlsUpdate of [
    { protocol: 'TLSv1.2', cipher: 'ECDHE-RSA-AES128-GCM-SHA256' },
    { protocol: 'TLSv1.3', cipher: 'TLS_CHACHA20_POLY1305_SHA256' }
  ]) {
    const payload = validPayload();
    payload.applicationConnectionTls = { ...payload.applicationConnectionTls, ...tlsUpdate };
    const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
    assert.equal(result.promotionAllowed, true);
    assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'PASS'));
  }
});


test('advisory-only isolation state is explicit and cannot forge a blocked check', () => {
  assert.deepEqual(ADVISORY_CHECKS, ['production_isolation_certified']);
  assert.equal(Object.isFrozen(ADVISORY_CHECKS), true);
  assert.throws(() => ADVISORY_CHECKS.push('production_release_proof'), TypeError);

  const payload = validPayload();
  payload.environment.isolationCertification = 'NOT_CERTIFIED';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.status, 'PASS_WITH_ADVISORIES');
  assert.equal(result.promotionAllowed, true);
  assert.deepEqual(result.advisories, ['production_isolation_certified']);
  assert.equal(failClosedExitCode(result), 0);

  const forged = {
    ...result,
    checks: result.checks.map(item => item.name === 'production_isolation_certified'
      ? { ...item, status: 'BLOCKED' }
      : item)
  };
  assert.equal(failClosedExitCode(forged), 1);
});

test('runtime diagnostic exit code rejects incomplete, forged, duplicated, reordered, and unknown check inventories', () => {
  const passingChecks = REQUIRED_DIAGNOSTIC_CHECKS.map(name => ({ name, status: 'PASS' }));
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: [] }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: [{ status: 'PASS' }, { status: 'BLOCKED' }] }), 1);
  assert.equal(failClosedExitCode({ status: 'BLOCKED', promotionAllowed: false, checks: passingChecks }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: passingChecks.slice(1) }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: [{ ...passingChecks[0] }, ...passingChecks.slice(0, -1)] }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: passingChecks.map((item, index) => index === 0 ? { name: 'unrecognized_check', status: 'PASS' } : item) }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: [...passingChecks].reverse() }), 1);
  assert.equal(failClosedExitCode({ status: 'PASS', promotionAllowed: true, checks: passingChecks }), 0);
});

test('runtime database diagnostic exposes only validated non-secret identity metadata', () => {
  const payload = validPayload();
  payload.database.identity.database_name = 'customer db;DROP TABLE users';
  payload.database.identity.current_user = 'opscore_runtime;secret';
  payload.database.target.hostnameSha256 = 'not-a-sha256';
  payload.database.target.region = 'us-east-1\nsecret';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.deepEqual(result.runtimeDatabase, {
    name: null,
    provider: 'neon',
    region: null,
    hostnameSha256: null,
    runtimeRole: null,
    serverVersion: '18.6',
    tlsEvidenceScope: 'APPLICATION_POSTGRES_WORKER_CONNECTION',
    tlsEvidenceStatus: 'UNVERIFIED',
    tlsEnabled: false,
    tlsVersion: null,
    tlsCipher: null,
    tlsBits: null
  });
  assert.equal(JSON.stringify(result).includes('customer db;DROP TABLE users'), false);
  assert.equal(JSON.stringify(result).includes('opscore_runtime;secret'), false);
});
test('separate read-only preflight TLS evidence cannot substitute for application-worker TLS', () => {
  const payload = validPayload();
  delete payload.applicationConnectionTls;
  assert.equal(payload.database.clientTls.negotiated, true);
  assert.equal(payload.database.clientTls.authorized, true);
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});

test('application-worker TLS proof must bind to the inspected database, role, version, and backend session', () => {
  for (const override of [
    { databaseName: 'other_database' },
    { roleName: 'other_role' },
    { serverVersion: '17.9' },
    { backendPid: null }
  ]) {
    const payload = validPayload();
    payload.applicationConnectionTls = { ...payload.applicationConnectionTls, ...override };
    const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
    assert.equal(result.promotionAllowed, false);
    assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
  }
});