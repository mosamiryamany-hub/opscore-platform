'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { audit, verifyAuditChain } = require('../src/audit');

test('audit chain follows hash links when multiple events share one timestamp', () => {
  const db = new DatabaseSync(':memory:');
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
  } finally {
    global.Date = RealDate;
    db.close();
  }
});

test('audit chain verifier rejects a fork instead of selecting an arbitrary branch', () => {
  const db = new DatabaseSync(':memory:');
  try {
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
