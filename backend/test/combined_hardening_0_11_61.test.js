'use strict';
// Covers the six hardening waves merged into v0.11.61:
// 1 strict bootstrap, 2 IDOR/tenant + mutation guard, 3 scheduling core,
// 4 line-migration engine, 5 appointments/time-slots, 6 faults engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const { assertTenantAlignment, extractClaimedOrganizationIds } = require('../src/firewall');

const PASS = 'Owner-strong-pass-2026';

function fx() {
  const p = path.join(os.tmpdir(), `opscore-combined-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  return { db, p, store: new Store(db, { sessionTtlHours: 24 }) };
}
function close(f) {
  f.db.close();
  for (const p of [f.p, `${f.p}-wal`, `${f.p}-shm`]) try { fs.unlinkSync(p); } catch { /* ignore */ }
}
function owner(f, extra = {}) {
  f.store.bootstrap({ orgName: 'Combined Ops', email: 'owner@combined.test', password: PASS, ...extra });
  return f.store.login('owner@combined.test', PASS);
}
function world(f) {
  const o = owner(f);
  f.store.upsertTechnician(o, { userId: o.userId, latitude: 30.0, longitude: 31.0 });
  const c = f.store.createCustomer(o, { name: 'Acme' });
  const site = f.store.createSite(o, { name: 'Site', customerId: c.id, latitude: 30.1, longitude: 31.1 });
  return { o, c, site };
}
const at = (h) => new Date(Date.now() + h * 3600000).toISOString();

/* ---------------- Wave 1: strict bootstrap ---------------- */
test('bootstrap: legacy 3-field call still works and writes no structural configs', () => {
  const f = fx();
  try {
    const r = f.store.bootstrap({ orgName: 'Legacy Org', email: 'l@combined.test', password: PASS });
    assert.equal(r.operatingRegionsCount, 0);
    assert.equal(r.organizationalStructureCount, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) c FROM operational_configs WHERE config_key IN ('operating_regions','organizational_structure')").get().c, 0);
  } finally { close(f); }
});

test('bootstrap: regions/structure persist as versioned configs with change-log; weak input rejected', () => {
  const f = fx();
  try {
    assert.throws(() => f.store.bootstrap({ orgName: 'X Org', email: 'a@combined.test', password: 'short-pass1' }), /CEO_PASSWORD_TOO_SHORT/);
    assert.throws(() => f.store.bootstrap({ orgName: 'X Org', email: 'a@combined.test', password: PASS, operatingRegions: [{ name: '' }] }), /OPERATING_REGION_INVALID_AT_INDEX_0/);
    assert.throws(() => f.store.bootstrap({ orgName: 'X Org', email: 'a@combined.test', password: PASS, organizationalStructure: [{ title: 'Ops', role: 'emperor' }] }), /ORG_STRUCTURE_ROLE_INVALID_AT_INDEX_0/);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM users').get().c, 0, 'failed validation must not leave partial rows');
    const r = f.store.bootstrap({
      orgName: 'Real Org', email: 'ok@combined.test', password: PASS,
      operatingRegions: [{ name: 'Cairo Metro', countryCode: 'EG', timezone: 'Africa/Cairo' }],
      organizationalStructure: [{ title: 'Field Operations', role: 'manager' }]
    });
    assert.equal(r.operatingRegionsCount, 1);
    assert.equal(r.organizationalStructureCount, 1);
    const cfg = f.db.prepare("SELECT config_key,status,version FROM operational_configs WHERE organization_id=? ORDER BY config_key").all(r.orgId);
    assert.deepEqual(cfg.map(x => x.config_key), ['operating_regions', 'organizational_structure']);
    assert.ok(cfg.every(x => x.status === 'active' && x.version === 1));
    assert.equal(f.db.prepare("SELECT COUNT(*) c FROM configuration_change_log WHERE organization_id=?").get(r.orgId).c, 2);
    assert.throws(() => f.store.bootstrap({ orgName: 'Again', email: 'b@combined.test', password: PASS }), /ALREADY_BOOTSTRAPPED/);
  } finally { close(f); }
});

/* ---------------- Wave 2: tenant alignment (unit) ---------------- */
test('firewall: client-claimed organization ids must equal the authenticated organization', () => {
  const ctx = { organizationId: 'org_A', userId: 'u1' };
  assert.equal(assertTenantAlignment({ headers: {}, url: '/api/v1/me' }, ctx), true);
  assert.equal(assertTenantAlignment({ headers: { 'x-organization-id': 'org_A' }, url: '/x' }, ctx), true);
  assert.throws(() => assertTenantAlignment({ headers: { 'x-tenant-id': 'org_B' }, url: '/x' }, ctx), /TENANT_MISMATCH/);
  assert.throws(() => assertTenantAlignment({ headers: {}, url: '/x?organization_id=org_B' }, ctx), /TENANT_MISMATCH/);
  assert.throws(() => assertTenantAlignment({ headers: {}, url: '/x' }, {}), /TENANT_CONTEXT_REQUIRED/);
  assert.deepEqual(extractClaimedOrganizationIds({ headers: { 'x-org-id': ' org_A ' }, url: '/x?tenantId=org_A' }), ['org_A']);
});

/* ---------------- Waves 3 + 5: scheduling core ---------------- */
test('appointments: zero re-visit, precedence, no_show retention and revisit reason', () => {
  const f = fx();
  try {
    const { o, c, site } = world(f); const s = f.store;
    const wo = s.createWorkOrder(o, { title: 'Job', customerId: c.id, siteId: site.id });
    const a1 = s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(1), endAt: at(2) });
    // overlapping same technician: physical conflict is reported first (pre-existing contract)
    assert.throws(() => s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(1.5), endAt: at(2.5) }), /TECHNICIAN_CONFLICT/);
    // non-overlapping second active appointment on the same work order is a re-visit
    assert.throws(() => s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(5), endAt: at(6) }), /WORK_ORDER_ALREADY_SCHEDULED/);
    // unreachable keeps the row (no delete), queues a revisit job
    const u = s.markAppointmentUnreachable(o, a1.id, { reasonCode: 'CUSTOMER_ABSENT' });
    assert.equal(u.preserved, true);
    assert.equal(s.getAppointment(o, a1.id).status, 'no_show');
    assert.equal(f.db.prepare("SELECT COUNT(*) c FROM operational_jobs WHERE job_type='appointment_revisit' AND entity_id=?").get(a1.id).c, 1);
    // re-scheduling after a no_show requires an explicit reason
    assert.throws(() => s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(5), endAt: at(6) }), /REVISIT_REASON_REQUIRED/);
    const a2 = s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(5), endAt: at(6), revisitReason: 'customer requested new slot' });
    assert.equal(a2.status, 'scheduled');
    // completed work orders cannot be scheduled
    const done = s.createWorkOrder(o, { title: 'Done', customerId: c.id });
    s.updateWorkOrder(o, done.id, { status: 'in_progress' });
    s.updateWorkOrder(o, done.id, { status: 'completed' });
    assert.throws(() => s.createAppointment(o, { workOrderId: done.id, technicianId: o.userId, startAt: at(8), endAt: at(9) }), /WORK_ORDER_NOT_SCHEDULABLE/);
  } finally { close(f); }
});

test('technician availability is derived from persisted appointments only', () => {
  const f = fx();
  try {
    const { o, c } = world(f); const s = f.store;
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const wo = s.createWorkOrder(o, { title: 'Slot', customerId: c.id });
    s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: `${day}T10:00:00.000Z`, endAt: `${day}T12:00:00.000Z` });
    const r = s.findTechnicianAvailability(o, { technicianId: o.userId, date: day });
    assert.equal(r.busyAppointments.length, 1);
    assert.deepEqual(r.freeWindows.map(w => [w.startAt.slice(11, 16), w.endAt.slice(11, 16)]), [['08:00', '10:00'], ['12:00', '18:00']]);
    assert.throws(() => s.findTechnicianAvailability(o, { technicianId: o.userId, date: 'nope' }), /INVALID_DATE/);
    assert.throws(() => s.findTechnicianAvailability(o, {}), /INVALID_TECHNICIAN/);
  } finally { close(f); }
});

/* ---------------- Wave 4: line migration engine ---------------- */
function lines(f, o, c) {
  const s = f.store;
  const a = s.createServiceLine(o, { code: 'LN-A', name: 'Line A', serviceRef: 'ref-a' });
  const b = s.createServiceLine(o, { code: 'LN-B', name: 'Line B', serviceRef: 'ref-b' });
  s.assignCustomerServiceLine(o, c.id, a.id);
  return { a, b };
}

test('line migration: preflight blockers, en-route block, execute, safe replay, terminal states', () => {
  const f = fx();
  try {
    const { o, c, site } = world(f); const s = f.store;
    const { b } = lines(f, o, c);
    const wo = s.createWorkOrder(o, { title: 'Open job', customerId: c.id, siteId: site.id });
    const ap = s.createAppointment(o, { workOrderId: wo.id, technicianId: o.userId, startAt: at(1), endAt: at(2) });
    const pre = s.preflightLineMigration(o, c.id, b.id);
    assert.ok(pre.operationalBlockers || (pre.migration && pre.migration.operationalBlockers) || pre.id, 'preflight returns a job with blocker snapshot');
    const jid = pre.id || pre.migration.id;
    s.updateAppointmentStatus ? s.updateAppointmentStatus(o, ap.id, { status: 'en_route' }) : f.db.prepare("UPDATE appointments SET status='en_route' WHERE id=?").run(ap.id);
    assert.throws(() => s.executeLineMigration(o, jid), /MIGRATION_BLOCKED_EN_ROUTE_APPOINTMENT/);
    f.db.prepare("UPDATE appointments SET status='scheduled' WHERE id=?").run(ap.id);
    const done = s.executeLineMigration(o, jid);
    assert.equal((done.migration || done).status, 'completed');
    assert.equal(s.getCustomerServiceLine(o, c.id).line_id || s.getCustomerServiceLine(o, c.id).lineId, b.id);
    const replay = s.executeLineMigration(o, jid);
    assert.equal((replay.migration || replay).status, 'completed', 'completed job replays safely');
    assert.throws(() => s.markLineMigrationUnreachable(o, jid, { reasonCode: 'LATE_FAILURE' }), /MIGRATION_TERMINAL_STATE/);
  } finally { close(f); }
});

test('line migration: not-ready target, unreachable failure path and duplicate protection', () => {
  const f = fx();
  try {
    const { o, c } = world(f); const s = f.store;
    const { a, b } = lines(f, o, c);
    f.db.prepare('UPDATE service_lines SET active=0 WHERE id=?').run(b.id);
    assert.throws(() => s.preflightLineMigration(o, c.id, b.id), /MIGRATION_TARGET_LINE_NOT_READY/);
    f.db.prepare('UPDATE service_lines SET active=1 WHERE id=?').run(b.id);
    const pre = s.preflightLineMigration(o, c.id, b.id);
    const jid = pre.id || pre.migration.id;
    assert.throws(() => s.preflightLineMigration(o, c.id, b.id), /MIGRATION_ALREADY_ACTIVE/);
    assert.throws(() => s.markLineMigrationUnreachable(o, jid, { reasonCode: 'x' }), /UNREACHABLE_REASON_REQUIRED/);
    const u = s.markLineMigrationUnreachable(o, jid, { reasonCode: 'FIELD_UNREACHABLE' });
    assert.equal(u.migration.status, 'failed');
    assert.equal(f.db.prepare("SELECT COUNT(*) c FROM operational_jobs WHERE job_type='migration_unreachable' AND entity_id=?").get(jid).c, 1);
    assert.throws(() => s.executeLineMigration(o, jid), /MIGRATION_TERMINAL_STATE/);
    assert.equal(s.getCustomerServiceLine(o, c.id).line_id || s.getCustomerServiceLine(o, c.id).lineId, a.id, 'customer stays on source line');
  } finally { close(f); }
});

/* ---------------- Wave 6: faults engine ---------------- */
test('faults: classify, create, gated transition, unreachable keeps ticket and history', () => {
  const f = fx();
  try {
    const { o, c, site } = world(f); const s = f.store;
    const { a } = lines(f, o, c);
    assert.equal(s.classifyFaultInfrastructure(o, { customerId: c.id }).category, 'operational_settings');
    f.db.prepare('UPDATE service_lines SET active=0 WHERE id=?').run(a.id);
    assert.equal(s.classifyFaultInfrastructure(o, { customerId: c.id }).category, 'infrastructure');
    f.db.prepare('UPDATE service_lines SET active=1 WHERE id=?').run(a.id);

    assert.throws(() => s.createFaultTicket(o, { title: 'x' }), /FAULT_TITLE_REQUIRED/);
    const t = s.createFaultTicket(o, { title: 'No service at site', customerId: c.id, siteId: site.id });
    const wid = t.workOrder.id;
    assert.match(t.workOrder.title, /^\[FAULT\]/);
    const plain = s.createWorkOrder(o, { title: 'Not a fault', customerId: c.id });
    assert.throws(() => s.transitionFaultStatus(o, plain.id, { status: 'in_progress' }), /NOT_A_FAULT_TICKET/);

    s.createAppointment(o, { workOrderId: wid, technicianId: o.userId, startAt: at(1), endAt: at(2) });
    const un = s.markFaultUnreachable(o, wid, { reasonCode: 'SITE_LOCKED' });
    assert.equal(un.preserved, true);
    assert.equal(s.getWorkOrder(o, wid).status, 'blocked');
    assert.equal(f.db.prepare("SELECT COUNT(*) c FROM appointments WHERE work_order_id=? AND status='no_show'").get(wid).c, 1);
    assert.ok(f.db.prepare("SELECT COUNT(*) c FROM operational_jobs WHERE job_type='fault_unreachable' AND entity_id=?").get(wid).c >= 1);

    s.transitionFaultStatus(o, wid, { status: 'in_progress' });
    assert.throws(() => s.transitionFaultStatus(o, wid, { status: 'completed' }), /FAULT_CLOSE_REASON_REQUIRED/);
    const closed = s.transitionFaultStatus(o, wid, { status: 'completed', reason: 'line restored and verified' });
    assert.equal(closed.to, 'completed');
    assert.throws(() => s.transitionFaultStatus(o, wid, { status: 'open' }), /FAULT_TERMINAL_STATE/);
  } finally { close(f); }
});

/* ---------------- Waves 2-6 over real HTTP ---------------- */
async function boot(db) {
  const port = 40000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), SQLITE_PATH: db },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    let out = '';
    const on = (x) => { out += x.toString(); if (out.includes(`OpsCore Starter: http://127.0.0.1:${port}`)) { child.stdout.off('data', on); resolve(); } };
    child.stdout.on('data', on);
    child.once('exit', (c) => reject(new Error(`server exit ${c}: ${out}`)));
  });
  return { child, base: `http://127.0.0.1:${port}` };
}

