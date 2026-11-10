'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDomainEvent } = require('../src/operation-envelope');

test('domain event contract is immutable-shaped and contains causality fields', () => {
  const e = makeDomainEvent({eventId:'evt_1', eventType:'work_order.created', organizationId:'org_1', aggregateType:'work_order', aggregateId:'wo_1', correlationId:'req_1', causationId:'op_1', occurredAt:'2026-09-17T00:00:00.000Z'});
  assert.equal(e.schemaVersion, 'opscore.domain-event.v1');
  assert.equal(e.organizationId, 'org_1');
  assert.equal(e.aggregateId, 'wo_1');
  assert.equal(e.correlationId, 'req_1');
  assert.equal(e.causationId, 'op_1');
  assert.equal(Object.isFrozen(e), true);
});

test('domain event contract gate is PASS', () => {
  const p = path.join(__dirname, '../docs/DOMAIN_EVENT_CONTRACT_GATE_RESULT.json');
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(r.decision, 'PASS');
  assert.ok(r.checks.every(x => x.pass));
});
