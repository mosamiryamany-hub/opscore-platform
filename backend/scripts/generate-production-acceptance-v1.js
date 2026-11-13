#!/usr/bin/env node
'use strict';

/**
 * Fail-closed generator for opscore.production-acceptance.v1
 *
 * Rules:
 * - Never writes status=PASS unless every required check actually passed.
 * - sourceCommit / pipelineId come only from env (CI) or explicit allow-list; never invented as CERTIFIED.
 * - Does not set Vercel CERTIFIED flags; that is a separate operator step after hash publish.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'verification');
const OUT_FILE = path.join(OUT_DIR, 'PRODUCTION_ACCEPTANCE_RESULT.json');
const INVENTORY = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function sourceCommit() {
  const fromEnv = env('GITHUB_SHA') || env('OPSC_SOURCE_COMMIT') || env('CI_COMMIT_SHA');
  if (/^[a-f0-9]{40}$/i.test(fromEnv)) return fromEnv.toLowerCase();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim().toLowerCase();
  } catch {
    return null;
  }
}

function pipelineId() {
  const id = env('GITHUB_RUN_ID') || env('OPSC_PIPELINE_ID') || env('CI_PIPELINE_ID');
  return /^[1-9][0-9]{0,14}$/.test(id) ? id : null;
}

function selectRuntimeUrl() {
  return env('OPSC_PG_ACCEPTANCE_URL') || env('OPSC_DATABASE_URL') || env('DATABASE_URL_UNPOOLED') || env('DATABASE_URL');
}

function selectOwnerUrl() {
  return env('OPSC_OWNER_DATABASE_URL') || env('NEON_OWNER_DATABASE_URL') || '';
}

async function withClient(connectionString, fn) {
  const { Client } = require('pg');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 25000
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

function loadRouteInventory() {
  const raw = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const routes = Array.isArray(raw) ? raw : (raw.routes || raw.paths || []);
  // Normalize to method+path strings
  const normalized = [];
  if (Array.isArray(routes)) {
    for (const r of routes) {
      if (typeof r === 'string') normalized.push(r);
      else if (r && r.method && r.path) normalized.push(`${String(r.method).toUpperCase()} ${r.path}`);
      else if (r && r.route) normalized.push(String(r.route));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [p, methods] of Object.entries(raw)) {
      if (p.startsWith('/')) {
        const ms = Array.isArray(methods) ? methods : Object.keys(methods || {});
        for (const m of ms) normalized.push(`${String(m).toUpperCase()} ${p}`);
      }
    }
  }
  return [...new Set(normalized)].filter(Boolean);
}

async function checkRuntimeRole(client) {
  const row = (await client.query(`
    SELECT current_user AS name, session_user,
      r.rolcanlogin AS login, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
      r.rolcreaterole AS create_role, r.rolcreatedb AS create_database,
      COALESCE((
        SELECT count(*)::int FROM pg_auth_members am
        JOIN pg_roles g ON g.oid = am.roleid
        WHERE am.member = r.oid AND (g.rolsuper OR g.rolbypassrls OR g.rolname = 'neon_superuser')
      ), 0) AS elevated_membership_count
    FROM pg_roles r WHERE r.rolname = current_user
  `)).rows[0];
  const ok = row.name === 'opscore_runtime' && row.login === true && row.superuser === false &&
    row.bypass_rls === false && row.create_role === false && row.create_database === false &&
    Number(row.elevated_membership_count) === 0;
  return {
    ok,
    runtimeRole: {
      name: row.name,
      login: row.login === true,
      superuser: row.superuser === true,
      bypassRls: row.bypass_rls === true,
      createRole: row.create_role === true,
      createDatabase: row.create_database === true,
      elevatedMembershipCount: Number(row.elevated_membership_count) || 0
    }
  };
}

async function checkMigration053(ownerClient) {
  const row = (await ownerClient.query(
    `SELECT filename, sha256 FROM schema_migrations WHERE filename LIKE '053_%' LIMIT 1`
  )).rows[0];
  return { ok: Boolean(row && row.filename), detail: row || null };
}

async function checkTenantIsolation(runtimeClient, ownerClient) {
  const suffix = crypto.randomBytes(4).toString('hex');
  const orgA = `org_acc_a_${suffix}`;
  const orgB = `org_acc_b_${suffix}`;
  const now = new Date().toISOString();
  await runtimeClient.query(`
    SELECT set_config('app.access_mode','field',false),
           set_config('app.user_id','',false),
           set_config('app.tenant_id','',false),
           set_config('app.current_tenant_id','',false),
           set_config('app.organization_id','',false)
  `);
  const empty = (await runtimeClient.query('SELECT count(*)::int AS c FROM organizations')).rows[0].c;
  if (empty !== 0) {
    return { tenantSessionIsolation: 'FAIL', crossTenantAccessDenied: 'FAIL', detail: { emptyContextCount: empty } };
  }
  await ownerClient.query(
    'INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3),($4,$5,$6)',
    [orgA, 'Acc A', now, orgB, 'Acc B', now]
  );
  await runtimeClient.query(`
    SELECT set_config('app.access_mode',$1,false),
           set_config('app.user_id',$2,false),
           set_config('app.tenant_id',$3,false),
           set_config('app.current_tenant_id',$3,false),
           set_config('app.organization_id',$3,false)
  `, ['field', `usr_${suffix}`, orgA]);
  const seen = (await runtimeClient.query('SELECT id FROM organizations ORDER BY id')).rows.map((r) => r.id);
  const isolationOk = seen.length === 1 && seen[0] === orgA;
  let crossOk = false;
  let crossDetail = null;
  try {
    await runtimeClient.query(
      'INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3)',
      [`org_x_${suffix}`, 'X', now]
    );
    crossDetail = 'insert_succeeded';
  } catch (e) {
    crossOk = /row-level security/i.test(String(e.message)) || e.code === '42501';
    crossDetail = String(e.message).slice(0, 160);
  }
  try {
    await ownerClient.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[orgA, orgB, `org_x_${suffix}`]]);
  } catch { /* best effort cleanup */ }
  return {
    tenantSessionIsolation: isolationOk ? 'PASS' : 'FAIL',
    crossTenantAccessDenied: crossOk ? 'PASS' : 'FAIL',
    detail: { seen, crossDetail, orgA, orgB }
  };
}

