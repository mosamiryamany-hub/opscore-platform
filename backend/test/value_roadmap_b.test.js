'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');

function fixture() {
  const p = path.join(os.tmpdir(), `opscore-b-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-b-files-${crypto.randomUUID()}`);
  process.env.OPSC_REPOSITORY_PATH = filesDir;
  return { db, p, filesDir };
}
function close(f) {
  f.db.close();
  for (const x of [f.p, `${f.p}-shm`, `${f.p}-wal`]) try { fs.unlinkSync(x); } catch {}
  try { fs.rmSync(f.filesDir, { recursive: true, force: true }); } catch {}
}

test('B1 daily planning board schema', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'B Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const board = s.dailyPlanningBoard(o);
    assert.equal(board.schemaVersion, 'opscore.daily-planning-board.v1');
    assert.ok(board.counts);
    assert.ok(Array.isArray(board.delayed));
    assert.ok(Array.isArray(board.scheduleGaps));
  } finally { close(f); }
});

test('B2 reschedule requires reason and logs activity', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'B Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    s.upsertTechnician(o, { userId: o.userId, latitude: 24.7, longitude: 46.6, active: true });
    const wo = s.createWorkOrder(o, { title: 'Reschedule WO', description: 'x' });
    const start = new Date();
    const end = new Date(start.getTime() + 3600000);
    const appt = s.createAppointment(o, {
      workOrderId: wo.id,
      technicianId: o.userId,
      startAt: start.toISOString(),
      endAt: end.toISOString()
    });
    assert.throws(() => s.rescheduleAppointment(o, appt.id, { startAt: start.toISOString(), endAt: end.toISOString() }), /RESCHEDULE_REASON/);
    const nextStart = new Date(start.getTime() + 7200000);
    const nextEnd = new Date(nextStart.getTime() + 3600000);
    const out = s.rescheduleAppointment(o, appt.id, {
      startAt: nextStart.toISOString(),
      endAt: nextEnd.toISOString(),
      reason: 'Customer requested later window'
    });
    assert.equal(out.schemaVersion, 'opscore.appointment-reschedule.v1');
    assert.match(out.reason, /Customer/);
    const acts = f.db.prepare(`SELECT event_type FROM activity_log WHERE organization_id=? AND event_type='appointment_rescheduled'`).all(o.organizationId);
    assert.ok(acts.length >= 1);
  } finally { close(f); }
});

test('B4 work pack and B6 search', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'B Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const c = s.createCustomer(o, { name: 'Searchable Customer Co' });
    const wo = s.createWorkOrder(o, { title: 'Pack WO', description: 'x', customerId: c.id });
    const pack = s.technicianWorkPack(o, wo.id);
    assert.equal(pack.schemaVersion, 'opscore.technician-work-pack.v1');
    assert.ok(pack.nextStep);
    const found = s.unifiedSearch(o, 'Searchable');
    assert.equal(found.schemaVersion, 'opscore.unified-search.v1');
    assert.ok(found.customers.length >= 1);
    const pm = s.listPreventiveMaintenanceTemplates(o);
    assert.equal(pm.schemaVersion, 'opscore.pm-templates.v1');
    const map2 = s.dispatcherMapWithSiteDistance(o);
    assert.equal(map2.schemaVersion, 'opscore.dispatcher-map.v2');
    assert.equal(map2.note.includes('Road ETA'), true);
  } finally { close(f); }
});
