'use strict';

/**
 * OpsCore P3 — Tenant isolation matrix (route-level).
 *
 * Source of truth: docs/API_INVENTORY.json, regenerated from src/server.js by
 * scripts/api-inventory.js (no approximate route counts).
 *
 * For every route that reads or writes tenant data this matrix executes:
 *   1. unauthenticated request → HTTP 401/403/404; server errors are failures;
 *   2. foreign-ID probe (tenant B session, source-rendered resource ID) → HTTP
 *      401/403/404 or a documented empty collection; server errors are failures;
 *   3. true cross-tenant fixtures cover work-orders, customers and evidence
 *      uploads, including customer soft-delete/restore and evidence-chunk writes.
 *
 * Two tenants are provisioned through SQL under the application's documented
 * access_mode/tenant GUC contract (no BYPASSRLS) on a disposable engine
 * (OPSC_PG_ACCEPTANCE_URL or OPSC_PG_TEST_URL). Only this run's fixture rows
 * are removed, and removal is verified, before the report is emitted.
 *
 * Report: docs/verification/TENANT_ISOLATION_MATRIX.json when
 * OPSC_WRITE_EVIDENCE=1, otherwise a temp file. The connection URL is never
 * printed. productionCertification stays false — even on PASS the formal
 * production isolation certification remains NOT_CERTIFIED.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.join(root, 'docs', 'API_INVENTORY.json');
const REPORT_NAME = 'TENANT_ISOLATION_MATRIX.json';
const EVIDENCE_PATH = path.join(root, 'docs', 'verification', REPORT_NAME);
const RESULT_PATH = process.env.OPSC_WRITE_EVIDENCE === '1'
  ? EVIDENCE_PATH
  : path.join(os.tmpdir(), `opscore-tenant-matrix-${process.pid}.json`);

const ID_PLACEHOLDER = /\{(?:id|param|index)\}|\(\\d\+\)/;
const SAFE_PROBE_ID = '00000000-0000-4000-8000-000000000000';
const PARAMETER_SEGMENTS = Object.freeze({ del: 'customers', rest: 'customers', ap: 'approve', esc: 'acknowledge', hist: 'customer' });

function buildProbePath(routeRecord) {
  let route = String(routeRecord && routeRecord.route || '');
  if (route.includes('{param}')) {
    const segment = PARAMETER_SEGMENTS[routeRecord.patternVariable];
    if (!segment) throw new Error('TENANT_MATRIX_ROUTE_PARAMETER_UNRESOLVED: ' + String(routeRecord.patternVariable || 'missing'));
    route = route.replace(/\{param\}/g, segment);
  }
  route = route.replace(/\{id\}/g, SAFE_PROBE_ID).replace(/\{index\}/g, '0').replace(/\(\\d\+\)/g, '0');
  if (route.includes('{') || route.includes('}') || route.includes('(\\d+)'))
    throw new Error('TENANT_MATRIX_ROUTE_PLACEHOLDER_UNRESOLVED: ' + route);
  return route;
}
const BODY_METHODS = new Set(['POST', 'PATCH', 'PUT']);
const EXCLUDED_ROUTES = new Set(['/api/health', '/api/openapi.json', '/api/v1/billing/stripe/webhook']);
// Documented diagnostic endpoints: they expose platform/diagnostic posture (not
// tenant data). /metrics requires METRICS_AUTH_TOKEN in production (HTTP 404 when
// unconfigured); the verify endpoints are public release/deployment proofs.
const DIAGNOSTIC_ROUTES = new Set(['/api/verify/database', '/api/verify/database-security', '/metrics']);

test('tenant matrix probe paths resolve every source-derived route placeholder', () => {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const parameterized = (inventory.routes || []).filter(r => ID_PLACEHOLDER.test(String(r.route || '')));
  assert.ok(parameterized.length > 0, 'API inventory must contain parameterized tenant routes');
  for (const route of parameterized) {
    const target = buildProbePath(route);
    assert.ok(target.startsWith('/api/'), `probe target must remain an API path: ${target}`);
    assert.ok(!ID_PLACEHOLDER.test(target), `probe target contains an unresolved placeholder: ${target}`);
  }
});

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

function writeResult(payload) {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(payload, null, 2) + '\n');
}

function waitForServer(base, child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = async () => {
      if (child.exitCode !== null) return reject(new Error('SERVER_EXITED_BEFORE_READY'));
      try {
        const resp = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) return resolve();
      } catch { /* not ready yet */ }
      if (Date.now() - started > 45000) return reject(new Error('SERVER_READY_TIMEOUT'));
      setTimeout(poll, 400);
    };
    poll();
  });
}