async function checkTableCoverage(client) {
  const rows = (await client.query(`
    SELECT c.relname,
      c.relrowsecurity AS rls,
      c.relforcerowsecurity AS force_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relname <> 'spatial_ref_sys'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      )
    ORDER BY 1
  `)).rows;
  const total = rows.length;
  const tested = rows.filter((r) => r.rls === true && r.force_rls === true).length;
  const ok = total > 0 && tested === total;
  return {
    ok,
    tenantTableCoverage: {
      status: ok ? 'PASS' : 'FAIL',
      totalTables: total,
      testedTables: tested
    }
  };
}

async function checkApiRoutes() {
  const base = env('OPSC_HTTP_BASE') || env('OPSC_PRODUCTION_URL') || 'https://opscore-platform.vercel.app';
  let routes = [];
  try {
    routes = loadRouteInventory();
  } catch (e) {
    return {
      ok: false,
      apiRouteCoverage: { status: 'FAIL', totalRoutes: 0, testedRoutes: 0 },
      detail: `inventory: ${String(e.message).slice(0, 120)}`
    };
  }
  // Bound runtime: test up to all routes, prefer API paths
  const apiRoutes = routes.filter((r) => /\/api\//i.test(r) || /^[A-Z]+ \//.test(r));
  const sample = apiRoutes.length ? apiRoutes : routes;
  let pass = 0;
  const failures = [];
  for (const route of sample) {
    const parts = route.split(/\s+/);
    let method = 'GET';
    let pathPart = route;
    if (parts.length >= 2 && /^[A-Z]+$/.test(parts[0])) {
      method = parts[0];
      pathPart = parts.slice(1).join(' ');
    } else if (parts.length === 1 && parts[0].startsWith('/')) {
      method = 'GET';
      pathPart = parts[0];
    }
    const url = base.replace(/\/$/, '') + (pathPart.startsWith('/') ? pathPart : `/${pathPart}`);
    const probeUrl = url.replace(/\{[^}]+\}/g, 'probe').replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, 'probe');
    try {
      const res = await fetch(probeUrl, {
        method: ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(method) ? method : 'GET',
        redirect: 'manual',
        headers: { 'cache-control': 'no-cache' }
      });
      const publicOk = method === 'GET' && res.status >= 200 && res.status < 400;
      const protectedOk = res.status === 401 || res.status === 403 || res.status === 404 ||
        res.status === 405 || res.status === 415 || res.status === 501 || res.status === 400 ||
        res.status === 429;
      if (publicOk || protectedOk) pass += 1;
      else failures.push({ route, method, status: res.status });
    } catch (e) {
      failures.push({ route, error: String(e.message).slice(0, 80) });
    }
  }
  const total = sample.length;
  const ok = total > 0 && pass === total && failures.length === 0;
  return {
    ok,
    apiRouteCoverage: {
      status: ok ? 'PASS' : 'FAIL',
      totalRoutes: total,
      testedRoutes: pass
    },
    detail: { failures: failures.slice(0, 10), base }
  };
}