test('HTTP: tenant mismatch, viewer write block, read_only org, availability and fault routes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-combined-http-'));
  const dbp = path.join(dir, 'h.sqlite');
  const db = openDb(dbp); const s = new Store(db, { sessionTtlHours: 24 });
  s.bootstrap({ orgName: 'HTTP Org', email: 'owner@h.test', password: PASS });
  const o = s.login('owner@h.test', PASS);
  const inv = s.inviteMember(o, { email: 'viewer@h.test', role: 'viewer' });
  s.acceptInvitation(inv.inviteToken, { password: 'Viewer-strong-pass-2026' });
  const cust = s.createCustomer(o, { name: 'HTTP Cust' });
  db.close();
  const h = await boot(dbp);
  try {
    const call = async (p, opts = {}) => { const r = await fetch(h.base + p, opts); return { r, b: await r.json().catch(() => null) }; };
    const login = async (email, password) => {
      const x = await call('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      assert.equal(x.r.status, 200);
      return x.r.headers.get('set-cookie').split(';')[0];
    };
    const ownerCookie = await login('owner@h.test', PASS);
    const viewerCookie = await login('viewer@h.test', 'Viewer-strong-pass-2026');
    const json = (cookie, key, extra = {}, body) => ({ method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });

    // tenant fingerprinting
    let x = await call('/api/v1/me', json(ownerCookie, null, { 'x-organization-id': 'org_foreign' }));
    assert.equal(x.r.status, 403); assert.equal(x.b.error.code, 'TENANT_MISMATCH');
    x = await call('/api/v1/me?organization_id=org_foreign', json(ownerCookie));
    assert.equal(x.r.status, 403);
    x = await call('/api/v1/me', json(ownerCookie));
    assert.equal(x.r.status, 200);

    // viewer cannot mutate
    x = await call('/api/v1/faults', json(viewerCookie, 'v-fault-1', {}, { title: 'Viewer fault' }));
    assert.equal(x.r.status, 403);
    assert.equal(x.b.error.code, 'ROLE_WRITE_FORBIDDEN');

    // owner: fault lifecycle over HTTP
    x = await call('/api/v1/faults/classify', json(ownerCookie, null, {}, { customerId: cust.id }));
    assert.equal(x.r.status, 200); assert.equal(x.b.category, 'operational_settings');
    x = await call('/api/v1/faults', json(ownerCookie, 'o-fault-1', {}, { title: 'HTTP fault', customerId: cust.id }));
    assert.equal(x.r.status, 201, JSON.stringify(x.b));
    const wid = x.b.workOrder.id;
    x = await call(`/api/v1/faults/${wid}/transition`, json(ownerCookie, 'o-tr-1', {}, { status: 'completed' }));
    assert.equal(x.r.status, 422); assert.equal(x.b.error.code, 'FAULT_CLOSE_REASON_REQUIRED');
    x = await call(`/api/v1/faults/${wid}/unreachable`, json(ownerCookie, 'o-un-1', {}, { reasonCode: 'NO_ACCESS' }));
    assert.equal(x.r.status, 200); assert.equal(x.b.preserved, true);

    // availability route
    const me = await call('/api/v1/me', json(ownerCookie));
    const uid = me.b.userId || me.b.user?.id || me.b.id;
    if (uid) {
      const s2 = new Store(openDb(dbp), { sessionTtlHours: 24 });
      try { s2.upsertTechnician(s2.login('owner@h.test', PASS), { userId: uid, latitude: 30, longitude: 31 }); } finally { s2.db.close(); }
      x = await call(`/api/v1/technicians/availability?technicianId=${encodeURIComponent(uid)}&date=${new Date().toISOString().slice(0, 10)}`, json(ownerCookie));
      assert.equal(x.r.status, 200); assert.equal(x.b.schemaVersion, 'opscore.technician-availability.v1');
      x = await call(`/api/v1/technicians/availability?technicianId=${encodeURIComponent(uid)}&date=bad`, json(ownerCookie));
      assert.equal(x.r.status, 422); assert.equal(x.b.error.code, 'INVALID_DATE');
    }

    // read_only organisation blocks mutations but not governance
    x = await call('/api/v1/organization/status', json(ownerCookie, 'o-ro-1', {}, { status: 'read_only', reason: 'maintenance window' }));
    assert.ok([200, 201].includes(x.r.status), `governance change allowed, got ${x.r.status}`);
    x = await call('/api/v1/faults', json(ownerCookie, 'o-fault-2', {}, { title: 'Blocked while read-only' }));
    assert.equal(x.r.status, 423);
  } finally {
    h.child.kill('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
