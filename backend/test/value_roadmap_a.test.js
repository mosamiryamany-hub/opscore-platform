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
  const p = path.join(os.tmpdir(), `opscore-vr-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-vr-files-${crypto.randomUUID()}`);
  process.env.OPSC_REPOSITORY_PATH = filesDir;
  return { db, p, filesDir };
}
function close(f) {
  f.db.close();
  for (const x of [f.p, `${f.p}-shm`, `${f.p}-wal`]) try { fs.unlinkSync(x); } catch {}
  try { fs.rmSync(f.filesDir, { recursive: true, force: true }); } catch {}
}

test('A: operations health center returns tenant schema', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'VR Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const h = s.operationsHealthCenter(o);
    assert.equal(h.schemaVersion, 'opscore.operations-health.v1');
    assert.ok(h.database);
    assert.ok(h.outbox);
    assert.ok(h.correlation.header === 'x-correlation-id');
  } finally { close(f); }
});

test('A: why-blocked and verified job record on work order', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'VR Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const wo = s.createWorkOrder(o, { title: 'Gate test', description: 'x' });
    const why = s.whyBlocked(o, wo.id);
    assert.equal(why.schemaVersion, 'opscore.why-blocked.v1');
    assert.ok(typeof why.ready === 'boolean');
    assert.ok(why.summary);
    const vjr = s.verifiedJobRecord(o, wo.id);
    assert.equal(vjr.schemaVersion, 'opscore.verified-job-record.v1');
    assert.equal(vjr.title, 'Verified Job Record');
    const cl = s.workOrderReadableChangelog(o, wo.id);
    assert.equal(cl.schemaVersion, 'opscore.work-order-changelog.v1');
    assert.ok(Array.isArray(cl.entries));
  } finally { close(f); }
});
