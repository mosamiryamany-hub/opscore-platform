'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRuntimeDiagnostic, DIAGNOSTIC_PATH } = require('./production-runtime-diagnostic');

function validPayload() {
  return {
    schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
    deployment: {
      environment: 'production',
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
      isolationCertification: 'CERTIFIED'
    },
    database: {
      status: 'IDENTITY_RESOLVED',
      applicationDatabaseBinding: 'PRESENT',
      identityScope: 'APPLICATION_DATABASE',
      connectionSource: 'OPSC_DATABASE_URL',
      productionCertification: false,
      writeOperations: 0,
      transactionMode: 'READ_ONLY',
      target: { clientSslMode: 'REQUIRE', channelBinding: 'REQUIRE' },
      environmentChecks: {
        opscDatabaseUrlPresent: true,
        databaseUrlMatchesOpscDatabaseUrl: true
      },
      identity: {
        current_user: 'opscore_runtime',
        session_user: 'opscore_runtime',
        server_version: '18.6',
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
        status: 'MIGRATION_056_HASH_MATCH',
        migration056Recorded: true,
        migration056SourceHashMatches: true,
        sourceSha256: 'b'.repeat(64)
      }
    }
  };
}

test('runtime diagnostic uses the protected internal route contract', () => {
  assert.equal(DIAGNOSTIC_PATH, '/api/internal/production-database-identity');
});

test('runtime diagnostic blocks only if every production identity and release gate passes', () => {
  const result = evaluateRuntimeDiagnostic(validPayload(), 200, 'a'.repeat(40), '123456789');
  assert.equal(result.status, 'PASS');
  assert.equal(result.promotionAllowed, true);
  assert.ok(result.checks.every(item => item.status === 'PASS'));
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
  payload.environment.isolationCertification = 'NOT_CERTIFIED';
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
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
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'deployment_commit_binding' && item.status === 'BLOCKED'));
  assert.ok(result.checks.some(item => item.name === 'migration_056_hash' && item.status === 'BLOCKED'));
});

test('runtime diagnostic requires runtime SSL settings without misreading backend pg_stat_ssl', () => {
  const payload = validPayload();
  payload.database.target.clientSslMode = 'DISABLE';
  payload.database.target.channelBinding = 'DISABLE';
  payload.database.identity.tls_enabled = false;
  const result = evaluateRuntimeDiagnostic(payload, 200, 'a'.repeat(40), '123456789');
  assert.equal(result.promotionAllowed, false);
  assert.ok(result.checks.some(item => item.name === 'client_tls_configuration' && item.status === 'BLOCKED'));
});
