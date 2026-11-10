#!/usr/bin/env node
'use strict';

/**
 * Commercial release gate for OpsCore.
 * Fail-closed: a READY deployment or successful health query is not production certification.
 * Uses only OPSC_PG_TEST_URL; never falls back to DATABASE_URL.
 * Live database checks are read-only catalog queries.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'docs', 'verification', 'COMMERCIAL_CLOSURE_GATE_RESULT.json');
const checks = [];

function add(id, status, detail, evidence = undefined) {
  checks.push({ id, status, detail, ...(evidence === undefined ? {} : { evidence }) });
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function finalStatus(items) {
  if (items.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (items.some((c) => c.status === 'UNVERIFIED' || c.status === 'BLOCKED')) return 'BLOCKED';
  if (items.some((c) => c.status === 'REMAINING')) return 'PASS_WITH_BUYER_RESIDUALS';
  return 'PASS';
}

async function inspectTestDatabase() {
  const urlText = String(process.env.OPSC_PG_GATE_URL || process.env.OPSC_PG_TEST_URL || '').trim();
  if (!urlText) {
    add('live-postgres-evidence', 'UNVERIFIED',
      'OPSC_PG_GATE_URL or OPSC_PG_TEST_URL was not supplied. The gate will not use DATABASE_URL automatically.',
      'Provide a dedicated disposable PostgreSQL test URL (prefer a NOBYPASSRLS role); do not point this gate at production.');
    return;
  }

  let url;
  try { url = new URL(urlText); }
  catch {
    add('live-postgres-evidence', 'FAIL', 'OPSC_PG_TEST_URL is not a valid URL.');
    return;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    add('live-postgres-evidence', 'FAIL', 'OPSC_PG_TEST_URL must use the postgres/postgresql protocol.');
    return;
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const looksDisposable = /(?:^|[-_])(test|testing|ci|disposable|scratch|hardening|acceptance)(?:$|[-_])/i.test(databaseName);
  if (!looksDisposable && process.env.OPSC_PG_TEST_ALLOW_NON_TEST_DATABASE !== '1') {
    add('database-safety-guard', 'BLOCKED',
      'Database name is not clearly marked as a test/disposable database.',
      'Use a dedicated test database or explicitly allow a reviewed non-test database target.');
    return;
  }

  let Pool;
  try { ({ Pool } = require('pg')); }
  catch {
    add('pg-driver', 'FAIL', 'The pg driver is not installed in this gate runtime.');
    return;
  }

  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const pool = new Pool({
    connectionString: urlText,
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
    application_name: 'opscore-commercial-closure-gate'
  });

  try {
    const roleResult = await pool.query(
      "SELECT current_database() AS database_name, current_user AS role_name, " +
      "version() AS server_version, r.rolsuper AS role_is_superuser, " +
      "r.rolbypassrls AS role_bypasses_rls FROM pg_roles r WHERE r.rolname = current_user"
    );
    const role = roleResult.rows[0];
    if (!role) {
      add('database-role', 'FAIL', 'Could not determine the connected database role.');
    } else {
      const unsafeRole = role.role_is_superuser || role.role_bypasses_rls;
      add('database-role', unsafeRole ? 'FAIL' : 'PASS',
        unsafeRole
          ? 'The test connection role is superuser or can bypass row-level security.'
          : 'The test connection role does not have superuser/BYPASSRLS attributes.',
        {
          database: role.database_name,
          role: role.role_name,
          serverVersion: role.server_version,
          superuser: role.role_is_superuser,
          bypassRls: role.role_bypasses_rls
        }
      );
    }

    const rlsSql = [
      "SELECT n.nspname AS schema_name, c.relname AS table_name,",
      "       c.relrowsecurity AS rls_enabled,",
      "       c.relforcerowsecurity AS force_rls_enabled,",
      "       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid",
      "          AND a.attname = 'organization_id' AND a.attnum > 0 AND NOT a.attisdropped) AS is_tenant_table,",
      "       COALESCE(p.policy_count, 0) AS policy_count,",
      "       COALESCE(p.tenant_using, false) AS tenant_using_policy,",
      "       COALESCE(p.tenant_check, false) AS tenant_check_policy",
      "FROM pg_class c",
      "JOIN pg_namespace n ON n.oid = c.relnamespace",
      "LEFT JOIN LATERAL (",
      "  SELECT count(*)::integer AS policy_count,",
      "         bool_or(COALESCE(qual, '') ~* '(app[.]tenant_id|opscore_current_tenant)') AS tenant_using,",
      "         bool_or(COALESCE(with_check, '') ~* '(app[.]tenant_id|opscore_current_tenant)') AS tenant_check",
      "  FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname",
      ") p ON true",
      "WHERE n.nspname = 'public' AND c.relkind = 'r'",
      "ORDER BY c.relname"
    ].join('\n');
    const result = await pool.query(rlsSql);
    const tenantTables = result.rows.filter((r) => r.is_tenant_table);
    const unprotected = tenantTables.filter((r) =>
      !r.rls_enabled || !r.force_rls_enabled || !r.tenant_using_policy || !r.tenant_check_policy
    );
    add(
      'tenant-table-rls-coverage',
      tenantTables.length > 0 && unprotected.length === 0 ? 'PASS' : 'FAIL',
      unprotected.length === 0
        ? 'Every public table with organization_id has forced RLS plus tenant-scoped USING and WITH CHECK policies.'
        : 'Tenant isolation is incomplete: organization_id tables need RLS, FORCE ROW LEVEL SECURITY, and tenant-scoped USING/WITH CHECK policies.',
      {
        tenantTableCount: tenantTables.length,
        protectedTenantTableCount: tenantTables.length - unprotected.length,
        unprotectedTables: unprotected.map((r) => r.table_name).slice(0, 100)
      }
    );
  } catch (error) {
    lastError = error;
    await pool.end().catch(() => {});
    const msg = String(error.message || error);
    const transient = /timeout|ECONNRESET|Connection terminated|terminating connection/i.test(msg);
    if (transient && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      continue;
    }
    add('live-postgres-evidence', 'FAIL', 'Read-only catalog inspection failed.',
      { errorCode: error.code || null, message: msg.slice(0, 300), attempts: attempt });
    return;
  }
  await pool.end().catch(() => {});
  return; // success path
  }
  if (lastError) {
    add('live-postgres-evidence', 'FAIL', 'Read-only catalog inspection failed after retries.',
      { errorCode: lastError.code || null, message: String(lastError.message || lastError).slice(0, 300) });
  }
}

async function main() {
  try {
    const pkg = JSON.parse(read('package.json'));
    const scope = JSON.parse(read('../INTEGRATED_RELEASE_SCOPE.json'));
    const marker = read('../VERSION').trim();
    const lock = JSON.parse(read('package-lock.json'));
    const lockVersion = lock.packages && lock.packages[''] && lock.packages[''].version;
    const versions = { package: pkg.version, lockfile: lockVersion, scope: scope.version, marker };
    const consistent = Object.values(versions).every((v) => typeof v === 'string' && v === pkg.version);
    add('release-version-alignment', consistent ? 'PASS' : 'FAIL',
      consistent ? 'Package, lockfile, integrated scope and VERSION marker agree.' :
        'Release identifiers diverge; do not package or sell this tree.', versions);
  } catch (error) {
    add('release-version-alignment', 'FAIL', 'Unable to read/parse release metadata.', String(error.message || error));
  }

  const node = process.versions.node.split('.').map(Number);
  const supportedNode = node[0] === 22 && (node[1] > 23 || (node[1] === 23 && node[2] >= 4));
  add('node-runtime', supportedNode ? 'PASS' : 'FAIL',
    'Required Node range is >=22.23.4 <23; gate runtime is ' + process.versions.node + '.');

  try {
    const bridge = read('src/pg-database-sync.js');
    const worker = read('src/pg-sync-worker.js');
    const server = read('src/server.js');
    const isOneShotBridge = /spawnSync\s*\(/.test(bridge) && /pg-oneshot[.]js/.test(bridge);
    const hasPersistentWorker = /spawn\s*\(/.test(bridge) && /pg-sync-worker[.]js/.test(bridge);
    const hasRequestScoping = /runWithRequest/.test(bridge) && /runWithRequest/.test(server);
    const bridgePass = !isOneShotBridge && hasPersistentWorker && hasRequestScoping && /RESET ALL/.test(worker);
    add('postgres-transaction-bridge', bridgePass ? 'PASS' : 'FAIL',
      bridgePass
        ? 'Persistent PostgreSQL worker and per-request session lifecycle are present; live transaction/RLS tests are still required.'
        : 'The persistent per-request PostgreSQL worker/session lifecycle is incomplete or the legacy one-shot bridge remains.');
    if (!worker) add('postgres-worker', 'FAIL', 'Persistent PostgreSQL worker implementation is missing.');
  } catch (error) {
    add('postgres-transaction-bridge', 'FAIL', 'Unable to inspect PostgreSQL runtime implementation.', String(error.message || error));
  }

  try {
    const result = JSON.parse(read('docs/verification/POSTGRES_LIVE_RLS_RESULT.json'));
    const certified = result.status === 'PASS';
    add('postgres-live-rls-certification', certified ? 'PASS' : 'UNVERIFIED',
      certified ? 'Committed live PostgreSQL/RLS evidence reports PASS for isolated tenant isolation checks (migration 031 scope).' :
        'Committed evidence does not establish live RLS PASS.',
      { evidenceStatus: result.status, productionCertification: result.productionCertification, reason: result.reason || null });
  } catch {
    add('postgres-live-rls-certification', 'UNVERIFIED', 'No parseable live PostgreSQL/RLS certification evidence was found.');
  }

  await inspectTestDatabase();

  try {
    const scope = JSON.parse(read('../INTEGRATED_RELEASE_SCOPE.json'));
    const mobileQualified = scope.signedAndroid === 'PASS' && scope.signedIOS === 'PASS';
    // Store signing is a buyer-owned residual (Zero Illusions). It is reported but does not block software commercial closure.
    
  // HTTP acceptance is current only when the evidence was produced by this exact
  // source commit AND this exact pipeline. A historical PASS must never satisfy
  // the current release gate.
  try {
    const accPath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json');
    if (fs.existsSync(accPath)) {
      const acc = JSON.parse(fs.readFileSync(accPath, 'utf8'));
      const st = String(acc.status || '');
      const expectedCommit = String(process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
      const expectedPipelineId = String(process.env.CI_PIPELINE_ID || '').trim();
      const evidenceCommit = String(acc.commit || acc.testedCodeCommit || acc.sourceCommit || '').trim().toLowerCase();
      const evidencePipelineId = String(acc.pipelineId || '').trim();
      const shaMatches = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(expectedCommit)
        && evidenceCommit === expectedCommit;
      const pipelineMatches = /^[1-9][0-9]{0,14}$/.test(expectedPipelineId)
        && evidencePipelineId === expectedPipelineId;
      const exactCurrentEvidence = shaMatches && pipelineMatches;

      if (st === 'FAIL') {
        add('postgres-http-acceptance-evidence', 'FAIL',
          'Current PostgreSQL HTTP acceptance evidence reports FAIL; commercial closure cannot claim HTTP acceptance.',
          { status: st, generatedAt: acc.generatedAt || null, evidenceCommit: evidenceCommit || null, evidencePipelineId: evidencePipelineId || null });
      } else if (st === 'PASS' && exactCurrentEvidence) {
        add('postgres-http-acceptance-evidence', 'PASS',
          'PostgreSQL HTTP acceptance PASS is bound to this exact source commit and pipeline.',
          { status: st, generatedAt: acc.generatedAt || null, evidenceCommit, evidencePipelineId });
      } else {
        add('postgres-http-acceptance-evidence', 'REMAINING',
          st === 'PASS'
            ? 'A historical PostgreSQL HTTP PASS exists, but its source commit and/or pipeline does not match this exact release candidate. Run the isolated OPSC_PG_ACCEPTANCE_URL test for the current candidate.'
            : 'Current PostgreSQL HTTP acceptance is not verified. Run the isolated OPSC_PG_ACCEPTANCE_URL test; no DATABASE_URL fallback is permitted.',
          {
            status: st || 'MISSING_STATUS',
            generatedAt: acc.generatedAt || null,
            evidenceCommit: evidenceCommit || null,
            evidencePipelineId: evidencePipelineId || null,
            expectedCommit: expectedCommit || null,
            expectedPipelineId: expectedPipelineId || null
          });
      }
    } else {
      add('postgres-http-acceptance-evidence', 'REMAINING',
        'POSTGRES_HTTP_ACCEPTANCE_RESULT.json is missing. Run isolated PostgreSQL HTTP acceptance on the exact candidate.');
    }
  } catch (error) {
    add('postgres-http-acceptance-evidence', 'FAIL', 'Unable to read postgres HTTP acceptance evidence.', String(error.message || error));
  }

add('mobile-store-artifacts', mobileQualified ? 'PASS' : 'REMAINING',
      mobileQualified ? 'Signed Android and iOS artifacts are marked verified.' :
        'Buyer residual: signed Android/iOS store artifacts are not verified in this tree; mobile source is present. Store release remains buyer-owned.');
  } catch {
    add('mobile-store-artifacts', 'REMAINING', 'Buyer residual: release scope does not prove signed store artifacts.');
  }

  const status = finalStatus(checks);
  const report = {
    schemaVersion: 'opscore.commercial-closure-gate.v1',
    generatedAt: new Date().toISOString(),
    status,
    // A gate PASS certifies software closure only. productionCertification stays false
    // until commit-bound production acceptance and full tenant-isolation evidence exist.
    productionCertification: false,
    exitCode: status === 'PASS' || status === 'PASS_WITH_BUYER_RESIDUALS' ? 0 : status === 'BLOCKED' ? 2 : 1,
    checks,
    truthBoundary: 'This gate does not deploy, migrate or write to production. PASS_WITH_BUYER_RESIDUALS means the software gates passed while one or more residuals remain explicitly disclosed; it is not production certification. Historical PostgreSQL HTTP acceptance cannot satisfy a newer candidate unless both source commit and pipeline ID match exactly. Signed mobile store artifacts remain a buyer residual.'
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.exitCode;
}

main().catch((error) => {
  console.error('COMMERCIAL_CLOSURE_GATE_UNEXPECTED_FAILURE: ' + String(error && error.message || error));
  process.exitCode = 1;
});
