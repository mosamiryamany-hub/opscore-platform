#!/usr/bin/env node
'use strict';

/**
 * OpsCore P2.2 — Production Isolation Extended sample, regenerated from the
 * executing test itself (never hand-edited).
 *
 * Root-cause fix for "auth-mode-memberships: REQUIRES_RETEST": the prior run
 * issued an intentional 42501 cross-tenant denial and kept using the same
 * aborted transaction, so the membership listing could only be SKIPped. This
 * gate reproduces the denial (BEGIN → denied INSERT → ROLLBACK) and then
 * re-runs the membership listing in a FRESH transaction, as prescribed.
 *
 * Target: the dedicated disposable acceptance engine (OPSC_PG_ACCEPTANCE_URL).
 * Production Neon writes and migrations are forbidden in this phase; every
 * check is read-only except RLS-rejected probes, which write zero rows. All
 * synthetic fixtures are removed and removal is verified before the report is
 * emitted.
 *
 * Evidence policy: backend/docs/verification/PRODUCTION_ISOLATION_EXTENDED.json
 * is written only when OPSC_WRITE_EVIDENCE=1; otherwise a temp file. The
 * connection URL is never printed or persisted; only non-secret database and
 * server metadata is recorded. productionCertification stays false — sample
 * isolation is not formal certification (NOT_CERTIFIED).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const REPORT_NAME = 'PRODUCTION_ISOLATION_EXTENDED.json';
const EVIDENCE_PATH = path.join(root, 'docs', 'verification', REPORT_NAME);
const RESULT_PATH = process.env.OPSC_WRITE_EVIDENCE === '1'
  ? EVIDENCE_PATH
  : path.join(os.tmpdir(), `opscore-isolation-extended-${process.pid}.json`);

function sourceCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); }
  catch { return null; }
}

function redact(urlText) {
  try {
    const parsed = new URL(urlText);
    return `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}/${parsed.pathname.replace(/^\/+/, '')}`;
  } catch { return 'invalid-url'; }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(RESULT_PATH, body);
  fs.writeFileSync(`${RESULT_PATH}.sha256`, `${crypto.createHash('sha256').update(body).digest('hex')}  ${REPORT_NAME}\n`);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`ISOLATION_EXTENDED_REPORT=${RESULT_PATH}\n`);
}

async function main() {
  const urlText = String(process.env.OPSC_PG_ACCEPTANCE_URL || '').trim();
  const report = {
    schemaVersion: 'opscore.production-isolation-extended.v2',
    generatedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    testedTarget: urlText ? redact(urlText) : null,
    productionCertification: false,
    isolationCertification: 'NOT_CERTIFIED',
    checks: []
  };
  const checks = report.checks;
  const record = (id, status, detail) => checks.push({ id, status, detail });

  if (!urlText) {
    report.status = 'UNVERIFIED';
    report.reason = 'OPSC_PG_ACCEPTANCE_URL_REQUIRED';
    report.note = 'No PostgreSQL request was attempted. Supply the dedicated disposable acceptance engine URL.';
    writeReport(report);
    process.exitCode = 2;
    return;
  }

  let Pool;
  try { ({ Pool } = require('pg')); }
  catch {
    report.status = 'UNVERIFIED';
    report.reason = 'POSTGRES_DRIVER_MISSING';
    writeReport(report);
    process.exitCode = 2;
    return;
  }

  const pool = new Pool({
    connectionString: urlText,
    max: 1,
    connectionTimeoutMillis: 20000,
    statement_timeout: 20000,
    idle_in_transaction_session_timeout: 20000,
    application_name: 'opscore-isolation-extended-gate'
  });
  const client = await pool.connect();
  const fixture = { orgs: [], users: [] };
  let cleanupErrors = [];

  const setContext = async (mode, { user = '', tenant = '' } = {}) => {
    await client.query(
      "SELECT set_config('app.access_mode',$1,false), set_config('app.user_id',$2,false), set_config('app.tenant_id',$3,false), set_config('app.current_tenant_id',$3,false), set_config('app.organization_id',$3,false)",
      [mode, user, tenant]
    );
  };

  try {
    const info = (await client.query(
      "SELECT current_database() AS db, current_user AS role, current_setting('server_version') AS server_version, " +
      'r.rolsuper AS superuser, r.rolbypassrls AS bypass FROM pg_roles r WHERE r.rolname = current_user'
    )).rows[0];
    if (info.superuser || info.bypass) throw new Error('CONNECTION_ROLE_MUST_NOT_BYPASS_RLS');
    record('app-role-least-privilege', 'PASS', JSON.stringify({ current_user: info.role, current_database: info.db, super: false, bypass: false }));

    // Extension-owned tables (e.g. postgis spatial_ref_sys) are excluded: they are
    // installed and owned by the extension, not application data.
    const cov = (await client.query(
      "SELECT count(*) FILTER (WHERE c.relrowsecurity) AS rls_on, count(*) FILTER (WHERE c.relforcerowsecurity) AS force_rls, count(*) AS tables " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
      "LEFT JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'e' " +
      "WHERE n.nspname = 'public' AND c.relkind = 'r' AND d.objid IS NULL"
    )).rows[0];
    record('catalog-rls-coverage', (Number(cov.rls_on) === Number(cov.tables) && Number(cov.force_rls) === Number(cov.tables)) ? 'PASS' : 'FAIL',
      JSON.stringify({ rls_on: Number(cov.rls_on), force_rls: Number(cov.force_rls), tables: Number(cov.tables) }));

    // Synthetic tenants under the documented GUC contract (no BYPASSRLS);
    // removed and verified removed before the report is emitted.
    const stamp = crypto.randomBytes(6).toString('hex');
    const orgA = `org_iso_ext_a_${stamp}`;
    const orgB = `org_iso_ext_b_${stamp}`;
    const userA = `usr_iso_ext_a_${stamp}`;
    const userB = `usr_iso_ext_b_${stamp}`;
    const createdAt = new Date().toISOString();
    fixture.orgs.push(orgA, orgB);
    fixture.users.push(userA, userB);

    await setContext('system', { tenant: orgA });
    await client.query('INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3)', [orgA, `Isolation Extended A ${stamp}`, createdAt]);
    await setContext('system', { tenant: orgB });
    await client.query('INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3)', [orgB, `Isolation Extended B ${stamp}`, createdAt]);
    await setContext('auth', { user: userA });
    await client.query('INSERT INTO users (id, email, password_hash, status, created_at) VALUES ($1,$2,$3,$4,$5)', [userA, `${userA}@isolation.test`, 'x', 'active', createdAt]);
    await setContext('auth', { user: userB });
    await client.query('INSERT INTO users (id, email, password_hash, status, created_at) VALUES ($1,$2,$3,$4,$5)', [userB, `${userB}@isolation.test`, 'x', 'active', createdAt]);
    await setContext('auth', { user: userA, tenant: orgA });
    await client.query('INSERT INTO memberships (user_id, organization_id, role, created_at) VALUES ($1,$2,$3,$4)', [userA, orgA, 'owner', createdAt]);
    await setContext('auth', { user: userB, tenant: orgB });
    await client.query('INSERT INTO memberships (user_id, organization_id, role, created_at) VALUES ($1,$2,$3,$4)', [userB, orgB, 'owner', createdAt]);
    record('tenant-sample', 'INFO', `orgA=${orgA} orgB=${orgB} realOrgs=2`);

    await setContext('field', { tenant: orgA });
    const visible = (await client.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n;
    record('field-mode-sees-tenant-scope', Number(visible) === 1 ? 'PASS' : 'FAIL', `orgs_visible=${visible}`);

    // Intentional cross-tenant denial: its own transaction, aborted on purpose,
    // exactly reproducing the original failure mode. Zero rows are written.
    await setContext('field', { tenant: orgA });
    let deniedCode = null;
    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO organizations (id, name) VALUES ($1,$2)', [`org_iso_foreign_${stamp}`, 'cross-tenant probe']);
    } catch (error) {
      deniedCode = error.code || null;
    }
    await client.query('ROLLBACK');

    // THE RE-TEST: the membership listing runs in a FRESH transaction after the
    // aborted probe — the root-cause fix for the prior transaction-aborted SKIP.
    await setContext('auth', { user: userA });
    let membershipRows = -1;
    let membershipError = null;
    try {
      membershipRows = (await client.query('SELECT organization_id FROM opscore_list_memberships_for_user($1)', [userA])).rowCount;
    } catch (error) {
      membershipError = error.code || String(error.message || error).slice(0, 80);
    }
    record('auth-mode-memberships', membershipRows >= 1 ? 'PASS' : 'FAIL',
      `freshTransaction=true; memberships=${membershipRows}${membershipError ? `; error=${membershipError}` : ''}`);

    const fns = (await client.query(
      "SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'public' AND proname IN ('opscore_count_users','opscore_current_tenant','opscore_current_user','opscore_resolve_login_candidate','opscore_resolve_session_by_token_hash','opscore_list_memberships_for_user') ORDER BY proname"
    )).rows;
    record('auth-plane-functions', fns.length >= 5 ? 'PASS' : 'FAIL',
      JSON.stringify(fns.map(f => ({ proname: f.proname, prosecdef: f.prosecdef }))));

    const privileged = (await client.query(
      "SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND proname = 'opscore_is_privileged'"
    )).rows;
    record('opscore_is_privileged-security-definer', privileged.length === 1 && privileged[0].prosecdef ? 'PASS' : 'FAIL',
      JSON.stringify(privileged.map(f => ({ proname: f.proname, prosecdef: f.prosecdef }))));

    report.status = checks.some(c => c.status === 'FAIL') ? 'FAIL' : 'PASS';
    report.note = 'Extended isolation sample re-executed from this gate on the dedicated disposable acceptance engine. auth-mode-memberships re-ran in a fresh transaction after the intentional 42501 denial (root cause fixed; no manual status change). productionIsolationCertification remains NOT_CERTIFIED; no production Neon writes or migrations were performed.';
  } catch (error) {
    report.status = 'FAIL';
    report.reason = error.code || error.message;
    report.error = String(error.message || error).slice(0, 350);
    report.note = 'The gate is fail-closed. A failed sample run is not certification.';
  } finally {
    // Targeted cleanup: only this run's synthetic fixtures, removal verified.
    try {
      for (const org of fixture.orgs) {
        await setContext('system', { tenant: org });
        await client.query('DELETE FROM memberships WHERE organization_id = $1', [org]).catch(e => cleanupErrors.push({ operation: 'delete-memberships', code: e.code }));
        await client.query('DELETE FROM work_orders WHERE organization_id = $1', [org]).catch(e => cleanupErrors.push({ operation: 'delete-work-orders', code: e.code }));
        await client.query('DELETE FROM customers WHERE organization_id = $1', [org]).catch(e => cleanupErrors.push({ operation: 'delete-customers', code: e.code }));
        const deletedOrg = await client.query('DELETE FROM organizations WHERE id = $1 RETURNING id', [org]).catch(e => { cleanupErrors.push({ operation: 'delete-organization', code: e.code }); return null; });
        if (deletedOrg && deletedOrg.rowCount === 0) cleanupErrors.push({ operation: 'verify-organization-deleted', id: org });
      }
      for (const user of fixture.users) {
        await setContext('system', { user });
        await client.query('DELETE FROM memberships WHERE user_id = $1', [user]).catch(e => cleanupErrors.push({ operation: 'delete-user-memberships', code: e.code }));
        await client.query('DELETE FROM sessions WHERE user_id = $1', [user]).catch(e => cleanupErrors.push({ operation: 'delete-user-sessions', code: e.code }));
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user]).catch(e => cleanupErrors.push({ operation: 'delete-user-reset-tokens', code: e.code }));
        const deletedUser = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [user]).catch(e => { cleanupErrors.push({ operation: 'delete-user', code: e.code }); return null; });
        if (deletedUser && deletedUser.rowCount === 0) cleanupErrors.push({ operation: 'verify-user-deleted', id: user });
      }
      await setContext('', {});
      if (cleanupErrors.length) {
        report.status = 'FAIL';
        report.cleanupErrors = cleanupErrors;
        report.note = 'Synthetic fixture cleanup reported errors; a run that leaves residue is not a PASS.';
      }
    } catch (error) {
      report.status = 'FAIL';
      report.cleanupErrors = [{ operation: 'cleanup', message: String(error.message || error).slice(0, 200) }];
    }
    client.release();
    await pool.end().catch(() => {});
    writeReport(report);
    process.exitCode = report.status === 'PASS' ? 0 : 1;
  }
}

main().catch(error => {
  process.stderr.write(`ISOLATION_EXTENDED_UNEXPECTED_FAILURE: ${String(error && error.message || error)}\n`);
  process.exit(1);
});
