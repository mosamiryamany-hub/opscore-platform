'use strict';

const { inspectDatabase } = require('../scripts/production-database-identity-preflight');
const { hasVerifiedProductionRelease, readEmbeddedBuildIdentity } = require('./release-proof');

const ROUTE_PATH = '/api/internal/production-database-identity';
const SAFE_TOKEN = /^[A-Z0-9_]{1,96}$/;

function requestPath(req) {
  try {
    const host = String(req && req.headers && req.headers.host || 'invalid.local');
    return new URL(String(req && req.url || '/'), `https://${host}`).pathname;
  } catch {
    return '';
  }
}

function normalizeHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  return host.replace(/:\d{1,5}$/, '');
}

function isProtectedProductionDeployment(req, env) {
  if (String(env.VERCEL_ENV || '').toLowerCase() !== 'production') return false;
  const expectedHost = normalizeHost(env.VERCEL_URL);
  const requestHost = normalizeHost(req && req.headers && req.headers.host);
  return Boolean(
    expectedHost &&
    requestHost &&
    expectedHost === requestHost &&
    expectedHost.endsWith('.vercel.app')
  );
}

function safeString(value, maxLength = 128) {
  const valueText = String(value == null ? '' : value);
  return /^[A-Za-z0-9_.:@/-]*$/.test(valueText) ? valueText.slice(0, maxLength) : null;
}

function safeCode(value) {
  const code = String(value || '');
  return SAFE_TOKEN.test(code) ? code : null;
}

function safeVersion(value) {
  const match = String(value || '').match(/^(\d{1,2}\.\d{1,2}(?:\.\d{1,3})?)/);
  return match ? match[1] : null;
}

function sanitizeIdentityReport(report) {
  const value = report && typeof report === 'object' ? report : {};
  const target = value.target || {};
  const identity = value.identity || {};
  const roles = Array.isArray(value.roles) ? value.roles.map(role => ({
    role_name: safeString(role.role_name, 64),
    role_exists: role.role_exists === true,
    can_login: role.can_login === true,
    superuser: role.superuser === true,
    bypass_rls: role.bypass_rls === true,
    create_role: role.create_role === true,
    create_db: role.create_db === true,
    elevated_role_membership: role.elevated_role_membership === true
  })) : value.roles && typeof value.roles === 'object'
    ? { status: safeCode(value.roles.status), reasonCode: safeCode(value.roles.reasonCode) }
    : null;

  const envChecks = value.environmentChecks || {};
  const grants = value.authFunctionGrants || {};
  const rls = value.rowLevelSecurity || {};
  const ledger = value.migrationLedger || {};
  const count = candidate => Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;

  return {
    schemaVersion: safeString(value.schemaVersion, 96),
    checkedAt: safeString(value.checkedAt, 48),
    status: safeCode(value.status),
    reasonCode: safeCode(value.reasonCode),
    productionCertification: value.productionCertification === true,
    writeOperations: Number.isSafeInteger(value.writeOperations) ? value.writeOperations : null,
    transactionMode: value.transactionMode === 'READ ONLY' ? 'READ_ONLY' : safeCode(value.transactionMode),
    connectionSource: safeCode(value.connectionSource),
    identityScope: safeCode(value.identityScope),
    applicationDatabaseBinding: safeCode(value.applicationDatabaseBinding),
    target: {
      provider: safeString(target.provider, 32),
      endpointId: safeString(target.endpointId, 96),
      region: safeString(target.region, 64),
      hostnameSha256: /^[a-f0-9]{64}$/.test(String(target.hostnameSha256 || '')) ? target.hostnameSha256 : null,
      clientSslMode: safeCode(String(target.clientSslMode || '').toUpperCase().replace(/-/g, '_')),
      channelBinding: safeCode(String(target.channelBinding || '').toUpperCase().replace(/-/g, '_'))
    },
    environmentChecks: {
      opscDatabaseUrlPresent: envChecks.opscDatabaseUrlPresent === true,
      selectedConnectionStringPresent: envChecks.selectedConnectionStringPresent === true,
      databaseUrlPresent: envChecks.databaseUrlPresent === true,
      databaseUrlUnpooledPresent: envChecks.databaseUrlUnpooledPresent === true,
      databaseUrlMatchesOpscDatabaseUrl: envChecks.databaseUrlMatchesOpscDatabaseUrl === true
    },
    identity: {
      database_name: safeString(identity.database_name, 64),
      session_user: safeString(identity.session_user, 64),
      current_user: safeString(identity.current_user, 64),
      server_version: safeVersion(identity.server_version),
      transaction_read_only: safeString(identity.transaction_read_only, 8)
    },
    roles,
    authFunctionGrants: {
      status: safeCode(grants.status),
      reasonCode: safeCode(grants.reasonCode),
      required: count(grants.required),
      present: count(grants.present),
      securityDefiner: count(grants.securityDefiner),
      runtimeExecute: count(grants.runtimeExecute),
      publicExecuteAbsent: count(grants.publicExecuteAbsent),
      ownerBypassesRls: count(grants.ownerBypassesRls),
      searchPathPinned: count(grants.searchPathPinned)
    },
    rowLevelSecurity: {
      status: safeCode(rls.status),
      reasonCode: safeCode(rls.reasonCode),
      public_application_tables: count(rls.public_application_tables),
      rls_enabled_tables: count(rls.rls_enabled_tables),
      force_rls_tables: count(rls.force_rls_tables)
    },
    migrationLedger: {
      status: safeCode(ledger.status),
      reasonCode: safeCode(ledger.reasonCode),
      migration056Recorded: ledger.migration056Recorded === true,
      migration056SourceHashMatches: ledger.migration056SourceHashMatches === true,
      latestFilename: safeString(ledger.latestFilename, 128),
      migrationCount: count(ledger.migrationCount),
      sourceSha256: /^[a-f0-9]{64}$/.test(String(ledger.sourceSha256 || '')) ? ledger.sourceSha256 : null
    }
  };
}

