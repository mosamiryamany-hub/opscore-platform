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
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const { bindSignedRlsSessionContext, clearSignedRlsSessionContext } = require('../src/signed-tenant-context');
const { validatePostgresAcceptanceTarget } = require('../scripts/validate-postgres-acceptance-target');
const { randomUUID } = require('node:crypto');

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

  // A separate exact-target bootstrap URL is accepted only for deleting this run's
  // synthetic fixtures. HTTP routes and all acceptance assertions stay on runtime.
  const cleanupUrlText = String(process.env.OPSC_PG_ACCEPTANCE_CLEANUP_URL || '').trim();
  const cleanupRoleName = String(process.env.OPSC_PG_ACCEPTANCE_CLEANUP_ROLE || '').trim();
  const allowedCleanupRoles = ['opscore_owner', 'neondb_owner'];
  let cleanupPool = null;
  let cleanupUsesPrivilegedRole = false;
  if (cleanupUrlText) {
    let cleanupTarget;
    try {
      cleanupTarget = validatePostgresAcceptanceTarget({
        urlText: cleanupUrlText,
        expectedHost: process.env.OPSC_PG_ACCEPTANCE_CLEANUP_HOST || process.env.OPSC_PG_ACCEPTANCE_HOST
      });
    } catch (error) {
      await control.end().catch(() => {});
      throw new Error('ACCEPTANCE_CLEANUP_TARGET_INVALID:' + (error.code || 'INVALID_TARGET'));
    }
    if (!allowedCleanupRoles.includes(cleanupRoleName)
        || cleanupTarget.database !== database
        || cleanupTarget.hostname !== parsed.hostname
        || decodeURIComponent(cleanupTarget.parsed.username) !== cleanupRoleName) {
      await control.end().catch(() => {});
      throw new Error('ACCEPTANCE_CLEANUP_TARGET_IDENTITY_MISMATCH');
    }
    cleanupPool = new Pool({
      connectionString: cleanupUrlText,
      max: 1,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
      application_name: 'opscore-acceptance-targeted-cleanup'
    });
    const cleanupProbe = await cleanupPool.connect();
    try {
      const identity = (await cleanupProbe.query(
        "SELECT current_database() AS database,current_user AS role,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname=current_user"
      )).rows[0];
      if (!identity
          || identity.database !== database
          || identity.role !== cleanupRoleName
          || !allowedCleanupRoles.includes(identity.role)
          || identity.superuser !== false
          || identity.bypass_rls !== true) {
        throw new Error('ACCEPTANCE_CLEANUP_ROLE_CONTRACT_FAILED');
      }
      cleanupUsesPrivilegedRole = true;
    } catch (error) {
      cleanupProbe.release();
      await cleanupPool.end().catch(() => {});
      await control.end().catch(() => {});
      throw error;
    }
    cleanupProbe.release();
  } else if (String(process.env.OPSC_PG_ACCEPTANCE_STRICT || '').trim() === 'true') {
    await control.end().catch(() => {});
    throw new Error('OPSC_PG_ACCEPTANCE_CLEANUP_URL_REQUIRED');
  }

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
      OPSC_TEST_SCRYPT_N: process.env.OPSC_TEST_SCRYPT_N || '32768',
      VERCEL_ENV: 'preview',
      OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'true',
      OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
      OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const created = { organizations: [], users: [], persistedUsers: [], persistedOrganizations: [], loginThrottleKeys: [], spatialFeatureIds: [] };
  let base;
  let browserProxy = null;
  let base2 = null;
  let child2 = null;
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

  const requestAt = async (origin, pathname, options = {}, cookie = null) => {
    const headers = {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(origin + pathname, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { response, data, text };
  };
  const request = (pathname, options = {}, cookie = null) => requestAt(base, pathname, options, cookie);

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
    created.scalePrefix = 'scale-' + stamp + '-';
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

      await bindSignedRlsSessionContext(fixture, { tenantId: orgBId, accessMode: 'system' });
      await fixture.query('INSERT INTO organizations (id,name,created_at) VALUES ($1,$2,$3)', [orgBId, `Acceptance Tenant B ${stamp}`, createdAt]);
      created.persistedOrganizations.push(orgBId);
      await bindSignedRlsSessionContext(fixture, { tenantId: orgBId, userId: userBId, accessMode: 'system' });
      await fixture.query('INSERT INTO users (id,email,password_hash,status,created_at) VALUES ($1,$2,$3,$4,$5)', [userBId, ownerBEmail, hashPassword('Initial-B-strong-2026'), 'active', createdAt]);
      created.persistedUsers.push(userBId);
      await fixture.query('INSERT INTO users (id,email,password_hash,status,created_at) VALUES ($1,$2,$3,$4,$5)', [memberId, memberAEmail, hashPassword('Initial-member-strong-2026'), 'active', createdAt]);
      created.persistedUsers.push(memberId);
      await fixture.query('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES ($1,$2,$3,$4)', [userBId, orgBId, 'owner', createdAt]);
      await bindSignedRlsSessionContext(fixture, { tenantId: orgAId, userId: memberId, accessMode: 'system' });
      await fixture.query('INSERT INTO memberships (user_id,organization_id,role,created_at) VALUES ($1,$2,$3,$4)', [memberId, orgAId, 'member', createdAt]);
      await clearSignedRlsSessionContext(fixture);

      record('synthetic-fixtures-created-under-rls', `second tenant and member inserted as role ${engine.role} with purpose-bound signed contexts (no BYPASSRLS)`);

      x = await request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: ownerBEmail, password: 'Initial-B-strong-2026' })
      });
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      expectCookieSecurity(x.response);
      const ownerBCookie = cookieFrom(x.response);

      // Resolve each live session only inside its own signed auth tenant context.
      await bindSignedRlsSessionContext(fixture, {
        tenantId: orgAId, userId: ownerAId, accessMode: 'auth'
      });
      const ownerASession = await fixture.query(
        "SELECT id FROM sessions WHERE user_id=$1 AND organization_id=$2 AND expires_at::timestamptz > now() ORDER BY created_at DESC LIMIT 1",
        [ownerAId, orgAId]
      );
      assert.equal(ownerASession.rowCount, 1, 'tenant A live session must exist');
      const ownerASessionId = ownerASession.rows[0].id;

      await bindSignedRlsSessionContext(fixture, {
        tenantId: orgBId, userId: userBId, accessMode: 'auth'
      });
      const ownerBSession = await fixture.query(
        "SELECT id FROM sessions WHERE user_id=$1 AND organization_id=$2 AND expires_at::timestamptz > now() ORDER BY created_at DESC LIMIT 1",
        [userBId, orgBId]
      );
      assert.equal(ownerBSession.rowCount, 1, 'tenant B live session must exist');
      const ownerBSessionId = ownerBSession.rows[0].id;
      await clearSignedRlsSessionContext(fixture);

      x = await request('/api/v1/me', {}, ownerBCookie);
      assert.equal(x.response.status, 200);
      assert.equal(x.data.organization.id, orgBId);
      assert.notEqual(x.data.organization.id, orgAId);
      record('session-tenant-binding-across-two-tenants', `tenant B session resolved to ${orgBId}, distinct from tenant A ${orgAId}`);

      const spatialFeatureAId = 'gis-a-' + randomUUID();
      const spatialFeatureBId = 'gis-b-' + randomUUID();
      created.spatialFeatureIds.push(spatialFeatureAId, spatialFeatureBId);
      await bindSignedRlsSessionContext(fixture, { tenantId: orgAId, userId: ownerAId, accessMode: 'system' });
      await fixture.query(
        `INSERT INTO spatial_features
          (id,organization_id,entity_type,entity_id,feature_key,geom,properties,source,created_by,created_at,updated_at)
         VALUES ($1,$2,'site',$3,'acceptance-point-a',public.ST_SetSRID(public.ST_GeomFromText('POINT(31.2 30.0)'),4326),'{"source":"isolated-postgres-http-e2e"}'::jsonb,'postgres-http-e2e',$4,now(),now())`,
        [spatialFeatureAId, orgAId, 'site-' + stamp, ownerAId]
      );
      await bindSignedRlsSessionContext(fixture, { tenantId: orgBId, userId: userBId, accessMode: 'system' });
      await fixture.query(
        `INSERT INTO spatial_features
          (id,organization_id,entity_type,entity_id,feature_key,geom,properties,source,created_by,created_at,updated_at)
         VALUES ($1,$2,'site',$3,'acceptance-point-b',public.ST_SetSRID(public.ST_GeomFromText('POINT(31.25 30.05)'),4326),'{"source":"isolated-postgres-http-e2e"}'::jsonb,'postgres-http-e2e',$4,now(),now())`,
        [spatialFeatureBId, orgBId, 'site-' + stamp, userBId]
      );
      await clearSignedRlsSessionContext(fixture);

      const viewportPath = '/api/v1/map/viewport?west=31&south=29.9&east=31.4&north=30.2&limit=10';
      const mapA = await request(viewportPath, {}, ownerACookie);
      assert.equal(mapA.response.status, 200, JSON.stringify(mapA.data));
      assert.equal(mapA.response.headers.get('x-opscore-signed-tenant-context'), 'verified');
      assert.equal(mapA.data.organizationId, orgAId);
      assert.deepEqual(mapA.data.spatialFeatures.map(feature => feature.id), [spatialFeatureAId]);
      assert.equal(JSON.stringify(mapA.data).includes(spatialFeatureBId), false);
      const mapB = await request(viewportPath, {}, ownerBCookie);
      assert.equal(mapB.response.status, 200, JSON.stringify(mapB.data));
      assert.equal(mapB.response.headers.get('x-opscore-signed-tenant-context'), 'verified');
      assert.equal(mapB.data.organizationId, orgBId);
      assert.deepEqual(mapB.data.spatialFeatures.map(feature => feature.id), [spatialFeatureBId]);
      assert.equal(JSON.stringify(mapB.data).includes(spatialFeatureAId), false);
      record('signed-postgis-viewport-http-two-tenant-isolation',
        'Real HTTP requests from two independently authenticated sessions returned exactly one matching tenant feature each; signed-context response header verified.');

      if (process.env.OPSC_MAP_BROWSER_E2E === 'true') {
        const { chromium } = require('playwright');
        const browserOutputDir = path.resolve(process.env.OPSC_MAP_BROWSER_ARTIFACT_DIR || path.join(dir, 'dispatcher-map-postgres-browser-e2e'));
        fs.mkdirSync(browserOutputDir, { recursive: true });
        // __Host- Secure cookies must be installed on HTTPS. Keep the real app
        // on its existing loopback HTTP listener and add only an ephemeral local
        // HTTPS reverse proxy for Chromium; never weaken the session cookie.
        const tlsKeyPath = path.join(dir, 'dispatcher-map-e2e-key.pem');
        const tlsCertPath = path.join(dir, 'dispatcher-map-e2e-cert.pem');
        execFileSync('openssl', [
          'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
          '-keyout', tlsKeyPath, '-out', tlsCertPath,
          '-subj', '/CN=127.0.0.1',
          '-addext', 'subjectAltName=IP:127.0.0.1',
          '-days', '1'
        ], { stdio: 'ignore' });
        browserProxy = https.createServer({
          key: fs.readFileSync(tlsKeyPath),
          cert: fs.readFileSync(tlsCertPath)
        }, (incoming, outgoing) => {
          const upstream = http.request({
            hostname: '127.0.0.1',
            port: boundPort,
            path: incoming.url,
            method: incoming.method,
            headers: { ...incoming.headers, host: `127.0.0.1:${boundPort}` }
          }, upstreamResponse => {
            outgoing.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
            upstreamResponse.pipe(outgoing);
          });
          upstream.on('error', () => {
            if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'text/plain' });
            outgoing.end('Local acceptance proxy failed');
          });
          incoming.pipe(upstream);
        });
        await new Promise((resolve, reject) => {
          browserProxy.once('error', reject);
          browserProxy.listen(0, '127.0.0.1', resolve);
        });
        const browserBase = `https://127.0.0.1:${browserProxy.address().port}`;
        const browser = await chromium.launch({ headless: true });
        try {
          const context = await browser.newContext({
            viewport: { width: 375, height: 812 },
            reducedMotion: 'reduce',
            ignoreHTTPSErrors: true
          });
          const pageErrors = [];
          const consoleErrors = [];
          const requestFailures = [];
          const networkResponses = [];
          const apiResponses = [];
          const page = await context.newPage();
          let viewportRaceRequestCount = 0;
          let delayedViewportResponseReleased = false;
          await page.route('**/api/v1/map/viewport?*', async route => {
            const requestNumber = ++viewportRaceRequestCount;
            const response = await route.fetch();
            if (requestNumber === 2) {
              await new Promise(resolve => setTimeout(resolve, 1200));
              delayedViewportResponseReleased = true;
            }
            await route.fulfill({ response });
          });
          page.on('pageerror', error => pageErrors.push(error.message));
          page.on('console', entry => {
            if (entry.type() === 'error') consoleErrors.push(entry.text());
          });
          page.on('requestfailed', request => requestFailures.push({
            url: request.url(),
            error: request.failure()?.errorText || 'unknown'
          }));
          page.on('response', response => {
            if (response.url().includes('unpkg.com') || response.url().includes('openfreemap') || response.url().includes('/api/v1/map/viewport')) {
              networkResponses.push({ url: response.url(), status: response.status() });
            }
            if (response.url().includes('/api/v1/map/viewport')) apiResponses.push({ status: response.status() });
          });
          await context.addCookies([{
            name: '__Host-opscore_session',
            value: ownerACookie.slice(ownerACookie.indexOf('=') + 1),
            url: browserBase + '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Strict'
          }]);
          const pageResponse = await page.goto(browserBase + '/dispatcher-map.html?e2e=1', { waitUntil: 'domcontentloaded' });
          assert.equal(pageResponse.status(), 200);
          try {
            await page.waitForFunction(() => /1 authorized GIS features/.test(document.querySelector('#spatialFeatureCount')?.textContent || ''), null, { timeout: 30000 });
          } catch (waitError) {
            const diagnostics = {
              failure: waitError.message,
              pageUrl: page.url(),
              title: await page.title().catch(() => ''),
              authState: await page.locator('#authState').textContent().catch(() => ''),
              dataState: await page.locator('#dataState').textContent().catch(() => ''),
              spatialFeatureCount: await page.locator('#spatialFeatureCount').textContent().catch(() => ''),
              mapMessage: await page.locator('#mapMessage').textContent().catch(() => ''),
              mapContainer: await page.locator('#dispatcherMap').evaluate(node => ({
                width: node.clientWidth,
                height: node.clientHeight,
                childCount: node.childElementCount
              })).catch(() => null),
              pageErrors,
              consoleErrors,
              requestFailures,
              networkResponses,
              apiResponses
            };
            fs.writeFileSync(path.join(browserOutputDir, 'failure-diagnostics.json'), JSON.stringify(diagnostics, null, 2) + '\\n');
            await page.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-failure.png'), fullPage: true }).catch(() => {});
            throw new Error('DISPATCHER_MAP_FEATURE_COUNT_NOT_RENDERED: ' + JSON.stringify(diagnostics));
          }
          await page.waitForFunction(() => Boolean(document.querySelector('.maplibregl-canvas') && window.__opscoreDispatcherMapE2E), null, { timeout: 30000 });
          await page.waitForFunction(() => {
            const probe = window.__opscoreDispatcherMapE2E;
            const ready = probe?.mapReadiness();
            return Boolean(ready?.styleLoaded && ready?.sourceLoaded
              && ready.layers.includes('tenant-spatial-points'));
          }, null, { timeout: 30000 });
          await page.evaluate(() => window.__opscoreDispatcherMapE2E.focusTenantFeature(31.2, 30.0));
          try {
            await page.waitForFunction(expected => {
              const probe = window.__opscoreDispatcherMapE2E;
              return Boolean(probe && probe.renderedSpatialFeatureIds().includes(expected));
            }, spatialFeatureAId, { timeout: 30000 });
          } catch (renderError) {
            const renderDiagnostics = {
              failure: renderError.message,
              readiness: await page.evaluate(() => window.__opscoreDispatcherMapE2E?.mapReadiness() || null),
              displayedFeatureIds: await page.evaluate(() => window.__opscoreDispatcherMapE2E?.displayedSpatialFeatureIds() || []),
              renderedFeatureIds: await page.evaluate(() => window.__opscoreDispatcherMapE2E?.renderedSpatialFeatureIds() || []),
              mapCanvas: await page.locator('.maplibregl-canvas').evaluate(node => ({ width: node.width, height: node.height, clientWidth: node.clientWidth, clientHeight: node.clientHeight })).catch(() => null),
              pageErrors,
              consoleErrors,
              networkResponses,
              apiResponses
            };
            fs.writeFileSync(path.join(browserOutputDir, 'rendered-feature-diagnostics.json'), JSON.stringify(renderDiagnostics, null, 2) + '\n');
            await page.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-rendered-feature-failure.png'), fullPage: true }).catch(() => {});
            throw new Error('MAPLIBRE_SPATIAL_FEATURE_NOT_RENDERED: ' + JSON.stringify(renderDiagnostics));
          }
          assert.ok(apiResponses.some(response => response.status === 200), 'browser must receive a successful authenticated PostGIS viewport response');
          assert.equal(await page.locator('#spatialFeatureCount').textContent(), '1 authorized GIS features');
          const renderedA = await page.evaluate(() => window.__opscoreDispatcherMapE2E.renderedSpatialFeatureIds());
          assert.deepEqual(renderedA, [spatialFeatureAId], 'MapLibre must actually render tenant A geometry, not merely create a canvas');
          const forgedTenantResponse = await page.evaluate(async ({ orgBId }) => {
            const response = await fetch('/api/v1/map/viewport?west=31&south=29.9&east=31.4&north=30.2&limit=10&organizationId=' + encodeURIComponent(orgBId), { credentials: 'same-origin', cache: 'no-store' });
            return { status: response.status, body: await response.json() };
          }, { orgBId });
          assert.equal(forgedTenantResponse.status, 200);
          assert.equal(forgedTenantResponse.body.organizationId, orgAId, 'client-supplied foreign organization ID must never override signed session context');
          assert.deepEqual(forgedTenantResponse.body.spatialFeatures.map(feature => feature.id), [spatialFeatureAId]);
          assert.equal(JSON.stringify(forgedTenantResponse.body).includes(spatialFeatureBId), false);
          const viewportRequestsBeforeBurst = await page.evaluate(() => window.__opscoreDispatcherMapE2E.viewportRequestCount());
          await page.evaluate(() => window.__opscoreDispatcherMapE2E.triggerViewportBurst());
          await page.waitForTimeout(650);
          const viewportRequestsAfterBurst = await page.evaluate(() => window.__opscoreDispatcherMapE2E.viewportRequestCount());
          assert.equal(viewportRequestsAfterBurst - viewportRequestsBeforeBurst, 1,
            'three rapid MapLibre moveend events must collapse to one debounced viewport request');

          // Exercise out-of-order completion against the real API: delay only the
          // first of two real upstream responses. The later response must remain
          // authoritative after the delayed response finally arrives.
          await page.evaluate(() => window.__opscoreDispatcherMapE2E.refreshViewportNow());
          await page.waitForFunction(() => window.__opscoreDispatcherMapE2E.viewportRequestCount() >= 3, null, { timeout: 10000 });
          await page.evaluate(() => window.__opscoreDispatcherMapE2E.refreshViewportNow());
          await page.waitForFunction(() => window.__opscoreDispatcherMapE2E.lastAppliedViewportSequence()
            === window.__opscoreDispatcherMapE2E.viewportSequence(), null, { timeout: 10000 });
          const latestAppliedBeforeRelease = await page.evaluate(() => window.__opscoreDispatcherMapE2E.lastAppliedViewportSequence());
          await page.waitForFunction(() => window.__opscoreDispatcherMapE2E.viewportRequestCount() >= 4, null, { timeout: 10000 });
          await page.waitForTimeout(1400);
          const latestAppliedAfterRelease = await page.evaluate(() => window.__opscoreDispatcherMapE2E.lastAppliedViewportSequence());
          assert.equal(delayedViewportResponseReleased, true, 'the delayed real viewport response must be released');
          assert.equal(latestAppliedAfterRelease, latestAppliedBeforeRelease,
            'a stale response completing last must not replace the newest applied viewport sequence');
          await page.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-postgres-authenticated-375.png'), fullPage: true });
          const responsiveViewports = [
            { width: 320, height: 740 },
            { width: 375, height: 812 },
            { width: 430, height: 932 },
            { width: 768, height: 1024 },
            { width: 1366, height: 900 },
            { width: 1920, height: 1080 }
          ];
          const responsiveChecks = [];
          for (const viewport of responsiveViewports) {
            await page.setViewportSize(viewport);
            await page.waitForTimeout(100);
            const layout = await page.evaluate(() => ({
              viewport: document.documentElement.clientWidth,
              document: document.documentElement.scrollWidth,
              body: document.body.scrollWidth,
              mapCanvas: Boolean(document.querySelector('.maplibregl-canvas'))
            }));
            assert.ok(layout.document <= layout.viewport + 1, JSON.stringify({ viewport, layout }));
            assert.ok(layout.body <= layout.viewport + 1, JSON.stringify({ viewport, layout }));
            assert.equal(layout.mapCanvas, true);
            responsiveChecks.push({ ...viewport, status: 'PASS', documentWidth: layout.document, bodyWidth: layout.body });
          }
          await page.setViewportSize({ width: 1366, height: 900 });
          await page.locator('[data-dir-toggle]').click();
          assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
          const rtlMobile = await page.evaluate(() => ({
            direction: document.documentElement.getAttribute('dir'),
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth
          }));
          await page.setViewportSize({ width: 375, height: 812 });
          const rtlMobileLayout = await page.evaluate(() => ({
            direction: document.documentElement.getAttribute('dir'),
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth
          }));
          assert.equal(rtlMobileLayout.direction, 'rtl');
          assert.ok(rtlMobileLayout.document <= rtlMobileLayout.viewport + 1, JSON.stringify(rtlMobileLayout));
          assert.ok(rtlMobileLayout.body <= rtlMobileLayout.viewport + 1, JSON.stringify(rtlMobileLayout));
          await page.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-postgres-authenticated-rtl.png'), fullPage: true });

          // A separate browser context receives only tenant B's independently issued
          // HttpOnly cookie. No storage or cookies are copied from tenant A.
          const contextB = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            reducedMotion: 'reduce',
            ignoreHTTPSErrors: true
          });
          const pageB = await contextB.newPage();
          const pageBErrors = [];
          pageB.on('pageerror', error => pageBErrors.push(error.message));
          await contextB.addCookies([{
            name: '__Host-opscore_session',
            value: ownerBCookie.slice(ownerBCookie.indexOf('=') + 1),
            url: browserBase + '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Strict'
          }]);
          const pageBResponse = await pageB.goto(browserBase + '/dispatcher-map.html?e2e=1', { waitUntil: 'domcontentloaded' });
          assert.equal(pageBResponse.status(), 200);
          await pageB.waitForFunction(() => {
            const ready = window.__opscoreDispatcherMapE2E?.mapReadiness();
            return Boolean(ready?.loaded && ready?.styleLoaded && ready?.sourceLoaded
              && ready.layers.includes('tenant-spatial-points'));
          }, null, { timeout: 30000 });
          await pageB.evaluate(() => window.__opscoreDispatcherMapE2E.focusTenantFeature(31.25, 30.05));
          try {
            await pageB.waitForFunction(expected => {
              const probe = window.__opscoreDispatcherMapE2E;
              return Boolean(probe && probe.displayedSpatialFeatureIds().includes(expected)
                && probe.renderedSpatialFeatureIds().includes(expected));
            }, spatialFeatureBId, { timeout: 30000 });
          } catch (renderError) {
            const renderDiagnostics = {
              failure: renderError.message,
              readiness: await pageB.evaluate(() => window.__opscoreDispatcherMapE2E?.mapReadiness() || null),
              displayedFeatureIds: await pageB.evaluate(() => window.__opscoreDispatcherMapE2E?.displayedSpatialFeatureIds() || []),
              renderedFeatureIds: await pageB.evaluate(() => window.__opscoreDispatcherMapE2E?.renderedSpatialFeatureIds() || []),
              pageErrors: pageBErrors
            };
            fs.writeFileSync(path.join(browserOutputDir, 'tenant-b-rendered-feature-diagnostics.json'), JSON.stringify(renderDiagnostics, null, 2) + '\n');
            await pageB.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-tenant-b-rendered-feature-failure.png'), fullPage: true }).catch(() => {});
            throw new Error('TENANT_B_MAPLIBRE_SPATIAL_FEATURE_NOT_RENDERED: ' + JSON.stringify(renderDiagnostics));
          }
          const renderedB = await pageB.evaluate(() => window.__opscoreDispatcherMapE2E.renderedSpatialFeatureIds());
          const displayedB = await pageB.evaluate(() => window.__opscoreDispatcherMapE2E.displayedSpatialFeatureIds());
          assert.deepEqual(displayedB, [spatialFeatureBId]);
          assert.deepEqual(renderedB, [spatialFeatureBId], 'MapLibre must render tenant B geometry only');
          assert.equal(renderedB.includes(spatialFeatureAId), false);
          assert.deepEqual(pageBErrors, []);
          await pageB.screenshot({ path: path.join(browserOutputDir, 'dispatcher-map-postgres-authenticated-tenant-b.png'), fullPage: true });
          await contextB.close();

          assert.deepEqual(pageErrors, []);
          fs.writeFileSync(path.join(browserOutputDir, 'report.json'), JSON.stringify({
            schemaVersion: 'opscore.dispatcher-map-authenticated-postgres-browser-e2e.v1',
            status: 'PASS',
            browser: await browser.version(),
            viewports: responsiveChecks,
            rtlDesktopAndMobile: { desktop: 'PASS', mobile: rtlMobileLayout, initialMobileRtl: rtlMobile },
            tenantFeatureCount: 1,
            tenantBrowserIsolation: { tenantA: renderedA, tenantB: renderedB, status: 'PASS' },
            viewportDebounce: { burstEvents: 3, requests: viewportRequestsAfterBurst - viewportRequestsBeforeBurst, status: 'PASS' },
            viewportOutOfOrder: { latestAppliedBeforeRelease: latestAppliedBeforeRelease, latestAppliedAfterRelease: latestAppliedAfterRelease, delayedResponseReleased: delayedViewportResponseReleased, status: 'PASS' },
            forgedOrganizationId: { status: forgedTenantResponse.status, effectiveOrganizationId: forgedTenantResponse.body.organizationId, statusLabel: 'SIGNED_SESSION_CONTEXT_PREVAILED' },
            signedViewportResponses: apiResponses,
            pageErrors,
            tenantBPageErrors: pageBErrors,
            rtl: 'PASS',
            productionCertification: false
          }, null, 2) + '\n');
          record('dispatcher-map-authenticated-chromium-postgis-render',
            'Two independent Chromium contexts rendered only their own tenant PostGIS feature IDs; client-supplied foreign organizationId did not override signed session context; responsive layout and RTL passed with no uncaught page errors.');
          await context.close();
        } finally {
          await browser.close();
        }
      } else {
        throw new Error('OPSC_MAP_BROWSER_E2E_REQUIRED_FOR_STRICT_POSTGRES_ACCEPTANCE');
      }

      // Exercise the hard 1000-feature viewport page bound with 1005 persisted
      // PostGIS fixtures. Inserts use the signed tenant context and the test cleanup
      // ledger records every returned ID; no static or mocked geometry is involved.
      await bindSignedRlsSessionContext(fixture, { tenantId: orgAId, userId: ownerAId, accessMode: 'system' });
      const capFixtures = await fixture.query(
        `INSERT INTO spatial_features
          (id,organization_id,entity_type,entity_id,feature_key,geom,properties,source,created_by,created_at,updated_at)
         SELECT 'gis-cap-' || $1 || '-' || g::text,
                $2,
                'site',
                'cap-' || $1 || '-' || g::text,
                'cap',
                public.ST_SetSRID(public.ST_MakePoint(31.1 + (g % 100) * 0.001, 30.0 + (g / 100) * 0.001), 4326),
                '{}'::jsonb,
                'acceptance-viewport-cap',
                $3,
                now(),
                now()
         FROM generate_series(1, 1005) AS g
         RETURNING id`,
        [stamp, orgAId, ownerAId]
      );
      created.spatialFeatureIds.push(...capFixtures.rows.map(row => row.id));
      await clearSignedRlsSessionContext(fixture);
      assert.equal(capFixtures.rowCount, 1005);
      const cappedViewport = await request(
        '/api/v1/map/viewport?west=31&south=29.9&east=31.4&north=30.2&limit=1000',
        {},
        ownerACookie
      );
      assert.equal(cappedViewport.response.status, 200, JSON.stringify(cappedViewport.data));
      assert.equal(cappedViewport.data.spatialFeatures.length, 1000,
        'the signed PostGIS viewport must return exactly the requested hard maximum of 1000 from 1005 matching persisted rows');
      assert.ok(cappedViewport.data.spatialFeatures.length <= 1000);
      record('postgis-viewport-hard-1000-feature-bound',
        '1005 persisted tenant-A PostGIS geometries were inserted under signed context; the real HTTP viewport returned exactly 1000 and never exceeded the contract bound.');

      // Scale the actual tenant-scoped PostGIS table progressively to 40k, 250k,
      // and 1m rows. Each stage is queried through the authenticated HTTP route;
      // timings are evidence distributions, not an invented SLA threshold.
      const percentile = (values, p) => values[Math.ceil(p * values.length) - 1];
      const scaleStages = [
        { target: 40000, add: 40000 },
        { target: 250000, add: 210000 },
        { target: 1000000, add: 750000 }
      ];
      const scaleEvidence = {
        schemaVersion: 'opscore.postgis-scale-acceptance.v1',
        commit: process.env.CI_COMMIT_SHA || null,
        pipelineId: process.env.CI_PIPELINE_ID ? Number(process.env.CI_PIPELINE_ID) : null,
        databaseEngine: 'PostgreSQL + PostGIS',
        applicationRole: engine.role,
        tenant: orgAId,
        stages: []
      };
      let insertedScaleRows = 0;
      for (const stage of scaleStages) {
        const inserted = await fixture.query(
          `INSERT INTO spatial_features
            (id,organization_id,entity_type,entity_id,feature_key,geom,properties,source,created_by,created_at,updated_at)
           SELECT 'gis-' || $1 || g::text,
                  $2,
                  'site',
                  $1 || g::text,
                  'scale',
                  public.ST_SetSRID(public.ST_MakePoint(
                    31.0 + ((g + $3) % 1000)::double precision / 1000.0,
                    30.0 + floor((g + $3)::double precision / 1000.0) / 1000.0
                  ), 4326),
                  '{}'::jsonb,
                  'acceptance-scale-benchmark',
                  $4,
                  now(),
                  now()
           FROM generate_series(1, $5::integer) AS g`,
          [created.scalePrefix, orgAId, insertedScaleRows, ownerAId, stage.add]
        );
        assert.equal(inserted.rowCount, stage.add);
        insertedScaleRows += inserted.rowCount;

        // ANALYZE is a maintenance operation and is performed only against this
        // disposable acceptance database using the already validated cleanup role.
        await cleanupPool.query('ANALYZE public.spatial_features');

        const latenciesMs = [];
        for (let sample = 0; sample < 15; sample++) {
          const started = process.hrtime.bigint();
          const result = await request(
            '/api/v1/map/viewport?west=31&south=30&east=31.2&north=30.2&limit=1000',
            {},
            ownerACookie
          );
          const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
          assert.equal(result.response.status, 200, JSON.stringify(result.data));
          assert.equal(result.data.spatialFeatures.length, 1000,
            `scale stage ${stage.target} must return the bounded 1000-feature page`);
          latenciesMs.push(Number(elapsed.toFixed(3)));
        }
        latenciesMs.sort((a, b) => a - b);
        const percentile = p => latenciesMs[Math.ceil(p * latenciesMs.length) - 1];
        await bindSignedRlsSessionContext(fixture, { tenantId: orgAId, userId: ownerAId, accessMode: 'backoffice' });
        let explain;
        try {
          explain = await fixture.query(
            'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM opscore_security.spatial_features_in_viewport(31,30,31.2,30.2,1000)'
          );
        } finally {
          await clearSignedRlsSessionContext(fixture);
        }
        const plan = explain.rows[0]['QUERY PLAN'][0];
        scaleEvidence.stages.push({
          rows: stage.target,
          insertedThisStage: stage.add,
          samples: latenciesMs.length,
          latencyMs: {
            min: latenciesMs[0],
            p50: percentile(0.50),
            p95: percentile(0.95),
            max: latenciesMs[latenciesMs.length - 1]
          },
          queryPlan: plan
        });
      }
      const scaleArtifactDir = path.resolve(process.env.OPSC_MAP_BROWSER_ARTIFACT_DIR || path.join(dir, 'dispatcher-map-postgres-browser-e2e'));
      fs.mkdirSync(scaleArtifactDir, { recursive: true });
      fs.writeFileSync(path.join(scaleArtifactDir, 'gis-scale-benchmark.json'),
        JSON.stringify(scaleEvidence, null, 2) + '\n');
      record('postgis-scale-40k-250k-1m',
        'Progressive 40k, 250k, and 1m tenant-scoped PostGIS datasets were queried 15 times per stage over authenticated HTTP; p50/p95/min/max latency and EXPLAIN ANALYZE BUFFERS evidence saved as gis-scale-benchmark.json.');

      // Exercise the real Digital Twin HTTP surface against migrated PostgreSQL
      // tables while the application runs as opscore_runtime (NO BYPASSRLS).
      x = await request('/api/v1/platform/twin', {}, ownerACookie);
      assert.equal(x.response.status, 200, JSON.stringify(x.data));
      assert.equal(x.data.organizationId, orgAId);
      const twinSnapshotA = await request('/api/v1/platform/twin/snapshots', {
        method: 'POST',
        headers: { 'idempotency-key': `twin-snapshot-a-${stamp}` },
        body: JSON.stringify({})
      }, ownerACookie);
      assert.equal(twinSnapshotA.response.status, 201, JSON.stringify(twinSnapshotA.data));
      const twinSnapshotAId = twinSnapshotA.data.snapshotId;
      assert.ok(twinSnapshotAId);
      assert.equal(twinSnapshotA.data.integrity.valid, true);
      const twinHistoryA = await request('/api/v1/platform/twin/snapshots', {}, ownerACookie);
      assert.equal(twinHistoryA.response.status, 200);
      assert.ok(twinHistoryA.data.items.some(row => row.id === twinSnapshotAId && row.integrity === 'valid'));
      const twinVerifyA = await request(`/api/v1/platform/twin/snapshots/${encodeURIComponent(twinSnapshotAId)}/verify`, {}, ownerACookie);
      assert.equal(twinVerifyA.response.status, 200, JSON.stringify(twinVerifyA.data));
      assert.equal(twinVerifyA.data.valid, true);
      const twinChainA = await request('/api/v1/platform/twin/integrity', {}, ownerACookie);
      assert.equal(twinChainA.response.status, 200);
      assert.equal(twinChainA.data.valid, true);
      assert.equal(twinChainA.data.eventCount, 1);
      assert.equal(Number(twinChainA.data.snapshotCount), 1);
      record('digital-twin-http-snapshot-history-and-hash-chain',
        `tenant A created and verified snapshot ${twinSnapshotAId}; persisted event chain valid over PostgreSQL HTTP`);

      // The database policy itself must hide tenant A's persisted snapshot from
      // tenant B and reject a cross-tenant insert, independent of route predicates.
      await bindSignedRlsSessionContext(fixture, { tenantId: orgBId, accessMode: 'system' });
      const hiddenTwinRows = await fixture.query(
        'SELECT id FROM operational_twin_snapshots WHERE id=$1', [twinSnapshotAId]
      );
      assert.equal(hiddenTwinRows.rowCount, 0);
      await assert.rejects(
        () => fixture.query(
          'INSERT INTO operational_twin_snapshots(id,organization_id,snapshot_kind,state_json,state_sha256,source_counts_json,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [`twin-rls-forgery-${stamp}`, orgAId, 'on_demand', '{}', '0'.repeat(64), '{}', ownerAId, new Date().toISOString()]
        ),
        error => error && error.code === '42501'
      );
      await clearSignedRlsSessionContext(fixture);
      record('digital-twin-snapshot-database-rls-cross-tenant-denial',
        'opscore_runtime under tenant B signed context could not read tenant A snapshot or insert a tenant A snapshot');

      // Start a second application process on the same isolated PostgreSQL database.
      // The session cookie is database-backed, so both processes must resolve the
      // same authenticated tenant without sharing in-process memory or DB workers.
      const port2 = port + 15000;
      child2 = spawn(process.execPath, ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(port2),
          HOST: '127.0.0.1',
          PUBLIC_ORIGIN: `http://127.0.0.1:${port2}`,
          SQLITE_PATH: path.join(dir, 'unused-second.sqlite'),
          OPSC_REPOSITORY_PATH: path.join(dir, 'files-second'),
          DATABASE_ENGINE: 'postgres',
          DATABASE_URL: urlText,
          OPSC_DATABASE_URL: '',
          OPSC_PG_SSL_MODE: ['127.0.0.1', 'localhost'].includes(parsed.hostname) ? 'disable' : 'require',
          AUTH_MODE: 'local',
          OPSC_TEST_SCRYPT_N: process.env.OPSC_TEST_SCRYPT_N || '32768',
          VERCEL_ENV: 'preview',
          OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'true',
          OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
      OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const boundPort2 = await waitForServer(child2);
      base2 = `http://127.0.0.1:${boundPort2}`;
      assert.notEqual(child.pid, child2.pid);
      let health2 = await requestAt(base2, '/api/health');
      for (let i = 0; health2.data && health2.data.status !== 'healthy' && i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        health2 = await requestAt(base2, '/api/health');
      }
      assert.equal(health2.response.status, 200, JSON.stringify(health2.data));
      assert.equal(health2.data.engine, 'postgres');
      assert.equal(health2.data.status, 'healthy');

      // Race two independent application processes with distinct idempotency keys.
      // The transaction-scoped tenant advisory lock must serialize both app writers.
      const concurrentTwinWrites = await Promise.all([
        request('/api/v1/platform/twin/snapshots', {
          method: 'POST',
          headers: { 'idempotency-key': `twin-concurrent-a-${stamp}` },
          body: JSON.stringify({})
        }, ownerACookie),
        requestAt(base2, '/api/v1/platform/twin/snapshots', {
          method: 'POST',
          headers: { 'idempotency-key': `twin-concurrent-b-${stamp}` },
          body: JSON.stringify({})
        }, ownerACookie)
      ]);
      for (const result of concurrentTwinWrites) {
        assert.equal(result.response.status, 201, JSON.stringify(result.data));
        assert.equal(result.data.integrity.valid, true);
      }
      const concurrentSequences = concurrentTwinWrites.map(result => Number(result.data.chain.sequenceNo)).sort((a, b) => a - b);
      assert.deepEqual(concurrentSequences, [2, 3]);
      const twinChainAfterRace = await request('/api/v1/platform/twin/integrity', {}, ownerACookie);
      assert.equal(twinChainAfterRace.response.status, 200);
      assert.equal(twinChainAfterRace.data.valid, true, JSON.stringify(twinChainAfterRace.data.failures));
      assert.equal(twinChainAfterRace.data.eventCount, 3);
      assert.equal(Number(twinChainAfterRace.data.snapshotCount), 3);
      record('digital-twin-http-concurrent-writers',
        `two independent app processes (pids ${child.pid} and ${child2.pid}) committed sequence numbers 2 and 3; no duplicate, gap, or orphan snapshot`);

      // Tenant B starts with an empty, independent Twin history; it cannot verify
      // tenant A identifiers, then can create and verify its own chain.
      const twinHistoryBBefore = await request('/api/v1/platform/twin/snapshots', {}, ownerBCookie);
      assert.equal(twinHistoryBBefore.response.status, 200);
      assert.equal(twinHistoryBBefore.data.items.length, 0);
      const twinForeignVerifyB = await request(`/api/v1/platform/twin/snapshots/${encodeURIComponent(twinSnapshotAId)}/verify`, {}, ownerBCookie);
      assert.equal(twinForeignVerifyB.response.status, 404);
      const twinChainBEmpty = await request('/api/v1/platform/twin/integrity', {}, ownerBCookie);
      assert.equal(twinChainBEmpty.response.status, 200);
      assert.equal(twinChainBEmpty.data.valid, true);
      assert.equal(twinChainBEmpty.data.eventCount, 0);
      assert.equal(Number(twinChainBEmpty.data.snapshotCount), 0);
      const twinSnapshotB = await request('/api/v1/platform/twin/snapshots', {
        method: 'POST',
        headers: { 'idempotency-key': `twin-snapshot-b-${stamp}` },
        body: JSON.stringify({})
      }, ownerBCookie);
      assert.equal(twinSnapshotB.response.status, 201, JSON.stringify(twinSnapshotB.data));
      assert.equal(twinSnapshotB.data.organizationId, orgBId);
      assert.equal(twinSnapshotB.data.integrity.valid, true);
      const twinChainBAfter = await request('/api/v1/platform/twin/integrity', {}, ownerBCookie);
      assert.equal(twinChainBAfter.data.valid, true);
      assert.equal(twinChainBAfter.data.eventCount, 1);
      const twinChainAAfterB = await request('/api/v1/platform/twin/integrity', {}, ownerACookie);
      assert.equal(twinChainAAfterB.data.valid, true);
      assert.equal(twinChainAAfterB.data.eventCount, 3);
      record('digital-twin-http-two-tenant-isolation',
        'tenant A and B own separate snapshot histories and valid chains; B cannot read or verify A snapshot identifiers');

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

      await bindSignedRlsSessionContext(fixture, {
        tenantId: orgAId, userId: ownerAId, sessionId: ownerASessionId, accessMode: 'field'
      });
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
      await bindSignedRlsSessionContext(fixture, {
        tenantId: orgBId, userId: userBId, sessionId: ownerBSessionId, accessMode: 'field'
      });
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
      await bindSignedRlsSessionContext(fixture, {
        tenantId: orgAId, userId: ownerAId, sessionId: ownerASessionId, accessMode: 'field'
      });
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

      // Use one checked-out connection for both counts. Signed session context is backend-local;
      // calling Pool.query twice can select different connections and produce false results under RLS.
      const countClient = await control.connect();
      try {
        await bindSignedRlsSessionContext(countClient, {
          tenantId: orgAId, userId: ownerAId, sessionId: ownerASessionId, accessMode: 'field'
        });
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
        // Re-bind the verified field session before the post-verify count. Neon transaction poolers
        // and concurrent session noise must not make RLS hide live tenant rows and
        // produce a false "verify mutated data" failure.
        await bindSignedRlsSessionContext(countClient, {
          tenantId: orgAId, userId: ownerAId, sessionId: ownerASessionId, accessMode: 'field'
        });
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
        await clearSignedRlsSessionContext(countClient).catch(() => {});
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
      await clearSignedRlsSessionContext(fixture).catch(() => {});
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
    const stopServer = async serverChild => {
      if (!serverChild) return;
      if (serverChild.exitCode === null && serverChild.signalCode === null) serverChild.kill('SIGTERM');
      await new Promise(resolve => {
        if (serverChild.exitCode !== null || serverChild.signalCode !== null) return resolve();
        serverChild.once('exit', resolve);
      });
    };
    if (browserProxy) {
      await new Promise(resolve => browserProxy.close(resolve));
      browserProxy = null;
    }
    await stopServer(child2);
    await stopServer(child);

    // Target only fixture IDs and exact synthetic throttle keys. Do not hide cleanup
    // errors: a green acceptance result is not valid if the disposable DB retains data.
    try {
      cleanupClient = await (cleanupPool || control).connect();
      const bindCleanupContext = async context => {
        if (!cleanupUsesPrivilegedRole) await bindSignedRlsSessionContext(cleanupClient, context);
      };
      for (const orgId of created.organizations) {
        await bindCleanupContext({ tenantId: orgId, accessMode: 'system' });
        if (!cleanupUsesPrivilegedRole) await attemptCleanup('set-organization-cleanup-context',
          'SELECT public.opscore_current_tenant() AS tenant, public.opscore_access_mode() AS mode');
        for (const featureId of created.spatialFeatureIds) {
          await attemptCleanup('delete-synthetic-spatial-feature', 'DELETE FROM spatial_features WHERE id=$1 AND organization_id=$2', [featureId, orgId]);
        }
        if (created.scalePrefix) {
          await attemptCleanup('delete-scale-benchmark-spatial-features',
            "DELETE FROM spatial_features WHERE organization_id=$1 AND source='acceptance-scale-benchmark' AND entity_id LIKE $2",
            [orgId, created.scalePrefix + '%']);
        }
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
        await bindCleanupContext({ userId, accessMode: 'system' });
        if (!cleanupUsesPrivilegedRole) await attemptCleanup('set-user-cleanup-context',
          'SELECT public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode');
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
      await bindCleanupContext({ accessMode: 'auth' });
      if (!cleanupUsesPrivilegedRole) await attemptCleanup('set-throttle-cleanup-context',
        'SELECT public.opscore_access_mode() AS mode');
      for (const throttleKey of created.loginThrottleKeys) {
        await attemptCleanup('delete-synthetic-login-throttle', 'DELETE FROM login_throttle WHERE throttle_key=$1', [throttleKey]);
      }
      // Verify global residue while access_mode is explicitly system; blank context can
      // make RLS hide users and falsely report zero. Reset the GUCs only after the checks.
      await bindCleanupContext({ accessMode: 'system' });
      if (!cleanupUsesPrivilegedRole) await attemptCleanup('set-cleanup-verification-context',
        'SELECT public.opscore_access_mode() AS mode');
      const remainingUsers = virginDatabaseVerified
        ? await attemptCleanup(
            'verify-no-user-residue',
            cleanupUsesPrivilegedRole
              ? 'SELECT count(*)::int AS n FROM users'
              : 'SELECT opscore_count_users()::int AS n'
          )
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
      await clearSignedRlsSessionContext(cleanupClient);
      await attemptCleanup('reset-cleanup-context', "SELECT current_setting('app.signed_context_request_id', true) AS cleared_request_id");
    } catch (error) {
      cleanupErrors.push({ operation: 'cleanup-connection', code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
    }
    if (cleanupClient) { try { cleanupClient.release(); } catch (error) {
      cleanupErrors.push({ operation: 'release-cleanup-client', code: error && error.code || null, message: String(error && error.message || error).slice(0, 240) });
    } }
    await control.end().catch(() => {});
    if (cleanupPool) await cleanupPool.end().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(RESULT_PATH)) {
      try {
        const prior = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8'));
        prior.cleanup = !virginDatabaseVerified
          ? { status: 'NOT_RUN', reason: 'PREFLIGHT_DID_NOT_PASS' }
          : cleanupErrors.length
            ? { status: 'FAIL', errors: cleanupErrors }
            : { status: 'PASS', method: cleanupUsesPrivilegedRole ? 'exact-target-privileged-cleanup' : 'runtime-signed-context-cleanup', trackedUsers: created.users.length, trackedOrganizations: created.organizations.length, syntheticThrottleKeysHandled: created.loginThrottleKeys.length };
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