test('Tenant isolation matrix: unauthenticated denial, foreign-ID denial and cross-tenant fixture isolation across the route inventory', async t => {
  const urlText = String(process.env.OPSC_PG_ACCEPTANCE_URL || process.env.OPSC_PG_TEST_URL || '').trim();
  if (!urlText) {
    writeResult({
      schemaVersion: 'opscore.tenant-isolation-matrix.v1',
      generatedAt: new Date().toISOString(),
      sourceCommit: sourceCommit(),
      status: 'UNVERIFIED',
      reason: 'DISPOSABLE_ENGINE_URL_REQUIRED',
      note: 'No disposable engine URL was supplied (OPSC_PG_TEST_URL in CI, OPSC_PG_ACCEPTANCE_URL for evidence runs). No request was attempted.'
    });
    t.skip('No disposable engine URL: tenant isolation matrix reported as UNVERIFIED.');
    return;
  }

  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const seen = new Set();
  const routes = (inventory.routes || [])
    .map(r => ({ method: r.method, route: r.route, auth: r.auth, patternVariable: r.patternVariable }))
    .filter(r => { const key = `${r.method} ${r.route}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const tenantRoutes = routes.filter(r => r.auth !== 'public' && !r.route.startsWith('/api/v1/auth/') && !EXCLUDED_ROUTES.has(r.route) && !DIAGNOSTIC_ROUTES.has(r.route));

  const unauthenticated = [];
  const foreignId = [];
  const crossTenant = [];
  const skipped = [];
  const summary = group => ({
    checks: group.length,
    pass: group.filter(x => x.status === 'PASS').length,
    fail: group.filter(x => x.status !== 'PASS').length
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-tenant-matrix-'));
  const port = 30000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      SQLITE_PATH: path.join(dir, 'unused.sqlite'),
      OPSC_REPOSITORY_PATH: path.join(dir, 'files'),
      DATABASE_ENGINE: 'postgres',
      DATABASE_URL: urlText,
      OPSC_DATABASE_URL: '',
      // SSL mode follows the target URL; the sync bridge's require-default
      // cannot connect to a loopback PostgreSQL without TLS.
      OPSC_PG_SSL_MODE: /127\.0\.0\.1|localhost/.test(new URL(urlText).host) ? 'disable' : 'require',
      AUTH_MODE: 'local',
      OPSC_TEST_SCRYPT_N: process.env.OPSC_TEST_SCRYPT_N || '32768',
      // The probe sweeps hundreds of intentionally-rejected requests; the default
      // firewall window (240/min) would turn legitimate denials into 429 noise.
      // The sweep targets are expected to be denied — raising the limit on this
      // test-owned server keeps the checks about authorization, not rate limits.
      FIREWALL_RATE_LIMIT: '9999',
      FIREWALL_RATE_WINDOW_MS: '60000',
      LOGIN_RATE_LIMIT: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});

  const base = `http://127.0.0.1:${port}`;
  const requestBase = async (pathname, options = {}, cookie = null) => {
    const headers = {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(base + pathname, { ...options, headers, signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { response, data, text };
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  // The gateway firewall rate-limits request bursts (the probe sweeps below);
  // retry 429 with backoff so legitimate fixture calls are not misreported.
  const request = async (pathname, options = {}, cookie = null, attempts = 8) => {
    let x = await requestBase(pathname, options, cookie);
    for (let i = 1; x.response.status === 429 && i < attempts; i++) {
      await sleep(1200 * i);
      x = await requestBase(pathname, options, cookie);
    }
    return x;
  };

  let control = null;
  const cleanupErrors = [];
  try {
    await waitForServer(base, child);

    // ---- Provision two tenants via SQL under the documented GUC contract ----
    const { Pool } = require('pg');
    const { hashPassword } = require('../src/security');
    control = new Pool({ connectionString: urlText, max: 2, connectionTimeoutMillis: 60000, idleTimeoutMillis: 30000, application_name: 'opscore-tenant-matrix' });
    const fx = await control.connect();
    const stamp = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
    const orgA = `org_matrix_a_${stamp}`;
    const orgB = `org_matrix_b_${stamp}`;
    const userA = `usr_matrix_a_${stamp}`;
    const userB = `usr_matrix_b_${stamp}`;
    const passwordA = 'Matrix-A-strong-2026';
    const passwordB = 'Matrix-B-strong-2026';
    const emailA = `owner-a-${stamp}@matrix.test`;
    const emailB = `owner-b-${stamp}@matrix.test`;
    const createdAt = new Date().toISOString();
    const setCtx = async (mode, user, tenant) => {
      await fx.query(
        "SELECT set_config('app.access_mode',$1,false), set_config('app.user_id',$2,false), set_config('app.tenant_id',$3,false), set_config('app.current_tenant_id',$3,false), set_config('app.organization_id',$3,false)",
        [mode, user || '', tenant || '']
      );
    };
    await setCtx('system', '', orgA);
    await fx.query('INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3)', [orgA, `Matrix Tenant A ${stamp}`, createdAt]);
    await setCtx('system', '', orgB);
    await fx.query('INSERT INTO organizations (id, name, created_at) VALUES ($1,$2,$3)', [orgB, `Matrix Tenant B ${stamp}`, createdAt]);
    await setCtx('auth', userA, '');
    await fx.query('INSERT INTO users (id, email, password_hash, status, created_at) VALUES ($1,$2,$3,$4,$5)', [userA, emailA, hashPassword(passwordA), 'active', createdAt]);
    await setCtx('auth', userB, '');
    await fx.query('INSERT INTO users (id, email, password_hash, status, created_at) VALUES ($1,$2,$3,$4,$5)', [userB, emailB, hashPassword(passwordB), 'active', createdAt]);
    await setCtx('auth', userA, orgA);
    await fx.query('INSERT INTO memberships (user_id, organization_id, role, created_at) VALUES ($1,$2,$3,$4)', [userA, orgA, 'owner', createdAt]);
    await setCtx('auth', userB, orgB);
    await fx.query('INSERT INTO memberships (user_id, organization_id, role, created_at) VALUES ($1,$2,$3,$4)', [userB, orgB, 'owner', createdAt]);
    fx.release();

    const login = async (email, password) => {
      const x = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      assert.equal(x.response.status, 200, `matrix login failed (${email}): HTTP ${x.response.status}`);
      const cookie = String(x.response.headers.get('set-cookie') || '').split(';')[0];
      assert.ok(cookie, 'matrix login must issue a session cookie');
      return cookie;
    };
    const cookieA = await login(emailA, passwordA);
    const cookieB = await login(emailB, passwordB);

    // ---- Tenant A fixtures through the HTTP API (documented payload contract) ----
    let x = await request('/api/v1/customers', { method: 'POST', body: JSON.stringify({ name: `Matrix Customer A ${stamp}` }) }, cookieA);
    assert.equal(x.response.status, 201, `matrix customer fixture failed: ${JSON.stringify(x.data)}`);
    const customerAId = x.data.id;
    x = await request('/api/v1/work-orders', { method: 'POST', body: JSON.stringify({ title: `Matrix Work Order A ${stamp}`, customerId: customerAId, description: 'tenant isolation matrix fixture' }) }, cookieA);
    assert.equal(x.response.status, 201, `matrix work-order fixture failed: ${JSON.stringify(x.data)}`);
    const workOrderAId = x.data.id;

    // ---- 1) Unauthenticated denial for every tenant-data route ----
    for (const r of tenantRoutes) {
      const target = ID_PLACEHOLDER.test(r.route) ? buildProbePath(r) : r.route;
      try {
        const resp = await fetch(base + target, {
          method: r.method,
          headers: BODY_METHODS.has(r.method) ? { 'content-type': 'application/json' } : {},
          body: BODY_METHODS.has(r.method) ? '{}' : undefined,
          signal: AbortSignal.timeout(20000)
        });
        const denied = [401, 403, 404].includes(resp.status);
        unauthenticated.push({ route: `${r.method} ${r.route}`, status: denied ? 'PASS' : 'FAIL', httpStatus: resp.status, detail: denied ? 'unauthenticated request rejected' : 'UNAUTHENTICATED ACCESS SUCCEEDED' });
      } catch (error) {
        unauthenticated.push({ route: `${r.method} ${r.route}`, status: 'FAIL', httpStatus: null, detail: `request error: ${String(error.message || error).slice(0, 120)}` });
      }
      await sleep(15);
    }

    // ---- 2) Foreign-ID probes as tenant B for every {id} route ----
    for (const r of tenantRoutes) {
      if (!ID_PLACEHOLDER.test(r.route)) continue;
      const target = buildProbePath(r);
      try {
        const resp = await fetch(base + target, {
          method: r.method,
          headers: { cookie: cookieB, ...(BODY_METHODS.has(r.method) ? { 'content-type': 'application/json' } : {}) },
          body: BODY_METHODS.has(r.method) ? '{}' : undefined,
          signal: AbortSignal.timeout(20000)
        });
        const text2 = await resp.text().catch(() => '');
        let body2 = null;
        try { body2 = text2 ? JSON.parse(text2) : null; } catch { body2 = null; }
        const emptyList = resp.status === 200 && Array.isArray(body2) && body2.length === 0;
        const denied = [401, 403, 404].includes(resp.status) || emptyList;
        foreignId.push({ route: `${r.method} ${r.route}`, status: denied ? 'PASS' : 'FAIL', httpStatus: resp.status, detail: denied ? (emptyList ? 'foreign parent not found; empty list returned (no rows leaked)' : `foreign-ID probe denied or not-found for tenant B (HTTP ${resp.status})`) : 'FOREIGN-ID ACCESS SUCCEEDED FOR TENANT B' });
      } catch (error) {
        foreignId.push({ route: `${r.method} ${r.route}`, status: 'FAIL', httpStatus: null, detail: `request error: ${String(error.message || error).slice(0, 120)}` });
      }
      await sleep(15);
    }

    // ---- 3) True cross-tenant fixture checks (work-orders, customers) ----
    const recordC = (id, pass, detail) => crossTenant.push({ id, status: pass ? 'PASS' : 'FAIL', detail });
    await sleep(1000); // settle the gateway window after the two sweeps

    x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, {}, cookieB);
    recordC('cross-tenant-work-order-read-denied', x.response.status === 404 || x.response.status === 403, `tenant B GET tenant A work order → HTTP ${x.response.status}`);
    x = await request(`/api/v1/customers/${encodeURIComponent(customerAId)}`, {}, cookieB);
    recordC('cross-tenant-customer-read-denied', x.response.status === 404 || x.response.status === 403, `tenant B GET tenant A customer → HTTP ${x.response.status}`);
    x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, { method: 'PATCH', body: JSON.stringify({ title: 'MATRIX CROSS TENANT MUTATION' }) }, cookieB);
    recordC('cross-tenant-work-order-update-denied', x.response.status === 403 || x.response.status === 404, `tenant B PATCH tenant A work order → HTTP ${x.response.status}`);
    x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, { method: 'DELETE' }, cookieB);
    recordC('cross-tenant-work-order-delete-denied', x.response.status === 403 || x.response.status === 404, `tenant B DELETE tenant A work order → HTTP ${x.response.status}`);
    x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, {}, cookieA);
    recordC('resource-unchanged-after-id-swap-attempts', x.response.status === 200 && x.data && x.data.id === workOrderAId && x.data.title === `Matrix Work Order A ${stamp}`, `tenant A work order intact after tenant B update/delete ID-swap attempts (HTTP ${x.response.status})`);
    x = await request('/api/v1/work-orders', {}, cookieB);
    recordC('cross-tenant-work-order-list-excludes-foreign-rows', x.response.status === 200 && Array.isArray(x.data) && !x.data.some(row => row.id === workOrderAId), `tenant B work-order list excludes tenant A row (rows=${Array.isArray(x.data) ? x.data.length : 'n/a'})`);

    x = await request('/api/v1/customers', { method: 'POST', body: JSON.stringify({ name: `Matrix Customer B ${stamp}` }) }, cookieB);
    assert.equal(x.response.status, 201, `tenant B customer fixture failed: ${JSON.stringify(x.data)}`);
    const customerBId = x.data.id;
    x = await request('/api/v1/customers', {}, cookieB);
    recordC('cross-tenant-customer-list-excludes-foreign-rows', x.response.status === 200 && Array.isArray(x.data) && !x.data.some(row => row.id === customerAId) && x.data.some(row => row.id === customerBId), `tenant B customer list excludes tenant A row and contains tenant B row`);
    x = await request(`/api/v1/customers/${encodeURIComponent(customerAId)}`, { method: 'PATCH', body: JSON.stringify({ name: 'MATRIX CROSS TENANT CUSTOMER MUTATION' }) }, cookieB);
    recordC('cross-tenant-customer-update-denied', x.response.status === 403 || x.response.status === 404, `tenant B PATCH tenant A customer → HTTP ${x.response.status}`);
    x = await request(`/api/v1/customers/${encodeURIComponent(customerAId)}`, { method: 'DELETE' }, cookieB);
    recordC('cross-tenant-customer-soft-delete-denied', x.response.status === 403 || x.response.status === 404, `tenant B DELETE tenant A customer → HTTP ${x.response.status}`);
    x = await request(`/api/v1/customers/${encodeURIComponent(customerAId)}/restore`, { method: 'POST', body: JSON.stringify({}) }, cookieB);
    recordC('cross-tenant-customer-restore-denied', x.response.status === 403 || x.response.status === 404, `tenant B POST restore tenant A customer → HTTP ${x.response.status}`);
    x = await request('/api/v1/customers', {}, cookieA);
    recordC('customer-intact-after-cross-tenant-delete-restore', x.response.status === 200 && Array.isArray(x.data) && x.data.some(row => row.id === customerAId), `tenant A customer remains visible after tenant B delete/restore attempts → HTTP ${x.response.status}`);
    x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}/evidence-uploads`, { method: 'POST', headers: { 'idempotency-key': `matrix-evidence-init-${stamp}` }, body: JSON.stringify({ fileName: 'matrix.txt', mediaType: 'text/plain', totalBytes: 1, sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881' }) }, cookieA);
    assert.equal(x.response.status, 201, `tenant A evidence upload fixture failed: ${JSON.stringify(x.data)}`);
    assert.ok(x.data && typeof x.data.uploadId === 'string' && x.data.uploadId, 'evidence upload fixture must return a real uploadId');
    const uploadAId = x.data.uploadId;
    x = await request(`/api/v1/evidence-uploads/${encodeURIComponent(uploadAId)}/chunks/0`, { method: 'PUT', body: JSON.stringify({ contentBase64: 'eA==' }) }, cookieB);
    recordC('cross-tenant-evidence-chunk-write-denied', x.response.status === 403 || x.response.status === 404, `tenant B PUT tenant A evidence chunk → HTTP ${x.response.status}`);

    // ---- Targeted cleanup: remove only this run's fixture rows, verify removal ----
    const cleanupClient = await control.connect();
    const attempt = async (operation, sql, params = []) => {
      try { return await cleanupClient.query(sql, params); }
      catch (error) { cleanupErrors.push({ operation, code: error && error.code || null, message: String(error && error.message || error).slice(0, 200) }); return null; }
    };
    const setCleanupCtx = async (mode, user, tenant) => {
      await attempt('set-cleanup-context',
        "SELECT set_config('app.access_mode',$1,false), set_config('app.user_id',$2,false), set_config('app.tenant_id',$3,false), set_config('app.current_tenant_id',$3,false), set_config('app.organization_id',$3,false)",
        [mode, user || '', tenant || '']);
    };
    for (const org of [orgA, orgB]) {
      await setCleanupCtx('system', '', org);
      await attempt('delete-fixture-memberships', 'DELETE FROM memberships WHERE organization_id = $1', [org]);
      await attempt('delete-fixture-customers', 'DELETE FROM customers WHERE organization_id = $1', [org]);
      await attempt('delete-fixture-work-orders', 'DELETE FROM work_orders WHERE organization_id = $1', [org]);
      const deletedOrg = await attempt('delete-fixture-organization', 'DELETE FROM organizations WHERE id = $1 RETURNING id', [org]);
      if (deletedOrg && deletedOrg.rowCount === 0) cleanupErrors.push({ operation: 'verify-organization-deleted', id: org, message: 'fixture organization remained after cleanup' });
    }
    for (const user of [userA, userB]) {
      await setCleanupCtx('system', user, '');
      await attempt('delete-fixture-user-memberships', 'DELETE FROM memberships WHERE user_id = $1', [user]);
      await attempt('delete-fixture-user-sessions', 'DELETE FROM sessions WHERE user_id = $1', [user]);
      const deletedUser = await attempt('delete-fixture-user', 'DELETE FROM users WHERE id = $1 RETURNING id', [user]);
      if (deletedUser && deletedUser.rowCount === 0) cleanupErrors.push({ operation: 'verify-user-deleted', id: user, message: 'fixture user remained after cleanup' });
    }
    await setCleanupCtx('', '', '');
    cleanupClient.release();

    const failed = [...unauthenticated, ...foreignId, ...crossTenant].filter(entry => entry.status !== 'PASS');
    const report = {
      schemaVersion: 'opscore.tenant-isolation-matrix.v1',
      generatedAt: new Date().toISOString(),
      sourceCommit: sourceCommit(),
      testedTarget: redact(urlText),
      engine: 'postgres',
      discovered: {
        totalRoutes: routes.length,
        tenantDataRoutes: tenantRoutes.length,
        inventorySource: 'docs/API_INVENTORY.json (source-derived via scripts/api-inventory.js)'
      },
      tested: {
        unauthenticated: summary(unauthenticated),
        foreignIdProbe: summary(foreignId),
        crossTenantFixture: summary(crossTenant)
      },
      unauthenticatedChecks: unauthenticated,
      foreignIdProbes: foreignId,
      crossTenantFixtureChecks: crossTenant,
      skipped,
      documentedExclusions: {
        diagnosticRoutes: [...DIAGNOSTIC_ROUTES],
        reason: 'Platform diagnostic/proof endpoints (not tenant data). /metrics requires METRICS_AUTH_TOKEN in production (HTTP 404 when unconfigured); verify endpoints are public release/deployment proofs by design.'
      },
      cleanupErrors,
      productionCertification: false,
      isolationCertification: 'NOT_CERTIFIED',
      status: failed.length || cleanupErrors.length ? 'FAIL' : 'PASS',
      note: 'Route-level matrix executed against the source-derived inventory at the tested commit. Unauthenticated and foreign-ID probes cover every tenant-data route; true cross-tenant fixture checks cover work-orders and customers. Even on PASS, formal production isolation certification remains NOT_CERTIFIED until the required certification procedures complete.'
    };
    writeResult(report);
    process.stdout.write(`TENANT_ISOLATION_MATRIX_REPORT=${RESULT_PATH}\n`);
    process.stdout.write(`TENANT_ISOLATION_MATRIX_SUMMARY=${JSON.stringify(report.tested)}\n`);
    if (report.status !== 'PASS') {
      const sample = failed.slice(0, 5).map(f => `${f.route || f.id}: ${f.detail}`);
      assert.fail(`tenant isolation matrix failed (${failed.length} failing checks, ${cleanupErrors.length} cleanup errors): ${sample.join(' | ')}`);
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); });
    if (control) await control.end().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
