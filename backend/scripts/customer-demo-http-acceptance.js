'use strict';

const assert = require('node:assert/strict');

const base = String(process.env.OPSC_DEMO_HTTP_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const accounts = [
  { key: 'ADMIN', email: 'admin@demo.opscore.invalid', role: 'owner' },
  { key: 'DISPATCHER', email: 'dispatcher@demo.opscore.invalid', role: 'manager' },
  { key: 'TECHNICIAN', email: 'technician@demo.opscore.invalid', role: 'member' },
  { key: 'VIEWER', email: 'viewer@demo.opscore.invalid', role: 'viewer' }
];

function passwordFor(account) {
  const value = String(process.env['OPSC_DEMO_PASSWORD_' + account.key] || '');
  assert.match(value, /^[a-f0-9]{48,}$/, 'missing generated password for ' + account.key);
  return value;
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(base + path, options);
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { response, body, raw };
}

function setCookie(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const header = values.find(value => value.startsWith('__Host-opscore_session='));
  assert.ok(header, 'login response did not issue the session cookie');
  return header.split(';')[0];
}

function records(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.records)) return body.records;
  return [];
}

async function main() {
  const health = await jsonRequest('/api/health');
  assert.equal(health.response.status, 200, 'health endpoint must return 200');
  assert.equal(health.body?.ok, true, 'health response must be healthy');
  assert.equal(health.body?.engine, 'postgres', 'health response must identify PostgreSQL');

  const unauthenticated = await jsonRequest('/api/v1/me');
  assert.equal(unauthenticated.response.status, 401, 'unauthenticated identity request must be denied');

  // Exercise the general request firewall well beyond the login threshold
  // before any account authenticates. These requests must not consume the
  // separate login-attempt budget for the same source IP.
  for (let index = 0; index < 10; index += 1) {
    const probe = await jsonRequest('/api/v1/me');
    assert.equal(probe.response.status, 401, 'pre-login firewall probe must remain unauthenticated');
  }

  const results = [];
  for (const account of accounts) {
    const login = await jsonRequest('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: base,
        referer: base + '/login'
      },
      body: JSON.stringify({ email: account.email, password: passwordFor(account) })
    });
    assert.equal(login.response.status, 200, 'login failed for role ' + account.role + ': ' + login.raw);
    assert.equal(login.body?.role, account.role, 'unexpected role returned for ' + account.email);
    const cookie = setCookie(login.response);

    const me = await jsonRequest('/api/v1/me', { headers: { cookie } });
    assert.equal(me.response.status, 200, 'authenticated /me failed for ' + account.role);
    assert.equal(me.body?.role, account.role, 'authenticated role mismatch for ' + account.role);

    const customers = await jsonRequest('/api/v1/customers', { headers: { cookie } });
    assert.equal(customers.response.status, 200, 'customer read failed for ' + account.role);
    const customerRows = records(customers.body);
    assert.equal(customerRows.length, 1, 'expected exactly one synthetic demo customer');
    assert.equal(customerRows[0].external_ref, 'DEMO-CUST-001');

    const workOrders = await jsonRequest('/api/v1/work-orders', { headers: { cookie } });
    assert.equal(workOrders.response.status, 200, 'work-order read failed for ' + account.role);
    const workOrderRows = records(workOrders.body);
    assert.equal(workOrderRows.length, 1, 'expected exactly one synthetic demo work order');
    assert.equal(workOrderRows[0].title, 'Inspect the synthetic demo network node');

    if (account.role === 'viewer') {
      const denied = await jsonRequest('/api/v1/customers', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          origin: base,
          referer: base + '/'
        },
        body: JSON.stringify({
          name: 'This write must be denied',
          externalRef: 'DEMO-DENY-001'
        })
      });
      assert.equal(denied.response.status, 403, 'viewer write must be forbidden');
      assert.equal(denied.body?.error?.code, 'ROLE_WRITE_FORBIDDEN', 'viewer denial reason must be explicit');
    }

    const logout = await jsonRequest('/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: base, referer: base + '/' }
    });
    assert.equal(logout.response.status, 200, 'logout failed for ' + account.role);
    const revoked = await jsonRequest('/api/v1/me', { headers: { cookie } });
    assert.equal(revoked.response.status, 401, 'logged-out session must no longer authenticate');

    results.push({ role: account.role, login: 'PASS', tenantScopedReads: 'PASS', logoutRevocation: 'PASS' });
    console.log('DEMO_HTTP_ROLE_ACCEPTANCE=PASS role=' + account.role);
  }

  console.log('DEMO_HTTP_ACCEPTANCE=' + JSON.stringify({
    status: 'PASS',
    health: 'PASS',
    unauthenticatedDenied: 'PASS',
    roles: results,
    viewerWriteDenied: 'PASS',
    sessionRevocation: 'PASS',
    databaseEngine: 'postgres',
    syntheticCustomerCount: 1,
    syntheticWorkOrderCount: 1
  }));
}

main().catch(error => {
  console.error('DEMO_HTTP_ACCEPTANCE_FAILED=' + String(error && error.message || error));
  process.exitCode = 1;
});
