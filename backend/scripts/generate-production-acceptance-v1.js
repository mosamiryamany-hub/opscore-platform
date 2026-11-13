#!/usr/bin/env node
'use strict';

/**
 * OpsCore production acceptance evidence v2.
 *
 * Live production database checks are READ-ONLY (runtime identity, RLS table
 * coverage, and the complete migration ledger). Tenant route isolation and
 * logical restore evidence are imported from caller-bound, disposable
 * PostgreSQL 18 CI runs. This script never creates production fixtures, never
 * calls the Neon management API, and never claims Neon PITR or production
 * recovery certification.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'API_INVENTORY.json');
const EVIDENCE_PATH = path.join(ROOT, 'docs', 'verification', 'PRODUCTION_ACCEPTANCE_RESULT.json');
const RESULT_PATH = process.env.OPSC_WRITE_EVIDENCE === '1'
  ? EVIDENCE_PATH
  : path.join(os.tmpdir(), 'opscore-production-acceptance-v2-' + process.pid + '.json');
const MATRIX_PATH = String(process.env.OPSC_TENANT_MATRIX_EVIDENCE_PATH || '').trim();
const RESTORE_PATH = String(process.env.OPSC_RESTORE_DRILL_EVIDENCE_PATH || '').trim();
const HASH_RE = /^[a-f0-9]{64}$/i;
const SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceCommit() {
  const expected = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  let actual = null;
  try {
    actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim().toLowerCase();
  } catch {
    return null;
  }
  return SHA_RE.test(actual) && (!expected || expected === actual) ? actual : null;
}

function pipelineId() {
  const value = String(process.env.GITHUB_RUN_ID || '').trim();
  return /^[1-9][0-9]{0,14}$/.test(value) ? value : null;
}

function readJson(filePath) {
  if (!filePath) throw new Error('EVIDENCE_PATH_REQUIRED');
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim() || Buffer.byteLength(raw, 'utf8') > 2_000_000) {
    throw new Error('EVIDENCE_FILE_SIZE_INVALID');
  }
  return { raw, value: JSON.parse(raw) };
}

function validateTenantMatrixEnvelope(envelope, expectedCommit, expectedPipeline) {
  const binding = envelope && envelope.binding || {};
  const evidence = envelope && envelope.evidence || {};
  const discovered = evidence.discovered || {};
  const tested = evidence.tested || {};
  const unauthenticated = tested.unauthenticated || {};
  const foreignId = tested.foreignIdProbe || {};
  const crossTenant = tested.crossTenantFixture || {};
  const totalRoutes = Number(discovered.tenantDataRoutes);
  const foreignIdRoutes = Number(discovered.foreignIdRoutes);
  const validSummary = Number.isSafeInteger(totalRoutes) && totalRoutes > 0 &&
    Number.isSafeInteger(foreignIdRoutes) && foreignIdRoutes >= 0 &&
    Number(unauthenticated.checks) === totalRoutes &&
    Number(unauthenticated.pass) === totalRoutes &&
    Number(unauthenticated.fail) === 0 &&
    Number(foreignId.checks) === foreignIdRoutes &&
    Number(foreignId.pass) === foreignIdRoutes &&
    Number(foreignId.fail) === 0 &&
    Number(crossTenant.checks) > 0 &&
    Number(crossTenant.pass) === Number(crossTenant.checks) &&
    Number(crossTenant.fail) === 0;
  const ok = envelope && envelope.schemaVersion === 'opscore.caller-bound-ci-evidence.v1' &&
    envelope.evidenceType === 'tenant-matrix' &&
    String(binding.commit || '').toLowerCase() === expectedCommit &&
    String(binding.pipelineId || '') === expectedPipeline &&
    binding.scope === 'DISPOSABLE_POSTGRESQL_18_CI' &&
    evidence.schemaVersion === 'opscore.tenant-isolation-matrix.v1' &&
    String(evidence.sourceCommit || '').toLowerCase() === expectedCommit &&
    evidence.status === 'PASS' &&
    evidence.productionCertification === false &&
    evidence.isolationCertification === 'NOT_CERTIFIED' &&
    HASH_RE.test(String(evidence.fullEvidenceSha256 || '')) &&
    Number(evidence.skippedCount) === 0 &&
    Number(evidence.cleanupErrorsCount) === 0 &&
    validSummary;
  return {
    ok: Boolean(ok),
    tenantDataRoutes: Number.isSafeInteger(totalRoutes) ? totalRoutes : 0,
    unauthenticatedChecks: Number(unauthenticated.checks) || 0,
    unauthenticatedPass: Number(unauthenticated.pass) || 0,
    foreignIdRoutes: Number.isSafeInteger(foreignIdRoutes) ? foreignIdRoutes : 0,
    foreignIdChecks: Number(foreignId.checks) || 0,
    foreignIdPass: Number(foreignId.pass) || 0,
    crossTenantChecks: Number(crossTenant.checks) || 0,
    evidenceSha256: HASH_RE.test(String(evidence.fullEvidenceSha256 || ''))
      ? String(evidence.fullEvidenceSha256).toLowerCase() : null,
    reason: ok ? null : 'TENANT_MATRIX_EVIDENCE_INVALID_OR_INCOMPLETE'
  };
}

function validateRestoreDrillEnvelope(envelope, expectedCommit, expectedPipeline) {
  const binding = envelope && envelope.binding || {};
  const evidence = envelope && envelope.evidence || {};
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : [];
  const archive = evidence.archive || {};
  const ok = envelope && envelope.schemaVersion === 'opscore.caller-bound-ci-evidence.v1' &&
    envelope.evidenceType === 'postgres-logical-restore' &&
    String(binding.commit || '').toLowerCase() === expectedCommit &&
    String(binding.pipelineId || '') === expectedPipeline &&
    binding.scope === 'DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI' &&
    evidence.schemaVersion === 'opscore.postgres-logical-restore-drill.v1' &&
    evidence.status === 'PASS' &&
    evidence.evidenceClass === 'CI_DISPOSABLE_DATABASE_LOGICAL_RESTORE' &&
    evidence.productionCertification === false &&
    evidence.ownershipAndAclRestored === false &&
    evidence.verificationScope === 'DATA_SCHEMA_CATALOG_RLS_AND_TABLE_CONTENT' &&
    evidence.cleanup && evidence.cleanup.status === 'PASS' &&
    checks.length > 0 && checks.every(check => check && check.status === 'PASS') &&
    Number(archive.bytes) >= 1024 &&
    HASH_RE.test(String(archive.sha256 || '')) &&
    Number(evidence.tableCount) > 0 &&
    limitations.some(value => /Neon point-in-time restore/i.test(String(value))) &&
    HASH_RE.test(String(evidence.fullEvidenceSha256 || ''));
  return {
    ok: Boolean(ok),
    checkCount: checks.length,
    tableCount: Number(evidence.tableCount) || 0,
    archiveSha256: HASH_RE.test(String(archive.sha256 || '')) ? String(archive.sha256).toLowerCase() : null,
    evidenceSha256: HASH_RE.test(String(evidence.fullEvidenceSha256 || ''))
      ? String(evidence.fullEvidenceSha256).toLowerCase() : null,
    reason: ok ? null : 'LOGICAL_RESTORE_EVIDENCE_INVALID_OR_INCOMPLETE'
  };
}

function verifyRouteInventory() {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const routes = Array.isArray(inventory.routes) ? inventory.routes : [];
  const seen = new Set();
  const invalid = [];
  for (const item of routes) {
    const method = String(item && item.method || '').toUpperCase();
    const route = String(item && item.route || '');
    const key = method + ' ' + route;
    if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ||
        !(route.startsWith('/api/') || route === '/metrics') || seen.has(key)) {
      invalid.push(key.slice(0, 180));
    }
    seen.add(key);
  }
  const ok = Number(inventory.routeCount) === routes.length && routes.length > 0 && invalid.length === 0;
  return {
    ok,
    declaredRoutes: Number(inventory.routeCount) || 0,
    sourceRoutes: routes.length,
    invalidEntries: invalid.slice(0, 20),
    source: inventory.routePatternInventory || null
  };
}

async function withClient(connectionString, fn, readOnly = true) {
  const { Client } = require('pg');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
    query_timeout: 22000,
    application_name: 'opscore-production-acceptance-v2'
  });
  let connected = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    if (readOnly) {
      await client.query('BEGIN READ ONLY');
      transaction = true;
    }
    return await fn(client);
  } finally {
    if (transaction) {
      try { await client.query('ROLLBACK'); }
      catch { throw new Error('PRODUCTION_READ_ONLY_TRANSACTION_ROLLBACK_FAILED'); }
    }
    if (connected) await client.end();
  }
}

async function checkRuntimeRole(client) {
  const result = await client.query(`
    SELECT current_database() AS database_name,
           current_user AS role_name,
           r.rolcanlogin AS login,
           r.rolsuper AS superuser,
           r.rolbypassrls AS bypass_rls,
           r.rolcreaterole AS create_role,
           r.rolcreatedb AS create_database,
           (SELECT count(*)::int
              FROM pg_auth_members am
              JOIN pg_roles elevated ON elevated.oid = am.roleid
             WHERE am.member = r.oid
               AND (elevated.rolsuper OR elevated.rolbypassrls OR
                    elevated.rolcreaterole OR elevated.rolcreatedb)
           ) AS elevated_membership_count
      FROM pg_roles r
     WHERE r.rolname = current_user
  `);
  const row = result.rows[0] || {};
  const safe = row.role_name === 'opscore_runtime' &&
    row.login === true && row.superuser === false && row.bypass_rls === false &&
    row.create_role === false && row.create_database === false &&
    Number(row.elevated_membership_count) === 0;
  return {
    ok: safe,
    runtimeRole: {
      name: row.role_name || null,
      login: row.login === true,
      superuser: row.superuser !== false,
      bypassRls: row.bypass_rls !== false,
      createRole: row.create_role !== false,
      createDatabase: row.create_database !== false,
      elevatedMembershipCount: Number.isSafeInteger(Number(row.elevated_membership_count))
        ? Number(row.elevated_membership_count) : -1,
      databaseName: row.database_name || null
    }
  };
}

async function checkTableCoverage(client) {
  const result = await client.query(`
    SELECT count(*)::int AS total_tables,
           count(*) FILTER (
             WHERE c.relrowsecurity IS TRUE AND c.relforcerowsecurity IS TRUE
           )::int AS tested_tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p')
       AND c.relname <> 'spatial_ref_sys'
       AND NOT EXISTS (
         SELECT 1
           FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass
            AND d.objid = c.oid
            AND d.deptype = 'e'
       )
  `);
  const total = Number(result.rows[0] && result.rows[0].total_tables) || 0;
  const tested = Number(result.rows[0] && result.rows[0].tested_tables) || 0;
  return {
    ok: total > 0 && tested === total,
    tenantTableCoverage: { status: total > 0 && tested === total ? 'PASS' : 'FAIL', totalTables: total, testedTables: tested }
  };
}

async function checkMigrationLedger(ownerClient) {
  const {
    LEGACY_CHECKSUM_RECONCILIATIONS,
    buildMigrationPlan
  } = require('../src/postgres-migration-plan');
  const {
    readMigrations,
    verifyLegacy042Catalog,
    verifyControlPlane053Catalog
  } = require('./apply-postgres-migrations');
  const identityResult = await ownerClient.query(
    'SELECT current_database() AS database_name, current_user AS role_name'
  );
  const ownerIdentity = identityResult.rows[0] || {};
  if (!ownerIdentity.database_name || !ownerIdentity.role_name) {
    throw new Error('MIGRATION_LEDGER_DATABASE_IDENTITY_UNAVAILABLE');
  }
  const source = readMigrations();
  const ledgerResult = await ownerClient.query(
    'SELECT filename, sha256 FROM public.schema_migrations ORDER BY filename'
  );
  const ledger = ledgerResult.rows;
  const verifiedLegacy = [];
  const rowByName = new Map(ledger.map(row => [row.filename, String(row.sha256 || '').toLowerCase()]));
  const sourceByName = new Map(source.map(item => [item.filename, item]));
  const legacy042 = LEGACY_CHECKSUM_RECONCILIATIONS['042_control_plane_tables.sql'];
  const legacy053 = LEGACY_CHECKSUM_RECONCILIATIONS['053_control_plane_restrictive_tenant_guards.sql'];

  const row42 = rowByName.get(legacy042.ledgerFilename);
  const file42 = sourceByName.get('042_control_plane_tables.sql');
  let legacy042Evidence = null;
  if (row42 && file42 && row42 === legacy042.ledgerSha256 && file42.sha256 === legacy042.sourceSha256) {
    legacy042Evidence = await verifyLegacy042Catalog(ownerClient);
    if (legacy042Evidence.verified) verifiedLegacy.push('042_control_plane_tables.sql');
  }

  const row53 = rowByName.get(legacy053.ledgerFilename);
  const file53 = sourceByName.get('053_control_plane_restrictive_tenant_guards.sql');
  let legacy053Evidence = null;
  if (row53 && file53 && row53 === legacy053.ledgerSha256 && file53.sha256 === legacy053.sourceSha256) {
    legacy053Evidence = await verifyControlPlane053Catalog(ownerClient);
    if (legacy053Evidence.verified) verifiedLegacy.push('053_control_plane_restrictive_tenant_guards.sql');
  }

  const plan = buildMigrationPlan(source, ledger, verifiedLegacy);
  const status = plan.blockers.length ? 'LEDGER_BLOCKED'
    : plan.pending.length ? 'LEDGER_PENDING' : 'PASS';
  return {
    ok: status === 'PASS',
    migrationLedger: {
      status,
      databaseName: ownerIdentity.database_name,
      ownerRole: ownerIdentity.role_name,
      databaseIdentityMatch: false,
      sourceMigrationCount: source.length,
      ledgerRowCount: ledger.length,
      matchedCount: plan.skipped.length,
      pendingCount: plan.pending.length,
      blockerCount: plan.blockers.length,
      pendingFilenames: plan.pending.map(item => item.filename),
      blockers: plan.blockers,
      verifiedLegacyMigrations: verifiedLegacy,
      legacy042Evidence,
      legacy053Evidence
    }
  };
}

async function main() {
  const runtimeUrl = String(process.env.OPSC_PRODUCTION_RUNTIME_URL || process.env.OPSC_DATABASE_URL || '').trim();
  const ownerUrl = String(process.env.OPSC_OWNER_DATABASE_URL || '').trim();
  const commit = sourceCommit();
  const pipeline = pipelineId();
  const report = {
    schemaVersion: 'opscore.production-acceptance.v2',
    status: 'FAIL',
    environment: String(process.env.OPSC_ACCEPTANCE_ENVIRONMENT || 'production'),
    databaseEngine: 'postgres',
    sourceCommit: commit,
    pipelineId: pipeline,
    testedAt: new Date().toISOString(),
    checks: {
      migrationLedgerParity: 'FAIL',
      tenantSessionIsolation: 'NOT_VERIFIED',
      crossTenantAccessDenied: 'NOT_VERIFIED',
      recoveryRestore: 'NOT_VERIFIED',
      backupIntegrity: 'NOT_VERIFIED',
      productionNeonPitr: 'NOT_VERIFIED'
    },
    evidenceScopes: {
      productionDatabase: 'LIVE_READ_ONLY',
      tenantIsolation: 'DISPOSABLE_POSTGRESQL_18_CI',
      tenantRouteSecurityCoverage: 'DISPOSABLE_POSTGRESQL_18_CI',
      apiRouteCoverage: 'NOT_VERIFIED_FUNCTIONAL_ACCEPTANCE_NOT_RUN',
      recoveryRestore: 'DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI',
      productionNeonPitr: 'NOT_VERIFIED'
    },
    productionIsolationCertification: false,
    tenantTableCoverage: { status: 'FAIL', totalTables: 0, testedTables: 0 },
    apiRouteCoverage: { status: 'NOT_VERIFIED', totalRoutes: 0, testedRoutes: 0, reason: 'FUNCTIONAL_ROUTE_ACCEPTANCE_NOT_RUN' },
    tenantRouteSecurityCoverage: {
      status: 'NOT_VERIFIED',
      scope: 'UNAUTHENTICATED_DENIAL_FOREIGN_ID_DENIAL_AND_CROSS_TENANT_FIXTURES_ONLY',
      tenantDataRoutes: 0,
      unauthenticatedChecks: 0,
      foreignIdRoutes: 0,
      foreignIdChecks: 0,
      crossTenantFixtureChecks: 0,
      functionalRouteAcceptance: 'NOT_VERIFIED'
    },
    runtimeRole: {
      name: null, login: false, superuser: true, bypassRls: true,
      createRole: true, createDatabase: true, elevatedMembershipCount: -1
    },
    migrationLedger: null,
    tenantMatrixEvidenceSha256: null,
    recoveryDrillEvidenceSha256: null,
    productionNeonPitrStatus: 'NOT_VERIFIED',
    generator: {
      name: 'generate-production-acceptance-v2',
      failClosed: true,
      writesProductionData: false,
      productionDatabaseAccess: 'READ_ONLY',
      neonManagementApiCalls: 0
    }
  };

  if (!runtimeUrl || !ownerUrl || !commit || !pipeline ||
      !SHA_RE.test(commit) || report.environment !== 'production') {
    report.reason = 'PRODUCTION_RUNTIME_OWNER_COMMIT_PIPELINE_AND_ENVIRONMENT_REQUIRED';
    writeReport(report);
    process.exitCode = 2;
    return;
  }

  try {
    const runtime = await withClient(runtimeUrl, async client => {
      const role = await checkRuntimeRole(client);
      const coverage = await checkTableCoverage(client);
      return { ...role, ...coverage };
    }, true);
    report.runtimeRole = runtime.runtimeRole;
    report.tenantTableCoverage = runtime.tenantTableCoverage;

    const migration = await withClient(ownerUrl, async client => {
      return checkMigrationLedger(client);
    }, true);
    const migrationDatabaseMatchesRuntime =
      migration.migrationLedger.databaseName === runtime.runtimeRole.databaseName;
    migration.migrationLedger.databaseIdentityMatch = migrationDatabaseMatchesRuntime;
    if (!migrationDatabaseMatchesRuntime) {
      migration.migrationLedger.blockers.push({
        code: 'MIGRATION_LEDGER_DATABASE_IDENTITY_MISMATCH',
        runtimeDatabaseName: runtime.runtimeRole.databaseName,
        migrationDatabaseName: migration.migrationLedger.databaseName
      });
      migration.migrationLedger.blockerCount += 1;
    }
    migration.ok = migration.ok && migrationDatabaseMatchesRuntime;
    report.migrationLedger = migration.migrationLedger;
    report.checks.migrationLedgerParity = migration.ok ? 'PASS' : 'FAIL';

    const inventory = verifyRouteInventory();
    report.apiRouteInventory = inventory;

    const matrixEnvelope = readJson(MATRIX_PATH).value;
    const matrix = validateTenantMatrixEnvelope(matrixEnvelope, commit, pipeline);
    report.tenantMatrixEvidenceSha256 = matrix.evidenceSha256;
    report.checks.tenantSessionIsolation = matrix.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED';
    report.checks.crossTenantAccessDenied = matrix.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED';
    report.apiRouteCoverage = {
      status: 'NOT_VERIFIED',
      totalRoutes: inventory.sourceRoutes,
      testedRoutes: 0,
      reason: 'FUNCTIONAL_ROUTE_ACCEPTANCE_NOT_RUN'
    };
    report.tenantRouteSecurityCoverage = {
      status: matrix.ok && inventory.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED',
      scope: 'UNAUTHENTICATED_DENIAL_FOREIGN_ID_DENIAL_AND_CROSS_TENANT_FIXTURES_ONLY',
      tenantDataRoutes: matrix.tenantDataRoutes,
      unauthenticatedChecks: matrix.unauthenticatedChecks,
      foreignIdRoutes: matrix.foreignIdRoutes,
      foreignIdChecks: matrix.foreignIdChecks,
      crossTenantFixtureChecks: matrix.crossTenantChecks,
      functionalRouteAcceptance: 'NOT_VERIFIED'
    };

    const restoreEnvelope = readJson(RESTORE_PATH).value;
    const restore = validateRestoreDrillEnvelope(restoreEnvelope, commit, pipeline);
    report.recoveryDrillEvidenceSha256 = restore.evidenceSha256;
    report.checks.recoveryRestore = restore.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED';
    report.checks.backupIntegrity = restore.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED';
    report.checks.productionNeonPitr = 'NOT_VERIFIED';
    report.productionRecovery = {
      logicalRestoreTestScope: restore.ok ? 'PASS_TEST_SCOPE' : 'NOT_VERIFIED',
      neonPointInTimeRestore: 'NOT_VERIFIED',
      archiveSha256: restore.archiveSha256,
      restoredTableCount: restore.tableCount,
      checkCount: restore.checkCount
    };

    const checksPass = report.checks.migrationLedgerParity === 'PASS' &&
      report.checks.tenantSessionIsolation === 'PASS_TEST_SCOPE' &&
      report.checks.crossTenantAccessDenied === 'PASS_TEST_SCOPE' &&
      report.checks.recoveryRestore === 'PASS_TEST_SCOPE' &&
      report.checks.backupIntegrity === 'PASS_TEST_SCOPE';
    const ok = runtime.ok && runtime.tenantTableCoverage.status === 'PASS' &&
      migration.ok && inventory.ok && matrix.ok && restore.ok && checksPass &&
      report.tenantRouteSecurityCoverage.status === 'PASS_TEST_SCOPE' &&
      report.apiRouteCoverage.status === 'NOT_VERIFIED';
    report.status = ok ? 'PASS' : 'FAIL';
    report.note = 'Live production database verification is read-only and covers the runtime role, application-table RLS/FORCE RLS, same-database identity for runtime and migration-ledger connections, and full source-to-ledger checksum parity. Tenant route authorization probes (unauthenticated denial, foreign-ID denial, and cross-tenant fixtures) and logical pg_dump/pg_restore are independently executed in disposable PostgreSQL 18 CI databases and bound to this exact commit and workflow run. Functional acceptance of every API route is NOT_VERIFIED. This evidence does NOT certify production tenant behavior, Neon PITR, production backup retention, object ownership/ACL restoration, or production recovery.';
    if (!ok) report.reason = 'ONE_OR_MORE_SCOPED_ACCEPTANCE_GATES_NOT_PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.reason = /^[A-Z0-9_:-]{1,120}$/.test(String(error && error.message || ''))
      ? String(error.message) : 'PRODUCTION_ACCEPTANCE_V2_FAILED';
    report.errorClass = error && error.name || 'Error';
  }

  writeReport(report);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(RESULT_PATH, body, { encoding: 'utf8', mode: 0o600 });
  const digest = sha256(body);
  fs.writeFileSync(RESULT_PATH + '.sha256', digest + '  ' + path.basename(EVIDENCE_PATH) + '\n', {
    encoding: 'utf8', mode: 0o600
  });
  process.stdout.write(JSON.stringify({
    schemaVersion: report.schemaVersion,
    status: report.status,
    reason: report.reason || null,
    sourceCommit: report.sourceCommit,
    pipelineId: report.pipelineId,
    evidenceSha256: digest,
    productionDatabaseAccess: report.generator.productionDatabaseAccess,
    productionIsolationCertification: report.productionIsolationCertification
  }, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    const report = {
      schemaVersion: 'opscore.production-acceptance.v2',
      status: 'FAIL',
      sourceCommit: sourceCommit(),
      pipelineId: pipelineId(),
      checks: {},
      productionIsolationCertification: false,
      generator: { name: 'generate-production-acceptance-v2', failClosed: true, writesProductionData: false },
      reason: 'PRODUCTION_ACCEPTANCE_V2_UNEXPECTED_FAILURE'
    };
    try { writeReport(report); } catch {}
    process.stderr.write('PRODUCTION_ACCEPTANCE_V2_UNEXPECTED_FAILURE\n');
    process.exitCode = 1;
  });
}

module.exports = {
  validateTenantMatrixEnvelope,
  validateRestoreDrillEnvelope,
  verifyRouteInventory
};
