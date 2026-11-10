// Regression test for the API-key scope-enforcement gap found during audit:
// several mutating endpoints called store methods that only checked
// requireRole(ctx.role,'write') — which always passes for API-key contexts
// (role is hardcoded to 'member') — without the router-level requireScope()
// check. A 'read'-only API key could therefore perform writes on those
// endpoints. This test spins up the real HTTP server and asserts a
// read-only key is rejected (403 API_KEY_SCOPE_FORBIDDEN) on every endpoint
// that was previously vulnerable.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function freePort() {
  return 20000 + Math.floor(Math.random() * 20000);
}

async function waitForHealth(base, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('server did not become healthy in time');
}

test('a read-only API key cannot perform writes on previously-unguarded endpoints', async (t) => {
  const dbPath = path.join(os.tmpdir(), `opscore-scopetest-${crypto.randomUUID()}.db`);
  const port = freePort();
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      SQLITE_PATH: dbPath,
      NODE_ENV: 'development',
      OPSC_WEBHOOK_ENCRYPTION_KEY: 'a'.repeat(32),
    },
    stdio: 'ignore',
  });

  t.after(() => {
    child.kill();
    for (const p of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) { try { fs.unlinkSync(p); } catch {} }
  });

  await waitForHealth(base);

  // Bootstrap an org/owner and log in.
  const email = 'owner@example.com', password = 'Owner-strong-pass-2026';
  await fetch(`${base}/api/v1/auth/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgName: 'Tenant', email, password }) });
  const loginRes = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const authHeaders = { 'content-type': 'application/json', cookie };

  // Seed a customer, site and work order as the owner (session-authenticated, full write access).
  const customer = await (await fetch(`${base}/api/v1/customers`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'Acme' }) })).json();
  const workOrder = await (await fetch(`${base}/api/v1/work-orders`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ title: 'Test WO', customerId: customer.id }) })).json();

  // Create a READ-ONLY API key.
  const keyRes = await (await fetch(`${base}/api/v1/api-keys`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'readonly', scopes: ['read'] }) })).json();
  const roHeaders = { 'content-type': 'application/json', authorization: `Bearer ${keyRes.secret}` };

  const attempts = [
    ['POST', '/api/v1/appointments', { workOrderId: workOrder.id, technicianId: 'nope', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() }],
    ['POST', '/api/v1/inventory/receive', { partId: 'nope', locationId: 'nope', quantity: 1 }],
    ['POST', '/api/v1/work-order-parts/reserve', { workOrderId: workOrder.id, partId: 'nope', locationId: 'nope', quantity: 1 }],
    ['POST', '/api/v1/work-order-signoffs', { workOrderId: workOrder.id, signerName: 'x', acknowledgement: 'y' }],
    ['POST', '/api/v1/sync', { events: [] }],
    ['POST', `/api/v1/assets/whatever/events`, { eventType: 'note' }],
    ['POST', '/api/v1/import/customers.json', []],
    ['POST', '/api/v1/import/customers', { csv: 'name\nX' }],
    ['POST', '/api/v1/contracts', { customerId: customer.id, name: 'x', startsAt: new Date().toISOString() }],
    ['POST', '/api/v1/warranties', { assetId: 'nope' }],
    ['POST', '/api/v1/maintenance-plans', { assetId: 'nope' }],
    ['POST', '/api/v1/maintenance/evaluate', {}],
    ['POST', '/api/v1/safety-acknowledgements', { checklistId: 'nope', workOrderId: workOrder.id, answers: [] }],
    ['POST', '/api/v1/escalations/evaluate', {}],
    ['POST', '/api/v1/procedure-runs', { procedureId: 'nope', workOrderId: workOrder.id }],
    ['POST', '/api/v1/usage', { metric: 'api_calls', quantity: 1 }],
    ['POST', '/api/v1/technicians', { userId: 'nope' }],
    ['POST', '/api/v1/technicians/skills', { userId: 'nope', skill: 'x' }],
    ['PUT', `/api/v1/work-orders/${workOrder.id}/financials`, { revenue: 10 }],
    ['POST', '/api/v1/control-tower/actions', { action: 'reassign_work_order', workOrderId: workOrder.id, technicianId: 'nope' }],
    ['POST', '/api/v1/webhook-deliveries/deliver', { deliveryId: 'nope' }],
  ];

  for (const [method, urlPath, payload] of attempts) {
    const r = await fetch(`${base}${urlPath}`, { method, headers: roHeaders, body: JSON.stringify(payload) });
    const body = await r.json().catch(() => ({}));
    assert.equal(r.status, 403, `${method} ${urlPath} should be 403, got ${r.status} ${JSON.stringify(body)}`);
    assert.equal(body?.error?.code, 'API_KEY_SCOPE_FORBIDDEN', `${method} ${urlPath} should report API_KEY_SCOPE_FORBIDDEN, got ${JSON.stringify(body)}`);
  }

  // Sanity check: the same read-only key can still read.
  const readCheck = await fetch(`${base}/api/v1/work-orders`, { headers: roHeaders });
  assert.equal(readCheck.status, 200);
  const exportReadCheck = await fetch(`${base}/api/v1/export/customers.csv`, { headers: roHeaders });
  assert.equal(exportReadCheck.status, 200);
  const writeOnlyRes = await (await fetch(`${base}/api/v1/api-keys`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'write-only', scopes: ['write'] }) })).json();
  const woHeaders = { 'content-type': 'application/json', authorization: `Bearer ${writeOnlyRes.secret}` };
  const exportWithoutRead = await fetch(`${base}/api/v1/export/work-orders.csv`, { headers: woHeaders });
  assert.equal(exportWithoutRead.status, 403);
  const exportWithoutReadBody = await exportWithoutRead.json();
  assert.equal(exportWithoutReadBody?.error?.code, 'API_KEY_SCOPE_FORBIDDEN');

  // Sanity check: a write-scoped key IS allowed through (proves we didn't just break everything).
  const wKeyRes = await (await fetch(`${base}/api/v1/api-keys`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'writer', scopes: ['read', 'write'] }) })).json();
  const wHeaders = { 'content-type': 'application/json', authorization: `Bearer ${wKeyRes.secret}` };
  const usageOk = await fetch(`${base}/api/v1/usage`, { method: 'POST', headers: wHeaders, body: JSON.stringify({ metric: 'api_calls', quantity: 1 }) });
  assert.equal(usageOk.status, 200);
});

test('login is throttled after repeated failed attempts', async () => {
  const dbPath = path.join(os.tmpdir(), `opscore-throttletest-${crypto.randomUUID()}.db`);
  const port = freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SQLITE_PATH: dbPath, NODE_ENV: 'development' },
    stdio: 'ignore',
  });
  try {
    await waitForHealth(base);
    const email = 'owner2@example.com', password = 'Owner-strong-pass-2026';
    await fetch(`${base}/api/v1/auth/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgName: 'Tenant', email, password }) });
    let last;
    for (let i = 0; i < 9; i++) {
      last = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) });
    }
    assert.equal(last.status, 429);
    // Even the correct password is now rejected until the lockout window passes.
    const correct = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(correct.status, 429);
  } finally {
    child.kill();
    for (const p of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) { try { fs.unlinkSync(p); } catch {} }
  }
});

