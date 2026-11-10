'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvelope, makeDomainEvent, requestHash, validCorrelationId} = require('../src/operation-envelope');
const {openDb} = require('../src/db');
const {Store} = require('../src/store');

test('operation envelope is deterministic and validates correlation ids', () => {
  assert.equal(validCorrelationId('req_123'), 'req_123');
  assert.equal(validCorrelationId('bad value'), null);
  const a = makeEnvelope({id:'op_1',organizationId:'org_1',actorUserId:'usr_1',operation:'work_order_update',correlationId:'req_123',startedAt:'2026-09-17T00:00:00.000Z',requestHashSha256:requestHash({a:1})});
  assert.equal(a.schemaVersion, 'opscore.operation-envelope.v1');
  assert.equal(a.status, 'started');
});

test('domain event has explicit version and causation context', () => {
  const e = makeDomainEvent({eventId:'evt_1',eventType:'work_order.status_changed',eventVersion:1,organizationId:'org_1',aggregateType:'work_order',aggregateId:'wo_1',correlationId:'req_1',causationId:'op_1',occurredAt:'2026-09-17T00:00:00.000Z'});
  assert.equal(e.schemaVersion, 'opscore.domain-event.v1');
  assert.equal(e.eventVersion, 1);
  assert.equal(e.causationId, 'op_1');
});

test('idempotent write records a committed operation envelope atomically', () => {
  const db = openDb(':memory:');
  const store = new Store(db);
  const ctx = {organizationId:'org_x', userId:'usr_x', role:'owner', correlationId:'req_test', source:'api', causationId:null};
  db.prepare('INSERT INTO organizations VALUES (?,?,?)').run('org_x','Org','2026-09-17T00:00:00.000Z');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('usr_x','x@example.com','hash','active','2026-09-17T00:00:00.000Z');
  const out = store.idempotentWrite(ctx,'test_operation','idem-1',{workOrderId:'wo-1', value:1},()=>({ok:true}));
  assert.equal(out.__idempotent,false);
  const env = db.prepare('SELECT * FROM operation_envelopes WHERE id=?').get(out.operationEnvelopeId);
  assert.equal(env.status,'committed');
  assert.equal(env.correlation_id,'req_test');
  assert.equal(env.resource_type,'work_order');
  db.close();
});