function environmentSnapshot(configuredEnv, effectiveEnv, releaseProofVerified) {
  const configured = configuredEnv || {};
  const effective = effectiveEnv || configured;
  const opscUrl = String(configured.OPSC_DATABASE_URL || '').trim();
  const databaseUrl = String(effective.DATABASE_URL || '').trim();
  const holdConfigured = String(configured.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase();
  const holdEffective = String(effective.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase();
  const releaseConfigured = String(configured.OPSC_RELEASE_VERIFIED || '').trim().toLowerCase();
  const releaseEffective = String(effective.OPSC_RELEASE_VERIFIED || '').trim().toLowerCase();

  return {
    vercelEnvironment: safeString(effective.VERCEL_ENV, 32),
    nodeEnvironmentProduction: String(effective.NODE_ENV || '').toLowerCase() === 'production',
    databaseEnginePostgres: String(effective.DATABASE_ENGINE || '').toLowerCase() === 'postgres',
    opscDatabaseUrlPresent: Boolean(opscUrl),
    applicationDatabaseUrlAligned: Boolean(opscUrl) && (!databaseUrl || databaseUrl === opscUrl),
    migrationDatabaseUrlAbsent: !String(configured.OPSC_MIGRATION_DATABASE_URL || '').trim(),
    bootstrapDatabaseUrlAbsent: !String(configured.OPSC_BOOTSTRAP_DATABASE_URL || '').trim(),
    productionHoldConfiguredFalse: holdConfigured === 'false',
    productionHoldEffectiveActive: holdEffective !== 'false',
    releaseVerifiedConfiguredTrue: releaseConfigured === 'true',
    releaseVerifiedEffective: releaseEffective === 'true',
    releaseProofVerified: releaseProofVerified === true,
    isolationCertification: safeCode(configured.OPSC_PRODUCTION_ISOLATION_CERTIFICATION) || 'NOT_SET'
  };
}

function createProductionDatabaseIdentityHandler(dependencies = {}) {
  const inspect = dependencies.inspectDatabase || inspectDatabase;
  const verifyRelease = dependencies.hasVerifiedProductionRelease || hasVerifiedProductionRelease;
  const readIdentity = dependencies.readEmbeddedBuildIdentity || readEmbeddedBuildIdentity;

  return async function handleProductionDatabaseIdentity(req, res, configuredEnv = process.env, effectiveEnv = process.env) {
    if (requestPath(req) !== ROUTE_PATH || !isProtectedProductionDeployment(req, effectiveEnv)) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store, private, max-age=0');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.end('');
    }
    if (String(req.method || '').toUpperCase() !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      res.setHeader('Cache-Control', 'no-store, private, max-age=0');
      return res.end('');
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    try {
      const configured = configuredEnv || {};
      const effective = effectiveEnv || configured;
      const inspectionEnv = {
        ...configured,
        DATABASE_URL: effective.DATABASE_URL,
        DATABASE_ENGINE: effective.DATABASE_ENGINE,
        NODE_ENV: effective.NODE_ENV
      };
      const identityReport = await inspect(inspectionEnv);
      const releaseProofVerified = verifyRelease(configured) === true;
      let embedded = null;
      try { embedded = readIdentity(); } catch { embedded = null; }

      const payload = {
        schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
        generatedAt: new Date().toISOString(),
        deployment: {
          environment: safeString(effective.VERCEL_ENV, 32),
          expectedDeploymentHostMatched: true,
          commitSha: embedded && /^[a-f0-9]{40}$/.test(String(embedded.commitSha || '').toLowerCase())
            ? String(embedded.commitSha).toLowerCase() : null,
          pipelineId: embedded && /^[1-9][0-9]{0,14}$/.test(String(embedded.pipelineId || ''))
            ? String(embedded.pipelineId) : null,
          ref: embedded && embedded.ref === 'main' ? 'main' : null
        },
        environment: environmentSnapshot(configured, effective, releaseProofVerified),
        database: sanitizeIdentityReport(identityReport)
      };

      const identityResolved = identityReport &&
        identityReport.status === 'IDENTITY_RESOLVED' &&
        identityReport.applicationDatabaseBinding === 'PRESENT' &&
        identityReport.connectionSource === 'OPSC_DATABASE_URL';
      res.statusCode = identityResolved ? 200 : 503;
      return res.end(JSON.stringify(payload));
    } catch {
      res.statusCode = 503;
      return res.end(JSON.stringify({
        schemaVersion: 'opscore.production-runtime-database-diagnostic.v1',
        status: 'UNVERIFIED',
        reasonCode: 'PRODUCTION_RUNTIME_DIAGNOSTIC_FAILED',
        writeOperations: 0
      }));
    }
  };
}

module.exports = {
  ROUTE_PATH,
  requestPath,
  normalizeHost,
  isProtectedProductionDeployment,
  sanitizeIdentityReport,
  environmentSnapshot,
  createProductionDatabaseIdentityHandler
};
