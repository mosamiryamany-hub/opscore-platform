'use strict';

const fs = require('node:fs');
const { parseDeploymentUrl, runVercelCurl } = require('./production-deployment-smoke');

const DIAGNOSTIC_PATH = '/api/internal/production-database-identity';

function check(name, ok, detail = null) {
  const status = ok ? 'PASS' : (ADVISORY_CHECKS.includes(name) ? 'ADVISORY' : 'BLOCKED');
  return { name, status, detail: detail == null ? null : String(detail).slice(0, 120) };
}
function isBlocking(item) {
  return Boolean(item) && !ADVISORY_CHECKS.includes(item.name);
}
function allBlockingPassed(checks) {
  return checks.filter(isBlocking).every(item => item && item.status === 'PASS');
}

// Production isolation certification remains visible as an advisory at this diagnostic
// layer only. The independent production_release_proof check remains BLOCKING and its
// verifier requires exact, hash-bound production acceptance evidence plus CERTIFIED.
// This diagnostic therefore cannot manufacture or imply production certification.
const ADVISORY_CHECKS = Object.freeze(['production_isolation_certified']);

const REQUIRED_DIAGNOSTIC_CHECKS = Object.freeze([
  'diagnostic_endpoint_reached',
  'diagnostic_schema',
  'deployment_environment',
  'deployment_host_binding',
  'deployment_commit_binding',
  'deployment_pipeline_binding',
  'deployment_main_ref',
  'application_database_binding',
  'database_url_alignment',
  'runtime_environment',
  'migration_and_bootstrap_urls_absent',
  'read_only_execution',
  'postgres_runtime_identity',
  'runtime_role_least_privilege',
  'client_tls_configuration',
  'row_level_security_coverage',
  'auth_function_grants',
  'migration_056_attestation_security',
  'migration_056_hash',
  'production_hold_released',
  'production_release_proof',
  'production_isolation_certified'
]);

function failClosedExitCode(result) {
  if (!result || !['PASS', 'PASS_WITH_ADVISORIES'].includes(result.status) ||
      result.promotionAllowed !== true || !Array.isArray(result.checks) ||
      result.checks.length !== REQUIRED_DIAGNOSTIC_CHECKS.length) return 1;

  const observed = result.checks.map(item => item && item.name);
  const exactInventory = observed.every((name, index) => name === REQUIRED_DIAGNOSTIC_CHECKS[index]);
  const advisoryItems = result.checks.filter(item => item && ADVISORY_CHECKS.includes(item.name));
  const advisoryStatusesValid = advisoryItems.every(item => item.status === 'PASS' || item.status === 'ADVISORY');
  const expectedAdvisories = advisoryItems.filter(item => item.status === 'ADVISORY').map(item => item.name);
  const reportedAdvisories = Array.isArray(result.advisories) ? result.advisories : [];
  const advisoryReportExact = JSON.stringify(reportedAdvisories) === JSON.stringify(expectedAdvisories);
  const statusExact = result.status === (expectedAdvisories.length ? 'PASS_WITH_ADVISORIES' : 'PASS');
  const allPassed = allBlockingPassed(result.checks);

  return exactInventory && advisoryStatusesValid && advisoryReportExact && statusExact && allPassed ? 0 : 1;
}