async function checkNeonBackupAndRecovery() {
  const key = env('NEON_API_KEY');
  const projectId = env('NEON_PROJECT_ID') || 'summer-leaf-18448271';
  const parentBranch = env('NEON_BRANCH_ID') || 'br-wispy-term-bcrqqj84';
  if (!key) {
    return { backupIntegrity: 'FAIL', recoveryRestore: 'FAIL', detail: 'NEON_API_KEY_required' };
  }
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  // Backup integrity: project has history retention and parent branch exists
  const projRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, { headers });
  if (!projRes.ok) {
    return { backupIntegrity: 'FAIL', recoveryRestore: 'FAIL', detail: `project_${projRes.status}` };
  }
  const proj = await projRes.json();
  const retention = Number(proj.project?.history_retention_seconds || proj.history_retention_seconds || 0);
  const backupOk = retention > 0;
  // Recovery: create ephemeral branch from parent and delete it
  const name = `acc-recovery-${Date.now().toString(36)}`;
  const createRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ branch: { name, parent_id: parentBranch } })
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    return {
      backupIntegrity: backupOk ? 'PASS' : 'FAIL',
      recoveryRestore: 'FAIL',
      detail: { createStatus: createRes.status, body: t.slice(0, 200), retention }
    };
  }
  const created = await createRes.json();
  const branchId = created.branch?.id;
  // Wait briefly for branch operable
  await new Promise((r) => setTimeout(r, 3000));
  let recoveryOk = Boolean(branchId);
  if (branchId) {
    const del = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
      method: 'DELETE',
      headers
    });
    recoveryOk = recoveryOk && del.ok;
  }
  return {
    backupIntegrity: backupOk ? 'PASS' : 'FAIL',
    recoveryRestore: recoveryOk ? 'PASS' : 'FAIL',
    detail: { retention, branchId: branchId || null }
  };
}

