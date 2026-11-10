'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

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
      reject(new Error(`OpsCore test server exited (${code}). ${err.slice(-1200)}`));
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
  const raw = String(response.headers.get('set-cookie') || '');
  return raw.split(';')[0];
}

function expectCookieSecurity(response) {
  const raw = String(response.headers.get('set-cookie') || '');
  assert.match(raw, /^__Host-opscore_session=/);
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /Secure/i);
  assert.match(raw, /SameSite=Strict/i);
  assert.match(raw, /Path=\//i);
}

test('commercial HTTP acceptance: auth/session, cross-tenant boundaries, password reset, Safe Mode and recovery bundle', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-commercial-http-e2e-'));
  const dbPath = path.join(dir, 'acceptance.sqlite');
  const filesPath = path.join(dir, 'files');
  const port = 30000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      SQLITE_PATH: dbPath,
      OPSC_REPOSITORY_PATH: filesPath,
      DATABASE_ENGINE: 'sqlite',
      OPSC_DATABASE_URL: '',
      DATABASE_URL: '',
      AUTH_MODE: 'local'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let base;
  let ownerCookie;
  let otherOwnerCookie;
  let memberCookie;
  let ownerId;
  let memberId;
  let otherOrgId;
  let privateWorkOrderId;

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
    const boundPort = await waitForServer(child);
    base = `http://127.0.0.1:${boundPort}`;

    // Anonymous calls must not gain access to tenant control-plane data.
    let x = await request('/api/v1/control-plane');
    assert.equal(x.response.status, 401);
    x = await request('/api/v1/control-plane/recovery-bundle');
    assert.equal(x.response.status, 401);

    // Create the first tenant through the same HTTP bootstrap used during setup.
    x = await request('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        orgName: 'Acceptance Tenant A',
        email: 'owner-a@acceptance.example.test',
        password: 'Initial-A-strong-2026'
      })
    });
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    ownerId = x.data.userId || x.data.user?.id || x.data.id;
    assert.ok(ownerId, 'bootstrap response must expose the first owner identity');

    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner-a@acceptance.example.test', password: 'Initial-A-strong-2026' })
    });
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    expectCookieSecurity(x.response);
    ownerCookie = cookieFrom(x.response);
    assert.ok(ownerCookie);
    assert.doesNotMatch(x.text, /password_hash|token_hash/i);

    // An invalid password must not create a usable session.
    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner-a@acceptance.example.test', password: 'definitely-wrong-password' })
    });
    assert.equal(x.response.status, 401);
    assert.equal(cookieFrom(x.response), '');

    x = await request('/api/v1/me', {}, ownerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.user.email, 'owner-a@acceptance.example.test');
    const orgAId = x.data.organization.id;
    ownerId = x.data.user.id;
    assert.ok(orgAId);

    x = await request('/api/v1/control-plane', {}, ownerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.schemaVersion, 'opscore.control-plane.v1');

    // Create a tenant-A customer and a private work order through the public HTTP API.
    x = await request('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tenant A Private Customer', email: 'customer-a@acceptance.example.test' })
    }, ownerCookie);
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    const customerAId = x.data.id;
    assert.ok(customerAId);

    x = await request('/api/v1/work-orders', {
      method: 'POST',
      body: JSON.stringify({ title: 'Tenant A Confidential Work Order', customerId: customerAId, description: 'isolated acceptance fixture' })
    }, ownerCookie);
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    privateWorkOrderId = x.data.id;
    assert.ok(privateWorkOrderId);

    // Set up two synthetic identities directly in the temporary SQLite fixture only.
    // The server is pointed at this temporary file; no production database is involved.
    const { openDb } = require('../src/db');
    const { id, now, hashPassword } = require('../src/security');
    const db = openDb(dbPath);
    try {
      const createdAt = now();
      otherOrgId = id('org');
      const userBId = id('usr');
      memberId = id('usr');
      db.prepare('INSERT INTO organizations VALUES (?,?,?)').run(otherOrgId, 'Acceptance Tenant B', createdAt);
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userBId, 'owner-b@acceptance.example.test', hashPassword('Initial-B-strong-2026'), 'active', createdAt);
      db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(userBId, otherOrgId, 'owner', createdAt);
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(memberId, 'member-a@acceptance.example.test', hashPassword('Initial-member-strong-2026'), 'active', createdAt);
      db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(memberId, orgAId, 'member', createdAt);
    } finally {
      db.close();
    }

    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner-b@acceptance.example.test', password: 'Initial-B-strong-2026' })
    });
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    expectCookieSecurity(x.response);
    otherOwnerCookie = cookieFrom(x.response);

    x = await request('/api/v1/me', {}, otherOwnerCookie);
    assert.equal(x.response.status, 200);
    assert.notEqual(x.data.organization.id, orgAId);
    assert.equal(x.data.organization.id, otherOrgId);

    // Tenant B must not read Tenant A's resource, even with a valid owner session.
    x = await request(`/api/v1/work-orders/${encodeURIComponent(privateWorkOrderId)}`, {}, otherOwnerCookie);
    assert.equal(x.response.status, 404);
    x = await request('/api/v1/work-orders', {}, otherOwnerCookie);
    assert.equal(x.response.status, 200);
    assert.equal((x.data || []).some(row => row.id === privateWorkOrderId || row.title === 'Tenant A Confidential Work Order'), false);

    // Password-reset tokens are tenant-scoped: B cannot mint a reset for A's owner.
    x = await request('/api/v1/admin/password-reset', {
      method: 'POST',
      body: JSON.stringify({ userId: ownerId })
    }, otherOwnerCookie);
    assert.equal(x.response.status, 404);

    // Owner A can reset an actual member from its own organization; tokens are one-use.
    x = await request('/api/v1/admin/password-reset', {
      method: 'POST',
      body: JSON.stringify({ userId: memberId })
    }, ownerCookie);
    assert.equal(x.response.status, 201, JSON.stringify(x.data));
    assert.ok(x.data.resetToken);
    x = await request('/api/v1/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ resetToken: x.data.resetToken, password: 'Reset-member-strong-2026' })
    });
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.reset, true);

    x = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'member-a@acceptance.example.test', password: 'Reset-member-strong-2026' })
    });
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    expectCookieSecurity(x.response);
    memberCookie = cookieFrom(x.response);
    x = await request('/api/v1/control-plane/safe-mode', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, reason: 'member-scope-negative-test' })
    }, memberCookie);
    assert.equal(x.response.status, 403);

    x = await request('/api/v1/control-plane/recovery-bundle', {}, memberCookie);
    assert.equal(x.response.status, 403);

    // Safe Mode is tenant-scoped, and an authenticated owner can set and clear it.
    x = await request('/api/v1/control-plane/safe-mode', {}, ownerCookie);
    assert.equal(x.response.status, 200);
    assert.equal(x.data.enabled, false);
    x = await request('/api/v1/control-plane/safe-mode', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, reason: 'acceptance-only-toggle' })
    }, ownerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.enabled, true);

    x = await request('/api/v1/control-plane/safe-mode', {}, otherOwnerCookie);
    assert.equal(x.response.status, 200);
    assert.equal(x.data.enabled, false, 'tenant B Safe Mode must not inherit tenant A state');

    x = await request('/api/v1/control-plane/safe-mode', {
      method: 'POST',
      body: JSON.stringify({ enabled: false, reason: 'acceptance-test-cleanup' })
    }, ownerCookie);
    assert.equal(x.response.status, 200);
    assert.equal(x.data.enabled, false);

    // Recovery bundle is downloadable, verifiable and tamper-evident without restore writes.
    x = await request('/api/v1/control-plane/recovery-bundle', {}, ownerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.match(String(x.response.headers.get('content-disposition')), /opscore-recovery-bundle\.json/i);
    const bundle = x.data;
    assert.equal(bundle.schemaVersion, 'opscore.recovery-bundle.v1');
    assert.equal(bundle.export.organizationId, orgAId);

    x = await request('/api/v1/control-plane/recovery-bundle/verify', {
      method: 'POST',
      body: JSON.stringify({ bundle })
    }, ownerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.valid, true);
    assert.equal(x.data.importMode, 'dry_run_only');

    const tampered = JSON.parse(JSON.stringify(bundle));
    const rows = tampered.export.tables.customers.rows;
    assert.ok(rows.length > 0, 'test bundle should include the synthetic customer');
    rows[0].name = 'TAMPERED ACCEPTANCE DATA';
    x = await request('/api/v1/control-plane/recovery-bundle/verify', {
      method: 'POST',
      body: JSON.stringify({ bundle: tampered })
    }, ownerCookie);
    assert.equal(x.response.status, 200);
    assert.equal(x.data.valid, false);

    // Tenant B recovery data must never include tenant A's customer.
    x = await request('/api/v1/control-plane/recovery-bundle', {}, otherOwnerCookie);
    assert.equal(x.response.status, 200, JSON.stringify(x.data));
    assert.equal(x.data.export.organizationId, otherOrgId);
    assert.equal(x.data.export.tables.customers.rows.some(row => row.name === 'Tenant A Private Customer'), false);

    // Logout revokes the real server-side session and clears the HttpOnly cookie.
    x = await request('/api/v1/auth/logout', { method: 'POST' }, ownerCookie);
    assert.equal(x.response.status, 200);
    assert.match(String(x.response.headers.get('set-cookie')), /Max-Age=0/i);
    x = await request('/api/v1/me', {}, ownerCookie);
    assert.equal(x.response.status, 401);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
