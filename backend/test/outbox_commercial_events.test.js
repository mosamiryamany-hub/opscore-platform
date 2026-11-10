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
  const p = path.join(os.tmpdir(), `opscore-outbox-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-outbox-files-${crypto.randomUUID()}`);
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

test('B2: commercial actions emit durable outbox events', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Outbox Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const c = s.createCustomer(o, { name: 'Acme' });
    const est = s.createEstimate(o, {
      customerId: c.id,
      currency: 'SAR',
      lines: [{ description: 'Visit', quantity: 1, unitPrice: 100 }]
    });
    s.updateEstimateStatus(o, est.id, 'sent');
    s.updateEstimateStatus(o, est.id, 'accepted');
    const inv = s.createInvoice(o, {
      customerId: c.id,
      estimateId: est.id,
      currency: 'SAR'
    });
    const types = f.db
      .prepare('SELECT event_type FROM integration_outbox WHERE organization_id=? ORDER BY created_at')
      .all(o.organizationId)
      .map((x) => x.event_type);
    assert.ok(types.includes('estimate.created'), types.join(','));
    assert.ok(types.includes('estimate.status_changed'), types.join(','));
    assert.ok(types.includes('invoice.created'), types.join(','));
    const cat = s.outboxEventCatalog(o);
    assert.equal(cat.schemaVersion, 'opscore.outbox-event-catalog.v1');
    assert.ok(cat.events.some((e) => e.type === 'invoice.payment_recorded'));
  } finally {
    close(f);
  }
});
