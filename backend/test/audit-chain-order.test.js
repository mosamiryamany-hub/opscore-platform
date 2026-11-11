'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { audit, verifyAuditChain } = require('../src/audit');

function createAuditDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL
    )
  `);
  return db;
}

test('audit chain remains valid when wall-clock timestamps collide', () => {
  const db = createAuditDb();
  const RealDate = global.Date;
  const fixedTime = '2026-11-11T00:30:00.000Z';

  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }
    static now() {
      return new RealDate(fixedTime).getTime();
    }
  }

  try {
    global.Date = FixedDate;
    for (let i = 0; i < 12; i++) {
      audit(db, {
        organizationId: 'org_test',
        actorUserId: 'usr_test',
        action: 'audit-chain-order-test',
        resourceType: 'test',
        resourceId: String(i),
        metadata: { index: i }
      });
    }

    const result = verifyAuditChain(db, 'org_test');
    assert.deepEqual(result, { valid: true, checked: 12 });
    const timestamps = db.prepare('SELECT created_at FROM audit_log WHERE organization_id=? ORDER BY created_at ASC').all('org_test').map(row => Date.parse(row.created_at));
    assert.equal(timestamps.length, 12);
    assert.ok(timestamps.every((value, index) => index === 0 || value > timestamps[index - 1]));
  } finally {
    global.Date = RealDate;
    db.close();
  }
});

test('audit chain verifier rejects a fork instead of selecting an arbitrary branch', () => {
  const db = createAuditDb();
  try {
    db.prepare(`INSERT INTO audit_log
      (id, organization_id, action, resource_type, metadata_json, created_at, previous_hash, event_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'a', 'org_test', 'one', 'test', '{}', '2026-11-11T00:30:00.000Z', '', 'hash-a'
    );
    db.prepare(`INSERT INTO audit_log
      (id, organization_id, action, resource_type, metadata_json, created_at, previous_hash, event_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'b', 'org_test', 'two', 'test', '{}', '2026-11-11T00:30:00.000Z', '', 'hash-b'
    );

    const result = verifyAuditChain(db, 'org_test');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'AUDIT_CHAIN_FORKED');
  } finally {
    db.close();
  }
});