function evaluateRuntimeDiagnostic(payload, httpStatus, expectedCommit, expectedPipelineId) {
  const value = payload && typeof payload === 'object' ? payload : {};
  const deployment = value.deployment || {};
  const environment = value.environment || {};
  const database = value.database || {};
  const target = database.target || {};
  const envChecks = database.environmentChecks || {};
  const identity = database.identity || {};
  const roles = Array.isArray(database.roles) ? database.roles : [];
  const runtimeRole = roles.find(role => role.role_name === identity.current_user);
  const grants = database.authFunctionGrants || {};
  const rls = database.rowLevelSecurity || {};
  const ledger = database.migrationLedger || {};

  // Emit only non-secret database identity metadata to the GitHub deployment
  // diagnostic. Never include a hostname, DSN, username, or password.
  const safeLabel = (value, pattern, maxLength) => {
    const text = String(value || '');
    return text.length <= maxLength && pattern.test(text) ? text : null;
  };
  const runtimeDatabase = {
    name: safeLabel(identity.database_name, /^[A-Za-z0-9_]{1,63}$/, 63),
    provider: target.provider === 'neon' || target.provider === 'postgresql' ? target.provider : null,
    region: safeLabel(target.region, /^[a-z0-9-]{1,32}$/, 32),
    hostnameSha256: /^[a-f0-9]{64}$/.test(String(target.hostnameSha256 || '')) ? target.hostnameSha256 : null,
    runtimeRole: safeLabel(identity.current_user, /^[A-Za-z0-9_]{1,63}$/, 63),
    serverVersion: safeLabel(identity.server_version, /^[0-9]{1,2}\.[0-9]{1,3}(?:\s*\([^\r\n]{1,40}\))?$/, 64)
  };

  const checks = [
    check('diagnostic_endpoint_reached', httpStatus === 200 || httpStatus === 503, `HTTP_${httpStatus}`),
    check('diagnostic_schema', value.schemaVersion === 'opscore.production-runtime-database-diagnostic.v1'),
    check('deployment_environment', environment.vercelEnvironment === 'production' && deployment.environment === 'production'),
    check('deployment_host_binding', deployment.expectedDeploymentHostMatched === true),
    check('deployment_commit_binding', String(deployment.commitSha || '').toLowerCase() === String(expectedCommit || '').toLowerCase()),
    check('deployment_pipeline_binding', String(deployment.pipelineId || '') === String(expectedPipelineId || '')),
    check('deployment_main_ref', deployment.ref === 'main'),
    check('application_database_binding', database.status === 'IDENTITY_RESOLVED' &&
      database.applicationDatabaseBinding === 'PRESENT' &&
      database.identityScope === 'APPLICATION_DATABASE' &&
      database.connectionSource === 'OPSC_DATABASE_URL' &&
      envChecks.opscDatabaseUrlPresent === true),
    check('database_url_alignment', envChecks.databaseUrlMatchesOpscDatabaseUrl === true &&
      environment.applicationDatabaseUrlAligned === true),
    check('runtime_environment', environment.nodeEnvironmentProduction === true &&
      environment.databaseEnginePostgres === true),
    check('migration_and_bootstrap_urls_absent', environment.migrationDatabaseUrlAbsent === true &&
      environment.bootstrapDatabaseUrlAbsent === true),
    check('read_only_execution', database.transactionMode === 'READ_ONLY' && database.writeOperations === 0 && database.productionCertification === false),
    check('postgres_runtime_identity', identity.current_user === 'opscore_runtime' &&
      identity.session_user === 'opscore_runtime' &&
      /^18\./.test(String(identity.server_version || '')) &&
      identity.transaction_read_only === 'on' && database.transactionMode === 'READ_ONLY'),
    check('runtime_role_least_privilege', runtimeRole &&
      runtimeRole.role_exists === true && runtimeRole.can_login === true &&
      runtimeRole.superuser === false && runtimeRole.bypass_rls === false &&
      runtimeRole.create_role === false && runtimeRole.create_db === false &&
      runtimeRole.elevated_role_membership === false),
    check('client_tls_configuration', ['REQUIRE', 'VERIFY_CA', 'VERIFY_FULL'].includes(target.clientSslMode) &&
      target.channelBinding === 'REQUIRE'),
    check('row_level_security_coverage', Number.isInteger(rls.public_application_tables) &&
      rls.public_application_tables > 0 &&
      rls.rls_enabled_tables === rls.public_application_tables &&
      rls.force_rls_tables === rls.public_application_tables),
    check('auth_function_grants', grants.required === 10 && grants.present === 10 &&
      grants.securityDefiner === 10 && grants.runtimeExecute === 10 &&
      grants.publicExecuteAbsent === 10 && grants.ownerBypassesRls === 10 &&
      grants.searchPathPinned === 10 &&
      (!Array.isArray(grants.missingFunctions) || grants.missingFunctions.length === 0) &&
      (!Array.isArray(grants.publicExecutePresent) || grants.publicExecutePresent.length === 0)),
    check('migration_056_attestation_security', ledger.attestationFunctionPresent === true &&
      ledger.attestationSecurityDefiner === true &&
      ledger.attestationOwner === 'neondb_owner' &&
      ledger.attestationOwnerBypassesRls === true &&
      ledger.attestationOwnerSuperuser === false &&
      ledger.attestationRuntimeExecute === true &&
      ledger.attestationPublicExecuteAbsent === true &&
      ledger.attestationSearchPathPinned === true &&
      ledger.attestationRowSecurityDisabled === true),
    check('migration_056_hash', ledger.status === 'MIGRATION_056_HASH_MATCH' &&
      ledger.migration056Recorded === true && ledger.migration056SourceHashMatches === true &&
      /^[a-f0-9]{64}$/.test(String(ledger.sourceSha256 || ''))),
    check('production_hold_released', environment.productionHoldConfiguredFalse === true &&
      environment.productionHoldEffectiveActive === false),
    check('production_release_proof', environment.releaseVerifiedConfiguredTrue === true &&
      environment.releaseVerifiedEffective === true && environment.releaseProofVerified === true),
    check('production_isolation_certified', environment.isolationCertification === 'CERTIFIED')
  ];

  const blockingPassed = allBlockingPassed(checks);
  const hasAdvisories = checks.some(item => item.status === 'ADVISORY');

  return {
    schemaVersion: 'opscore.production-runtime-diagnostic-result.v1',
    status: blockingPassed ? (hasAdvisories ? 'PASS_WITH_ADVISORIES' : 'PASS') : 'BLOCKED',
    promotionAllowed: blockingPassed,
    advisories: checks.filter(item => item.status === 'ADVISORY').map(item => item.name),
    httpStatus,
    expectedCommit: String(expectedCommit || '').toLowerCase(),
    expectedPipelineId: String(expectedPipelineId || ''),
    runtimeDatabase,
    environmentFlags: {
      releaseVerifiedConfiguredTrue: environment.releaseVerifiedConfiguredTrue === true,
      releaseVerifiedEffective: environment.releaseVerifiedEffective === true,
      releaseProofVerified: environment.releaseProofVerified === true,
      isolationCertification: String(environment.isolationCertification || '')
    },
    checks
  };
}

