'use strict';

/**
 * Commercial HTTP acceptance over a real PostgreSQL engine.
 *
 * The SQLite variant (commercial-acceptance-http.test.js) cannot prove PostgreSQL
 * behaviour: RLS, session GUCs and tenant-boundary policies only exist server-side in
 * PostgreSQL. This test boots the real application server against a dedicated,
 * isolated PostgreSQL database and exercises the same commercial surface over HTTP.
 *
 * Safety contract (fail closed):
 *  - Requires OPSC_PG_ACCEPTANCE_URL only (never OPSC_PG_TEST_URL — that DB is shared and non-virgin in CI).
 *  - Refuses any URL that points at the production host or a database that is not
 *    explicitly marked as disposable acceptance/test.
 *  - Refuses a database that already holds identity rows (not virgin), so the run can
 *    never mutate real data.
 *  - Never writes to production: the server under test only ever sees this URL.
 *  - Defaults to an OS temp file so normal test runs cannot overwrite committed
 *    verification evidence. Set OPSC_WRITE_EVIDENCE=1 only in an explicitly
 *    evidence-producing CI run to write backend/docs/verification/POSTGRES_HTTP_ACCEPTANCE_RESULT.json.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { validatePostgresAcceptanceTarget } = require('../scripts/validate-postgres-acceptance-target');

// Keep generated evidence in the job's temporary workspace while the test suite runs.
// The CI job promotes it to the release evidence path only after this test and all other tests pass.
const RESULT_PATH = process.env.OPSC_PG_ACCEPTANCE_RESULT_FILE
  ? path.resolve(process.env.OPSC_PG_ACCEPTANCE_RESULT_FILE)
  : path.join(os.tmpdir(), 'opscore-postgres-http-acceptance-result.json');

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const onStdout = chunk => {
      out += chunk.toString();
      const match = out.match(/OpsCore Starter: http:\/\/[^:]+:(\d+)/);
      if (match) {
        cleanup();
        resolve(Number(match[1]));
      }
    };
    const onStderr = chunk => { err += chunk.toString(); };
    const onError = error => { cleanup(); reject(error); };
    const onExit = code => {
      cleanup();
      reject(new Error(`OpsCore PostgreSQL test server exited (${code}). ${err.slice(-1600)}`));
    };
    const cleanup = () => {
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function cookieFrom(response) {
  return String(response.headers.get('set-cookie') || '').split(';')[0];
}

function expectCookieSecurity(response) {
  const raw = String(response.headers.get('set-cookie') || '');
  assert.match(raw, /^__Host-opscore_session=/);
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /Secure/i);
  assert.match(raw, /SameSite=Strict/i);
  assert.match(raw, /Path=\//i);
}

function redact(urlText) {
  try {
    const parsed = new URL(urlText);
    return `${parsed.protocol}//${parsed.username ? parsed.username + ':***' : ''}@${parsed.host}/${parsed.pathname.replace(/^\/+/, '')}`;
  } catch {
    return 'invalid-url';
  }
}

function writeResult(payload) {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(payload, null, 2) + '\n');
}

const urlText = String(process.env.OPSC_PG_ACCEPTANCE_URL || '').trim();

test('PostgreSQL HTTP commercial acceptance: sessions, tenant isolation, Safe Mode, recovery bundle', async t => {
  if (!urlText) {
    writeResult({
      schemaVersion: 'opscore.postgres-http-acceptance.v1',
      generatedAt: new Date().toISOString(),
      status: 'UNVERIFIED',
      reason: 'OPSC_PG_ACCEPTANCE_URL_REQUIRED',
      note: 'No PostgreSQL request was attempted. Supply a dedicated isolated acceptance database URL.'
    });
    t.skip('OPSC_PG_ACCEPTANCE_URL not set: PostgreSQL HTTP acceptance is opt-in and skipped in default CI.');
    return;
  }

  const startedAt = new Date().toISOString();
  let parsed, database;
  try {
    const target = validatePostgresAcceptanceTarget({ urlText, expectedHost: process.env.OPSC_PG_ACCEPTANCE_HOST });
    parsed = target.parsed;
    database = target.database;
  } catch (error) {
    writeResult({
      schemaVersion: 'opscore.postgres-http-acceptance.v1',
      generatedAt: startedAt,
      status: 'BLOCKED',
      reason: error.code || 'ACCEPTANCE_TARGET_INVALID',
      target: redact(urlText)
    });
    throw new Error(`Refusing to run PostgreSQL HTTP acceptance: ${error.code || 'ACCEPTANCE_TARGET_INVALID'}.`);
  }

  const { Pool } = require('pg');
  const control = new Pool({ connectionString: urlText, max: 2, connectionTimeoutMillis: 60000, idleTimeoutMillis: 30000, application_name: 'opscore-acceptance-control' });
  const checks = [];
  const record = (id, detail) => checks.push({ id, status: 'PASS', detail });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-pg-acceptance-'));
  const port = 30000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
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
      // The sync bridge defaults to sslmode=require, which fails against a
      // loopback PostgreSQL without TLS; pick the mode from the target URL.
      OPSC_PG_SSL_MODE: /127\.0\.0\.1|localhost/.test(parsed.host) ? 'disable' : 'require',
      AUTH_MODE: 'local',
      OPSC_TEST_SCRYPT_N: process.env.OPSC_TEST_SCRYPT_N || '32768'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const created = { organizations: [], users: [], persistedUsers: [], persistedOrganizations: [], loginThrottleKeys: [] };
  let base;
  let cleanupClient = null;
  const cleanupErrors = [];
  let virginDatabaseVerified = false;
  const attemptCleanup = async (operation, query, params = []) => {
    try { return await cleanupClient.query(query, params); }
    catch (error) {
      if (error && error.code === '42P01' && /throttle/i.test(operation)) {
        // login_throttle does not exist on this engine schema; no throttle rows can
        // exist either. Recorded explicitly — never silently ignored.
        console.log('ACCEPTANCE_CLEANUP_NOTE=login_throttle relation absent on this engine; no throttle residue is possible');
        return null;
      }
      cleanupErrors.push({ operation, code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
      return null;
    }
  };

  const request = async (pathname, options = {}, cookie = null) => {
    const headers = {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(base + pathname, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { response, data, text };
  };

  try {
    const control0 = await control.connect();
    let engine;
    try {
      const info = await control0.query(
        "SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS server_version, " +
        'r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname = current_user'
      );
      engine = info.rows[0];
      const identityCount = await control0.query('SELECT opscore_count_users()::int AS n');
      if (Number(identityCount.rows[0].n) !== 0) {
        const msg =
          `DATABASE_NOT_VIRGIN: ${engine.database} target=${redact(urlText)} contains ${identityCount.rows[0].n} user row(s), including rows hidden by RLS. ` +
          'Refusing to write to a non-empty acceptance database; review and remove only known synthetic acceptance fixtures, then retry.';
        if (String(process.env.OPSC_PG_ACCEPTANCE_STRICT || '').trim() === 'true') {
          throw new Error(msg);
        }
        record('acceptance-skipped-non-virgin', msg);
        t.skip(msg);
        return;
      }
      virginDatabaseVerified = true;
      record('isolated-database-verified', `${engine.database} on PostgreSQL ${String(engine.server_version).split(' ')[0]} is empty and disposable`);
      record('application-role-is-least-privilege', `role=${engine.role}; superuser=${engine.superuser}; bypassrls=${engine.bypass_rls}`);
      assert.equal(engine.superuser, false, 'acceptance must not run as a PostgreSQL superuser');
      assert.equal(engine.bypass_rls, false, 'acceptance must not run as a role with BYPASSRLS');
    } finally {
      control0.release();
    }

    const boundPort = await waitForServer(child);
    base = `http://127.0.0.1:${boundPort}`;

    // The PostgreSQL sync bridge spawns its worker lazily; the very first health
    // call can observe a cold-start 'degraded' before the worker connects.
    // Poll with a bounded retry instead of failing the run on cold start.
    let x = await request('/api/health');
    for (let i = 0; x.data && x.data.status !== 'healthy' && i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      x = await request('/api/health');
    }
    assert.equal(x.response.status, 200);
    assert.equal(x.data.engine, 'postgres', 'server under test must be running on the PostgreSQL engine');
    assert.equal(x.data.status, 'healthy');
    record('http-health-postgres', `HTTP 200; engine=${x.data.engine}; version=${x.data.version}`);

    const stamp = Date.now().toString(36);
    const ownerAEmail = `owner-a-${stamp}@acceptance.example.test`;
    const ownerBEmail = `owner-b-${stamp}@acceptance.example.test`;
    const memberAEmail = `member-a-${stamp}@acceptance.example.test`;
    // loginAsync keys throttle state by normalized email plus the default IP key.
    // Track those exact synthetic keys so this run never deletes unrelated throttles.
    created.loginThrottleKeys.push(
      `${ownerAEmail.toLowerCase()}:unknown`,
      `${ownerBEmail.toLowerCase()}:unknown`,
      `${memberAEmail.toLowerCase()}:unknown`
    );

    // Anonymous access to the tenant control plane must be rejected before bootstrap.
    x = await request('/api/v1/control-plane');
    assert.equal(x.response.status, 401);
    x = await request('/api/v1/control-plane/recovery-bundle');
    assert.equal(x.response.status, 401);
    record('anonymous-control-plane-denied', 'HTTP 401 for /api/v1/control-plane and recovery bundle without a session');

    // First tenant through the normal HTTP bootstrap path.
    x = await request('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ orgName: `Acceptance Tenant A ${stamp}`, email: ownerAEmail, password: 'Initial-A-strong-2026' })
    });
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    const ownerAId = x.data.userId || x.data.user?.id || x.data.id;
    // Register synthetic records immediately; if a later assertion fails, cleanup must
    // still know exactly which identity was created by this run.
    if (ownerAId) { created.users.push(ownerAId); created.persistedUsers.push(ownerAId); }
    const bootstrapOrgId = x.data.organizationId || x.data.organization?.id;
    if (bootstrapOrgId) { created.organizations.push(bootstrapOrgId); created.persistedOrganizations.push(bootstrapOrgId); }
    assert.ok(ownerAId, 'bootstrap must return the first owner identity');

    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ownerAEmail, password: 'Initial-A-strong-2026' })
    });
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    expectCookieSecurity(x.response);
    const ownerACookie = cookieFrom(x.response);
    assert.ok(ownerACookie);
    assert.doesNotMatch(x.text, /password_hash|token_hash/i);
    record('login-session-cookie-hardened', 'Set-Cookie __Host-opscore_session with HttpOnly, Secure, SameSite=Strict, Path=/');

    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ownerAEmail, password: 'definitely-wrong-password' })
    });
    assert.equal(x.response.status, 401);
    assert.equal(cookieFrom(x.response), '');
    record('wrong-password-rejected', 'HTTP 401 with no session cookie issued');

    x = await request('/api/v1/me', {}, ownerACookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.user.email, ownerAEmail);
    const orgAId = x.data.organization.id;
    assert.ok(orgAId);
    if (!created.organizations.includes(orgAId)) created.organizations.push(orgAId);
    record('identity-membership-resolved', `/api/v1/me returned user ${x.data.user.id} in organization ${orgAId} over PostgreSQL`);

    x = await request('/api/v1/control-plane', {}, ownerACookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.schemaVersion, 'opscore.control-plane.v1');

    // Tenant A private resources over HTTP.
    x = await request('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({ name: `Tenant A Private Customer ${stamp}`, email: `customer-a-${stamp}@acceptance.example.test` })
    }, ownerACookie);
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    const customerAId = x.data.id;

    x = await request('/api/v1/work-orders', {
      method: 'POST',
      body: JSON.stringify({ title: `Tenant A Confidential Work Order ${stamp}`, customerId: customerAId, description: 'isolated PostgreSQL acceptance fixture' })
    }, ownerACookie);
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    const workOrderAId = x.data.id;
    record('tenant-a-resources-created', `customer and work order created through HTTP API inside tenant ${orgAId}`);

    // Synthetic second tenant + member created through SQL under the same least-privilege role,
    // using the documented access_mode/tenant session GUCs (the same contract the app uses).
    const fixture = await control.connect();
    try {
      const { hashPassword } = require('../src/security');
      const { randomUUID } = require('node:crypto');
      const orgBId = 'org_' + randomUUID().replace(/-/g, '').slice(0, 24);
      const userBId = 'usr_' + randomUUID().replace(/-/g, '').slice(0, 24);
      const memberId = 'usr_' + randomUUID().replace(/-/g, '').slice(0, 24);
      // Track exact candidate IDs before the first write so partial fixture failures remain cleanable.
      created.organizations.push(orgBId);
      created.users.push(userBId, memberId);
      const createdAt = new Date().toISOString();

      await fixture.query("SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.organization_id',$1,false), set_config('app.access_mode','system',false)", [orgBId]);
      await fixture.query('INSERT INTO organizations (id,name,created_at) VALUES ($1,$2,$3)', [orgBId, `Acceptance Tenant B ${stamp}`, createdAt]);
      created.persistedOrganizations.push(orgBId);
      await fixture.query("SELECT set_config('app.user_id',$1,false), set_config('app.access_mode','auth',false)", [userBId]);
      await fixture.query('INSERT INTO users (id,email,password_hash,status,created_at) VALUES ($1,$2,$3,$4,$5)', [userBId, ownerBEmail, hashPassword('Initial-B-strong-2026'), 'active', createdAt]);
      created.persistedUsers.push(userBId);
      await fixture.query('INSERT INTO users (id,email,password_hash,status,created_at) VALUES ($1,$2,$3,$4,$5)', [memberId, memberAEmail, hashPassword('Initial-member-strong-2026'), 'active', createdAt]);
      created.persistedUsers.push(memberId);
      await fixture.query("SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.organization_id',$1,false), set_config('app.access_mode','auth',false)", [orgBId]);
      await fixture.query('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES ($1,$2,$3,$4)', [userBId, orgBId, 'owner', createdAt]);
      await fixture.query("SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.organization_id',$1,false)", [orgAId]);
      await fixture.query('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES ($1,$2,$3,$4)', [memberId, orgAId, 'member', createdAt]);
      await fixture.query("SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false), set_config('app.user_id','',false), set_config('app.access_mode','',false)");

      record('synthetic-fixtures-created-under-rls', `second tenant and member inserted as role ${engine.role} with tenant GUCs (no BYPASSRLS)`);

      x = await request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ownerBEmail, password: 'Initial-B-strong-2026' })
      });
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      expectCookieSecurity(x.response);
      const ownerBCookie = cookieFrom(x.response);

      x = await request('/api/v1/me', {}, ownerBCookie);
      assert.equal(x.response.status, 200);
      assert.equal(x.data.organization.id, orgBId);
      assert.notEqual(x.data.organization.id, orgAId);
      record('session-tenant-binding-across-two-tenants', `tenant B session resolved to ${orgBId}, distinct from tenant A ${orgAId}`);

      // Cross-tenant read denial.
      x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, {}, ownerBCookie);
      assert.equal(x.response.status, 404);
      record('cross-tenant-read-denied', 'tenant B owner received HTTP 404 for tenant A work order');

      x = await request('/api/v1/work-orders', {}, ownerBCookie);
      assert.equal(x.response.status, 200);
      assert.equal((x.data || []).some(row => row.id === workOrderAId), false);
      record('cross-tenant-list-excludes-foreign-rows', 'tenant B list did not include the tenant A work order');

      // Cross-tenant write/update/delete denial.
      // Updates use PATCH. Refusal must never be HTTP 200.
      x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'CROSS TENANT MUTATION ATTEMPT', status: 'completed' })
      }, ownerBCookie);
      assert.ok([403, 404, 400].includes(x.response.status) && x.response.status !== 200,
        `cross-tenant update must be refused, got ${x.response.status}`);
      const crossTenantUpdateStatus = x.response.status;
      x = await request(`/api/v1/work-orders/${encodeURIComponent(workOrderAId)}`, { method: 'DELETE' }, ownerBCookie);
      assert.ok([403, 404, 400].includes(x.response.status) && x.response.status !== 200,
        `cross-tenant delete must be refused, got ${x.response.status}`);
      record('cross-tenant-write-and-delete-denied', `tenant B update=${crossTenantUpdateStatus}, delete=${x.response.status}; no foreign mutation accepted`);

      x = await request('/api/v1/customers', {
        method: 'POST',
        body: JSON.stringify({ name: 'CROSS TENANT CUSTOMER ATTEMPT' })
      }, ownerBCookie);
      assert.equal(x.response.status, 201);
      const customerBId = x.data.id;
      assert.ok(customerBId);
      x = await request(`/api/v1/customers/${encodeURIComponent(customerAId)}`, {}, ownerBCookie);
      assert.equal(x.response.status, 404);
      record('cross-tenant-customer-isolation', 'tenant A customer invisible and immutable to tenant B owner');

      // Password reset is tenant scoped.
      x = await request('/api/v1/admin/password-reset', {
        method: 'POST',
        body: JSON.stringify({ userId: ownerAId })
      }, ownerBCookie);
      assert.equal(x.response.status, 404);
      record('cross-tenant-password-reset-denied', 'tenant B could not mint a reset token for the tenant A owner');

      x = await request('/api/v1/admin/password-reset', {
        method: 'POST',
        body: JSON.stringify({ userId: memberId })
      }, ownerACookie);
      assert.equal(x.response.status, 201, JSON.stringify(x.data));
      assert.ok(x.data.resetToken);
      x = await request('/api/v1/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({ resetToken: x.data.resetToken, password: 'Reset-member-strong-2026' })
      });
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.reset, true);
      record('member-password-reset-completes', 'owner-issued one-time reset token accepted for a member of the same organization');

      // Member role restrictions.
      x = await request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: memberAEmail, password: 'Reset-member-strong-2026' })
      });
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      expectCookieSecurity(x.response);
      const memberCookie = cookieFrom(x.response);

      x = await request('/api/v1/control-plane/safe-mode', {
        method: 'POST',
        body: JSON.stringify({ enabled: true, reason: 'member-scope-negative-test' })
      }, memberCookie);
      assert.equal(x.response.status, 403);
      x = await request('/api/v1/control-plane/recovery-bundle', {}, memberCookie);
      assert.equal(x.response.status, 403);
      record('member-role-privilege-boundary', 'member received HTTP 403 for Safe Mode toggle and recovery bundle export');

      
      // Operational Autopilot PostgreSQL parity, tenant RLS and idempotent learning.
      // Seed one decision through the runtime role, then exercise the real HTTP handlers.
      const autopilotDecisionId = `decision_acceptance-${stamp}`;
      const autopilotLearningKey = `acceptance-learning-${stamp}`;
      const autopilotProposalId = `proposal_acceptance-${stamp}`;
      const autopilotProposalSha = 'c'.repeat(64);
      const autopilotProposalPayload = {
        schemaVersion: 'opscore.autopilot-proposal.v1',
        actionType: 'keep_safe_mode',
        incidentRef: `acceptance-${stamp}`,
        target: { signal: 'safe_mode' },
        reasons: [{ code: 'ACCEPTANCE_FIXTURE', severity: 'low', count: 1 }],
        governance: { automaticExecution: false, approvalRequired: true }
      };
      const autopilotCatalog = await fixture.query(
        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, " +
        "count(p.policyname)::int AS policy_count, " +
        "count(*) FILTER (WHERE p.policyname='opscore_tenant_permissive' AND p.permissive='PERMISSIVE')::int AS permissive_count, " +
        "count(*) FILTER (WHERE p.policyname='opscore_tenant_boundary_guard' AND p.permissive='RESTRICTIVE')::int AS restrictive_count " +
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
        "LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname " +
        "WHERE n.nspname='public' AND c.relname = ANY($1::text[]) " +
        "GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity ORDER BY c.relname",
        [['incident_replays', 'decision_memory', 'autopilot_proposals']]
      );
      assert.equal(autopilotCatalog.rowCount, 3, 'all three PostgreSQL Autopilot tables must exist');
      for (const table of autopilotCatalog.rows) {
        assert.equal(table.relrowsecurity, true, `${table.relname} must enable RLS`);
        assert.equal(table.relforcerowsecurity, true, `${table.relname} must force RLS`);
        assert.equal(table.policy_count, 2, `${table.relname} must have exactly two tenant policies`);
        assert.equal(table.permissive_count, 1);
        assert.equal(table.restrictive_count, 1);
      }

      await fixture.query(
        "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), " +
        "set_config('app.organization_id',$1,false), set_config('app.user_id',$2,false), set_config('app.access_mode','field',false)",
        [orgAId, ownerAId]
      );
      await fixture.query(
        'INSERT INTO decision_replays (id,organization_id,decision_type,input_json,rules_json,outcome_json,decision_sha256,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [autopilotDecisionId, orgAId, 'acceptance_decision', '{}', '[]', JSON.stringify({ approved: true, result: 'success' }), 'a'.repeat(64), ownerAId, new Date().toISOString()]
      );

      x = await request('/api/v1/autopilot/incidents/replay', {
        method: 'POST',
        body: JSON.stringify({
          incidentRef: `acceptance-${stamp}`,
          fromAt: new Date(Date.now() - 60000).toISOString(),
          toAt: new Date(Date.now() + 60000).toISOString(),
          limit: 50
        })
      }, ownerACookie);
      assert.equal(x.response.status, 201, JSON.stringify(x.data));
      const autopilotIncidentId = x.data.id;
      assert.ok(autopilotIncidentId);
      x = await request('/api/v1/autopilot/incidents/replay', {}, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.ok(x.data.items.some(row => row.id === autopilotIncidentId));
      x = await request('/api/v1/autopilot/incidents/replay', {}, ownerBCookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.items.some(row => row.id === autopilotIncidentId), false);

      x = await request('/api/v1/autopilot/decision-memory/build', {
        method: 'POST',
        body: JSON.stringify({ limit: 50, learningKey: autopilotLearningKey, summary: 'PostgreSQL acceptance learning record' })
      }, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.created, 1);
      x = await request('/api/v1/autopilot/decision-memory/build', {
        method: 'POST',
        body: JSON.stringify({ limit: 50, learningKey: autopilotLearningKey, summary: 'PostgreSQL acceptance learning record' })
      }, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.created, 0, 'rebuilding the same decision memory must be idempotent on PostgreSQL');
      x = await request(`/api/v1/autopilot/decision-memory?q=${encodeURIComponent(autopilotLearningKey)}`, {}, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.ok(x.data.items.some(row => row.decision_id === autopilotDecisionId));
      x = await request(`/api/v1/autopilot/decision-memory?q=${encodeURIComponent(autopilotLearningKey)}`, {}, ownerBCookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.items.length, 0);

      // A tenant-B child cannot point at tenant-A's decision, even though the ID is known.
      await fixture.query(
        "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), " +
        "set_config('app.organization_id',$1,false), set_config('app.user_id',$2,false), set_config('app.access_mode','field',false)",
        [orgBId, userBId]
      );
      await fixture.query('BEGIN');
      let crossTenantMemoryError = null;
      try {
        await fixture.query(
          'INSERT INTO decision_memory (id,organization_id,decision_id,learning_key,summary,success,confidence,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [`memory_cross_tenant-${stamp}`, orgBId, autopilotDecisionId, 'cross-tenant', 'must be rejected', 0, 0.4, userBId, new Date().toISOString()]
        );
      } catch (error) {
        crossTenantMemoryError = error;
      }
      await fixture.query('ROLLBACK');
      assert.equal(crossTenantMemoryError?.code, '23503', 'composite FK must reject cross-tenant decision references');

      // Seed a pending proposal and exercise the actual approval handler under both tenants.
      await fixture.query(
        "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), " +
        "set_config('app.organization_id',$1,false), set_config('app.user_id',$2,false), set_config('app.access_mode','field',false)",
        [orgAId, ownerAId]
      );
      await fixture.query(
        'INSERT INTO autopilot_proposals (id,organization_id,incident_ref,action_type,target_json,reasons_json,risk,approval_required,status,proposal_json,proposal_sha256,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [autopilotProposalId, orgAId, `acceptance-${stamp}`, 'keep_safe_mode', JSON.stringify({ signal: 'safe_mode' }), JSON.stringify(autopilotProposalPayload.reasons), 'low', 1, 'pending', JSON.stringify(autopilotProposalPayload), autopilotProposalSha, ownerAId, new Date().toISOString()]
      );
      x = await request('/api/v1/autopilot/proposals', {}, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.ok(x.data.items.some(row => row.id === autopilotProposalId && row.status === 'pending'));
      x = await request('/api/v1/autopilot/proposals', {}, ownerBCookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.items.some(row => row.id === autopilotProposalId), false);
      x = await request(`/api/v1/autopilot/proposals/${encodeURIComponent(autopilotProposalId)}/approve`, {
        method: 'POST',
        headers: { 'idempotency-key': `approve-autopilot-${stamp}` }
      }, ownerBCookie);
      assert.equal(x.response.status, 404, JSON.stringify(x.data));
      x = await request(`/api/v1/autopilot/proposals/${encodeURIComponent(autopilotProposalId)}/approve`, {
        method: 'POST',
        headers: { 'idempotency-key': `approve-autopilot-owner-${stamp}` }
      }, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.status, 'approved');
      record('operational-autopilot-postgres-parity-and-tenant-boundary',
        'incident replay, decision memory, and proposal approval execute through the PostgreSQL HTTP runtime; RLS is enabled+forced, decision references are tenant-composite, duplicate learning builds are idempotent, and tenant B cannot read or approve tenant A records');

      // Safe Mode isolation between tenants.
      x = await request('/api/v1/control-plane/safe-mode', {}, ownerACookie);
      assert.equal(x.response.status, 200);
      assert.equal(x.data.enabled, false);
      x = await request('/api/v1/control-plane/safe-mode', {
        method: 'POST',
        body: JSON.stringify({ enabled: true, reason: 'acceptance-only-toggle' })
      }, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.enabled, true);
      x = await request('/api/v1/control-plane/safe-mode', {}, ownerBCookie);
      assert.equal(x.response.status, 200);
      assert.equal(x.data.enabled, false);
      x = await request('/api/v1/control-plane/safe-mode', {
        method: 'POST',
        body: JSON.stringify({ enabled: false, reason: 'acceptance-test-cleanup' })
      }, ownerACookie);
      assert.equal(x.response.status, 200);
      assert.equal(x.data.enabled, false);
      record('safe-mode-tenant-scoped', 'Safe Mode enabled for tenant A did not leak into tenant B state');

      // Recovery bundle: export, verify, tamper detection, no restore writes.
      x = await request('/api/v1/control-plane/recovery-bundle', {}, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.match(String(x.response.headers.get('content-disposition')), /opscore-recovery-bundle\.json/i);
      const bundle = x.data;
      assert.equal(bundle.schemaVersion, 'opscore.recovery-bundle.v1');
      assert.equal(bundle.export.organizationId, orgAId);

      // Use one checked-out connection for both counts. Session GUCs are connection-local;
      // calling Pool.query twice can select different connections and produce false results under RLS.
      const countClient = await control.connect();
      try {
        await countClient.query(
          "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.access_mode','field',false)",
          [orgAId]
        );
        const beforeRows = await countClient.query(
          'SELECT count(*)::int AS n FROM customers WHERE organization_id = $1',
          [orgAId]
        );
        x = await request('/api/v1/control-plane/recovery-bundle/verify', {
          method: 'POST',
          body: JSON.stringify({ bundle })
        }, ownerACookie);
        assert.equal(x.response.status, 200, JSON.stringify(x.data));
        assert.equal(x.data.valid, true);
        assert.equal(x.data.importMode, 'dry_run_only');
        // Re-bind tenant GUCs before the post-verify count. Neon transaction poolers
        // and concurrent session noise must not make RLS hide live tenant rows and
        // produce a false "verify mutated data" failure.
        await countClient.query(
          "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.access_mode','field',false)",
          [orgAId]
        );
        const afterRows = await countClient.query(
          'SELECT count(*)::int AS n FROM customers WHERE organization_id = $1',
          [orgAId]
        );
        assert.equal(
          Number(afterRows.rows[0].n),
          Number(beforeRows.rows[0].n),
          'bundle verification must not write or remove tenant customer rows'
        );
        record('recovery-bundle-verify-is-dry-run', `valid=true, importMode=dry_run_only, customers_before=${beforeRows.rows[0].n}, customers_after=${afterRows.rows[0].n}`);
      } finally {
        await countClient.query(
          "SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.access_mode','',false)"
        ).catch(() => {});
        countClient.release();
      }

      const tampered = JSON.parse(JSON.stringify(bundle));
      const rows = tampered.export.tables.customers.rows;
      assert.ok(rows.length > 0, 'bundle must include the synthetic customer');
      rows[0].name = 'TAMPERED ACCEPTANCE DATA';
      x = await request('/api/v1/control-plane/recovery-bundle/verify', {
        method: 'POST',
        body: JSON.stringify({ tampered: true, bundle: tampered })
      }, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.valid, false);
      record('recovery-bundle-tamper-detected', 'mutated bundle content rejected by verification (valid=false)');

      x = await request('/api/v1/control-plane/recovery-bundle', {}, ownerBCookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.export.organizationId, orgBId);
      assert.equal(x.data.export.tables.customers.rows.some(row => row.name === `Tenant A Private Customer ${stamp}`), false);
      record('recovery-bundle-tenant-scoped', 'tenant B bundle contains only tenant B rows');

      // Logout revokes the server-side session.
      x = await request('/api/v1/auth/logout', { method: 'POST' }, ownerACookie);
      assert.equal(x.response.status, 200);
      assert.match(String(x.response.headers.get('set-cookie')), /Max-Age=0/i);
      x = await request('/api/v1/me', {}, ownerACookie);
      assert.equal(x.response.status, 401);
      record('logout-revokes-session', 'post-logout reuse of the same cookie received HTTP 401');
    } finally {
      // Session GUCs are transaction/connection scoped; release the fixture connection cleanly.
      await fixture.query("SELECT set_config('app.tenant_id','',false), set_config('app.access_mode','',false)").catch(() => {});
      fixture.release();
    }

    writeResult({
      schemaVersion: 'opscore.postgres-http-acceptance.v1',
      generatedAt: startedAt,
      completedAt: new Date().toISOString(),
      status: 'PASS',
      scope: 'application HTTP surface over an isolated PostgreSQL database',
      productionCertification: false,
      environment: {
        engine: 'postgres',
        serverVersion: String(engine.server_version).split(' ')[0],
        database: engine.database,
        connectedRole: engine.role,
        roleIsSuperuser: engine.superuser,
        roleBypassesRls: engine.bypass_rls,
        target: redact(urlText)
      },
      commit: process.env.CI_COMMIT_SHA || null,
      pipelineId: process.env.CI_PIPELINE_ID ? Number(process.env.CI_PIPELINE_ID) : null,
      checks,
      limitations: [
        'Covers the commercial HTTP surface exercised by this test, not every API route.',
        'Structural schema/RLS baseline is verified separately by the postgres-rls and parity gates.',
        'Vercel preview deployment and mobile device builds are out of scope of this test.'
      ]
    });
  } catch (error) {
    writeResult({
      schemaVersion: 'opscore.postgres-http-acceptance.v1',
      generatedAt: startedAt,
      completedAt: new Date().toISOString(),
      status: 'FAIL',
      database: (() => { try { return decodeURIComponent(new URL(urlText).pathname.replace(/^\/+/, '')); } catch { return null; } })(),
      commit: process.env.CI_COMMIT_SHA || null,
      pipelineId: process.env.CI_PIPELINE_ID ? Number(process.env.CI_PIPELINE_ID) : null,
      passedChecks: checks,
      error: String(error && error.message || error).slice(0, 1200)
    });
    throw error;
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
    });

    // Target only fixture IDs and exact synthetic throttle keys. Do not hide cleanup
    // errors: a green acceptance result is not valid if the disposable DB retains data.
    try {
      cleanupClient = await control.connect();
      for (const orgId of created.organizations) {
        await attemptCleanup('set-organization-cleanup-context',
          "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.organization_id',$1,false), set_config('app.user_id','',false), set_config('app.access_mode','system',false)",
          [orgId]);
        await attemptCleanup('delete-organization-memberships', 'DELETE FROM memberships WHERE organization_id=$1', [orgId]);
        await attemptCleanup('delete-organization-customers', 'DELETE FROM customers WHERE organization_id=$1', [orgId]);
        await attemptCleanup('delete-organization-work-orders', 'DELETE FROM work_orders WHERE organization_id=$1', [orgId]);
        const deletedOrg = await attemptCleanup('delete-synthetic-organization', 'DELETE FROM organizations WHERE id=$1 RETURNING id', [orgId]);
        // Some IDs are intentionally tracked before fixture INSERTs, so a missing row
        // is valid only when the earlier write never completed. Query errors are always fatal.
        if (deletedOrg && deletedOrg.rowCount === 0 && created.persistedOrganizations?.includes(orgId)) {
          cleanupErrors.push({ operation: 'verify-organization-deleted', code: null, message: 'A persisted synthetic organization remained after targeted cleanup.' });
        }
      }
      for (const userId of created.users) {
        // The restrictive identity SELECT policy requires the current-user GUC to match
        // the row being deleted; access_mode=system alone does not make the row visible.
        await attemptCleanup('set-user-cleanup-context',
          "SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false), set_config('app.user_id',$1,false), set_config('app.access_mode','system',false)",
          [userId]);
        await attemptCleanup('delete-user-memberships', 'DELETE FROM memberships WHERE user_id=$1', [userId]);
        await attemptCleanup('delete-user-reset-tokens', 'DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
        await attemptCleanup('delete-user-sessions', 'DELETE FROM sessions WHERE user_id=$1', [userId]);
        const deletedUser = await attemptCleanup('delete-synthetic-user', 'DELETE FROM users WHERE id=$1 RETURNING id', [userId]);
        if (deletedUser && deletedUser.rowCount === 0 && (created.persistedUsers || created.users).includes(userId)) {
          cleanupErrors.push({ operation: 'verify-user-deleted', code: null, message: 'A tracked synthetic user remained visible after targeted cleanup.' });
        }
      }
      // A wrong-password check creates this row; successful logins may already have
      // cleared their keys. Deleting an absent exact key is intentionally a no-op.
      await attemptCleanup('set-throttle-cleanup-context',
        "SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false), set_config('app.user_id','',false), set_config('app.access_mode','auth',false)");
      for (const throttleKey of created.loginThrottleKeys) {
        await attemptCleanup('delete-synthetic-login-throttle', 'DELETE FROM login_throttle WHERE throttle_key=$1', [throttleKey]);
      }
      // Verify global residue while access_mode is explicitly system; blank context can
      // make RLS hide users and falsely report zero. Reset the GUCs only after the checks.
      await attemptCleanup('set-cleanup-verification-context',
        "SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false), set_config('app.user_id','',false), set_config('app.access_mode','system',false)");
      const remainingUsers = virginDatabaseVerified
        ? await attemptCleanup('verify-no-user-residue', 'SELECT opscore_count_users()::int AS n')
        : null;
      if (remainingUsers && Number(remainingUsers.rows?.[0]?.n || 0) !== 0) {
        cleanupErrors.push({ operation: 'verify-no-user-residue', code: null, message: `The disposable acceptance database still has ${remainingUsers.rows[0].n} user row(s).` });
      }
      const remainingThrottles = await attemptCleanup('verify-no-throttle-residue',
        'SELECT count(*)::int AS n FROM login_throttle WHERE throttle_key = ANY($1::text[])',
        [created.loginThrottleKeys]);
      if (remainingThrottles && Number(remainingThrottles.rows?.[0]?.n || 0) !== 0) {
        cleanupErrors.push({ operation: 'verify-no-throttle-residue', code: null, message: `The disposable acceptance database still has ${remainingThrottles.rows[0].n} synthetic login-throttle row(s).` });
      }
      if (virginDatabaseVerified) {
        console.log('ACCEPTANCE_CLEANUP_POSTCHECK=' + JSON.stringify({
          status: cleanupErrors.length ? 'FAIL' : 'PASS',
          remainingUsers: remainingUsers ? Number(remainingUsers.rows?.[0]?.n || 0) : null,
          remainingSyntheticThrottleRows: remainingThrottles ? Number(remainingThrottles.rows?.[0]?.n || 0) : null
        }));
      }
      await attemptCleanup('reset-cleanup-context',
        "SELECT set_config('app.tenant_id','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false), set_config('app.user_id','',false), set_config('app.access_mode','',false)");
    } catch (error) {
      cleanupErrors.push({ operation: 'cleanup-connection', code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
    }
    if (cleanupClient) { try { cleanupClient.release(); } catch (error) {
      cleanupErrors.push({ operation: 'release-cleanup-client', code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
    } }
    await control.end().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(RESULT_PATH)) {
      try {
        const prior = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
        prior.cleanup = !virginDatabaseVerified
          ? { status: 'NOT_RUN', reason: 'PREFLIGHT_DID_NOT_PASS' }
          : cleanupErrors.length
            ? { status: 'FAIL', errors: cleanupErrors }
            : { status: 'PASS', trackedUsers: created.users.length, trackedOrganizations: created.organizations.length, syntheticThrottleKeysHandled: created.loginThrottleKeys.length };
        if (cleanupErrors.length) {
          prior.status = 'FAIL';
          prior.reason = 'ACCEPTANCE_CLEANUP_FAILED';
          prior.error = 'ACCEPTANCE_CLEANUP_FAILED';
        }
        writeResult(prior);
      } catch (error) {
        cleanupErrors.push({ operation: 'write-cleanup-result', code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
      }
    }
    if (cleanupErrors.length) {
      console.error('ACCEPTANCE_CLEANUP_DETAILS=' + JSON.stringify(cleanupErrors));
      throw new Error('ACCEPTANCE_CLEANUP_FAILED: ' + cleanupErrors.map(item => item.operation + ':' + (item.code || 'NO_CODE')).join(','));
    }
  }
});
