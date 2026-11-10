'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const { providerStatus } = require('../src/adapters/notifications');

function fixture() {
  const p = path.join(os.tmpdir(), `opscore-ndm-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-ndm-files-${crypto.randomUUID()}`);
  const prev = process.env.OPSC_REPOSITORY_PATH;
  process.env.OPSC_REPOSITORY_PATH = filesDir;
  return { db, p, filesDir, prev };
}
function close(f) {
  f.db.close();
  for (const x of [f.p, `${f.p}-shm`, `${f.p}-wal`]) try { fs.unlinkSync(x); } catch {}
  try { fs.rmSync(f.filesDir, { recursive: true, force: true }); } catch {}
  if (f.prev === undefined) delete process.env.OPSC_REPOSITORY_PATH;
  else process.env.OPSC_REPOSITORY_PATH = f.prev;
}

test('REQ-01: notification adapters report not configured by default (fail-closed)', () => {
  // Ensure clean env for this assertion
  const keys = [
    'OPSC_NOTIFY_EMAIL_PROVIDER',
    'OPSC_NOTIFY_EMAIL_API_KEY',
    'OPSC_NOTIFY_SMS_PROVIDER',
    'OPSC_NOTIFY_WHATSAPP_PROVIDER'
  ];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const st = providerStatus();
    assert.equal(st.email.provider, 'none');
    assert.equal(st.email.configured, false);
    assert.equal(st.sms.configured, false);
    assert.equal(st.whatsapp.configured, false);
    assert.match(st.note, /Buyer-environment/);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('REQ-01: deliverNotificationExternal fails closed without credentials', async () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'N Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    // create in-app notification row via internal path if available
    const nid = 'ntf_test_1';
    f.db.prepare(
      `INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(nid, o.organizationId, o.userId, 'email', 'test.event', 'Title', 'Body', 'queued', new Date().toISOString(), null);
    await assert.rejects(
      () => s.deliverNotificationExternal(o, nid, { channel: 'email', to: 'x@example.com' }),
      /EMAIL_PROVIDER/
    );
  } finally {
    close(f);
  }
});

test('REQ-04: dispatcherMap returns only technicians with stored check-in coordinates', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Map Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const empty = s.dispatcherMap(o);
    assert.equal(empty.schemaVersion, 'opscore.dispatcher-map.v1');
    assert.equal(empty.continuousTracking, false);
    assert.equal(empty.source, 'last_appointment_checkin_only');
    assert.equal(empty.pointCount, 0);

    // cross-tenant isolation: second org cannot see first org points (none yet)
    const f2 = fixture(), s2 = new Store(f2.db, { sessionTtlHours: 24 });
    try {
      s2.bootstrap({ orgName: 'Other', email: 'other@example.com', password: 'Strong-pass-2026' });
      const other = s2.login('other@example.com', 'Strong-pass-2026');
      assert.equal(s2.dispatcherMap(other).pointCount, 0);
    } finally {
      close(f2);
    }
  } finally {
    close(f);
  }
});

test('REQ-04: member role cannot read dispatcherMap', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Map Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const owner = s.login('owner@example.com', 'Strong-pass-2026');
    const inv = s.inviteMember(owner, { email: 'member@example.com', role: 'member' });
    s.acceptInvitation(inv.inviteToken, { password: 'Member-strong-pass-2026', name: 'Member' });
    const member = s.login('member@example.com', 'Member-strong-pass-2026');
    assert.throws(() => s.dispatcherMap(member), /FORBIDDEN/);
  } finally {
    close(f);
  }
});