function writeGateOutput(result, env = process.env) {
  const outputPath = String(env.GITHUB_OUTPUT || '').trim();
  if (outputPath) {
    fs.appendFileSync(outputPath, `allowed=${result.promotionAllowed ? 'true' : 'false'}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  const summaryPath = String(env.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath) {
    const failed = result.checks.filter(item => isBlocking(item) && item.status !== 'PASS');
    const advisories = Array.isArray(result.advisories) ? result.advisories : [];
    const completion = !result.promotionAllowed
      ? 'Production remains blocked. No production domain promotion was authorized.'
      : advisories.length
        ? `All blocking checks passed; advisory checks remain: ${advisories.join(', ')}. This diagnostic does not certify production isolation.`
        : 'All runtime and release gates passed; the staged deployment may proceed to full smoke verification.';
    const lines = [
      '### Production runtime identity and release gate',
      `Status: **${result.status}**`,
      `HTTP status: ${result.httpStatus}`,
      `Expected source: ${result.expectedCommit}`,
      `Promotion allowed: ${result.promotionAllowed ? 'yes' : 'no'}`,
      ...result.checks.map(item => `- ${item.status}: ${item.name}${item.detail ? ` (${item.detail})` : ''}`),
      '',
      completion,
      ''
    ];
    fs.appendFileSync(summaryPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    return failed.length;
  }
  return result.checks.filter(item => isBlocking(item) && item.status !== 'PASS').length;
}

async function runDiagnostic(deploymentUrl, expectedCommit, expectedPipelineId, options = {}) {
  const parsed = parseDeploymentUrl(deploymentUrl);
  const curlRunner = options.curlRunner || runVercelCurl;
  const response = await curlRunner(parsed, DIAGNOSTIC_PATH, { connectTimeoutSeconds: 5, maxTimeSeconds: 45, processTimeoutMs: 60000 });
  let payload = {};
  try { payload = JSON.parse(response.body); } catch {}
  return evaluateRuntimeDiagnostic(payload, response.statusCode, expectedCommit, expectedPipelineId);
}

async function main() {
  const [deploymentUrl, expectedCommit, expectedPipelineId] = process.argv.slice(2);
  let result;
  try {
    result = await runDiagnostic(deploymentUrl, expectedCommit, expectedPipelineId);
  } catch (error) {
    const safeReason = /^[A-Z0-9_]{1,96}$/.test(String(error && error.message || ''))
      ? String(error.message) : 'RUNTIME_DIAGNOSTIC_EXECUTION_FAILED';
    result = {
      schemaVersion: 'opscore.production-runtime-diagnostic-result.v1',
      status: 'BLOCKED',
      promotionAllowed: false,
      httpStatus: null,
      expectedCommit: String(expectedCommit || '').toLowerCase(),
      expectedPipelineId: String(expectedPipelineId || ''),
      checks: [check('diagnostic_execution', false, safeReason)]
    };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  writeGateOutput(result);
  process.exitCode = failClosedExitCode(result);
}

if (require.main === module) {
  main().catch(() => {
    const result = {
      schemaVersion: 'opscore.production-runtime-diagnostic-result.v1',
      status: 'BLOCKED',
      promotionAllowed: false,
      httpStatus: null,
      checks: [check('diagnostic_execution', false, 'UNEXPECTED_FAILURE')]
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    writeGateOutput(result);
    process.exitCode = 1;
  });
}

module.exports = { DIAGNOSTIC_PATH, REQUIRED_DIAGNOSTIC_CHECKS, ADVISORY_CHECKS, evaluateRuntimeDiagnostic, runDiagnostic, writeGateOutput, failClosedExitCode };