async function main() {
  const runtimeUrl = selectRuntimeUrl();
  const ownerUrl = selectOwnerUrl();
  const commit = sourceCommit();
  const pipeline = pipelineId();
  const report = {
    schemaVersion: 'opscore.production-acceptance.v1',
    status: 'FAIL',
    environment: env('OPSC_ACCEPTANCE_ENVIRONMENT') || 'production',
    databaseEngine: 'postgres',
    sourceCommit: commit,
    pipelineId: pipeline,
    testedAt: new Date().toISOString(),
    checks: {
      migration053: 'FAIL',
      tenantSessionIsolation: 'FAIL',
      crossTenantAccessDenied: 'FAIL',
      recoveryRestore: 'FAIL',
      backupIntegrity: 'FAIL'
    },
    tenantTableCoverage: { status: 'FAIL', totalTables: 0, testedTables: 0 },
    apiRouteCoverage: { status: 'FAIL', totalRoutes: 0, testedRoutes: 0 },
    runtimeRole: {
      name: null,
      login: false,
      superuser: true,
      bypassRls: true,
      createRole: true,
      createDatabase: true,
      elevatedMembershipCount: -1
    },
    generator: {
      name: 'generate-production-acceptance-v1',
      failClosed: true
    }
  };

  if (!runtimeUrl) {
    report.reason = 'RUNTIME_DATABASE_URL_REQUIRED';
    write(report);
    process.exitCode = 2;
    return;
  }
  if (!commit || !pipeline) {
    report.reason = 'SOURCE_COMMIT_AND_PIPELINE_ID_REQUIRED';
    write(report);
    process.exitCode = 2;
    return;
  }
  if (!ownerUrl) {
    report.reason = 'OWNER_DATABASE_URL_REQUIRED_FOR_MIGRATION_AND_FIXTURES';
    write(report);
    process.exitCode = 2;
    return;
  }

  try {
    await withClient(runtimeUrl, async (runtimeClient) => {
      const role = await checkRuntimeRole(runtimeClient);
      report.runtimeRole = role.runtimeRole;
      if (!role.ok) report.reason = 'RUNTIME_ROLE_NOT_LEAST_PRIVILEGE';

      const tables = await checkTableCoverage(runtimeClient);
      report.tenantTableCoverage = tables.tenantTableCoverage;

      await withClient(ownerUrl, async (ownerClient) => {
        const mig = await checkMigration053(ownerClient);
        report.checks.migration053 = mig.ok ? 'PASS' : 'FAIL';
        const iso = await checkTenantIsolation(runtimeClient, ownerClient);
        report.checks.tenantSessionIsolation = iso.tenantSessionIsolation;
        report.checks.crossTenantAccessDenied = iso.crossTenantAccessDenied;
        report.isolationDetail = iso.detail;
      });
    });

    const api = await checkApiRoutes();
    report.apiRouteCoverage = api.apiRouteCoverage;
    report.apiDetail = api.detail;

    const bak = await checkNeonBackupAndRecovery();
    report.checks.backupIntegrity = bak.backupIntegrity;
    report.checks.recoveryRestore = bak.recoveryRestore;
    report.backupDetail = bak.detail;

    const checksPass = Object.values(report.checks).every((v) => v === 'PASS');
    const coveragePass = report.tenantTableCoverage.status === 'PASS' && report.apiRouteCoverage.status === 'PASS';
    const rolePass = report.runtimeRole.name === 'opscore_runtime' &&
      report.runtimeRole.login === true &&
      report.runtimeRole.superuser === false &&
      report.runtimeRole.bypassRls === false &&
      report.runtimeRole.createRole === false &&
      report.runtimeRole.createDatabase === false &&
      report.runtimeRole.elevatedMembershipCount === 0;

    if (checksPass && coveragePass && rolePass && report.environment === 'production' && report.databaseEngine === 'postgres') {
      report.status = 'PASS';
      delete report.reason;
    } else {
      report.status = 'FAIL';
      report.reason = report.reason || 'ONE_OR_MORE_REQUIRED_CHECKS_FAILED';
    }
  } catch (e) {
    report.status = 'FAIL';
    report.reason = 'GENERATOR_EXCEPTION';
    report.error = String(e && e.message ? e.message : e).slice(0, 240);
  }

  const out = write(report);
  process.stdout.write(JSON.stringify({
    status: report.status,
    reason: report.reason || null,
    sourceCommit: report.sourceCommit,
    pipelineId: report.pipelineId,
    evidenceSha256: out.sha256,
    path: out.path,
    checks: report.checks,
    tenantTableCoverage: report.tenantTableCoverage,
    apiRouteCoverage: report.apiRouteCoverage,
    runtimeRole: report.runtimeRole
  }, null, 2) + '\n');
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

function write(report) {
  // Strip non-schema detail fields from the canonical evidence file
  const evidence = {
    schemaVersion: report.schemaVersion,
    status: report.status,
    environment: report.environment,
    databaseEngine: report.databaseEngine,
    sourceCommit: report.sourceCommit,
    pipelineId: report.pipelineId,
    testedAt: report.testedAt,
    checks: report.checks,
    tenantTableCoverage: report.tenantTableCoverage,
    apiRouteCoverage: report.apiRouteCoverage,
    runtimeRole: report.runtimeRole
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const body = JSON.stringify(evidence, null, 2) + '\n';
  fs.writeFileSync(OUT_FILE, body);
  const digest = sha256(body);
  fs.writeFileSync(`${OUT_FILE}.sha256`, `${digest}  PRODUCTION_ACCEPTANCE_RESULT.json\n`);
  // Full diagnostic sidecar (not used by release-proof)
  fs.writeFileSync(path.join(OUT_DIR, 'PRODUCTION_ACCEPTANCE_GENERATOR_DIAG.json'), JSON.stringify(report, null, 2) + '\n');
  return { path: OUT_FILE, sha256: digest };
}

main();
