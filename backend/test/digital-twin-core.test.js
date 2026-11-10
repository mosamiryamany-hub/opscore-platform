'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTwin, evaluateTelemetry, TwinEventChain, evaluateThresholds } = require('../src/digital-twin-core');

test('digital twin is domain-neutral, canonical and explicitly unverified', () => {
  const a = createTwin({ tenantId:'tenant-1', twinId:'twin-1', entityType:'industrial.pump', createdAt:'2026-10-20T10:00:00Z', state:{z:2,a:1} });
  const b = createTwin({ tenantId:'tenant-1', twinId:'twin-1', entityType:'industrial.pump', createdAt:'2026-10-20T10:00:00Z', state:{a:1,z:2} });
  assert.equal(a.stateHash, b.stateHash);
  assert.equal(a.claims.physicalStateVerified, false);
  assert.equal(a.claims.providerConnected, false);
});
test('tenant, identifier, classification and state size validation fail closed', () => {
  assert.throws(() => createTwin({twinId:'x',entityType:'asset',createdAt:0,state:{}}), /TWIN_TENANT_REQUIRED/);
  assert.throws(() => createTwin({tenantId:'t',twinId:'x',entityType:'asset',createdAt:0,state:{},classification:'secret'}, {maxStateBytes:10}), /TWIN_CLASSIFICATION_INVALID/);
  assert.throws(() => createTwin({tenantId:'t',twinId:'x',entityType:'asset',createdAt:0,state:{large:'12345678901234567890'}}, {maxStateBytes:10}), /TWIN_STATE_TOO_LARGE/);
});
test('telemetry freshness is deterministic and future observations are rejected', () => {
  const result = evaluateTelemetry([{key:'temp',value:21,unit:'C',observedAt:9000},{key:'pressure',value:3,unit:'bar',observedAt:1000}], {maxAgeMs:2000}, 10000);
  assert.equal(result.status, 'DEGRADED'); assert.equal(result.staleCount, 1);
  assert.equal(evaluateTelemetry([{key:'x',value:1,unit:'u',observedAt:20000}], {futureSkewMs:0}, 10000).status, 'REJECT');
  assert.throws(() => evaluateTelemetry([{key:'x',value:1,unit:'u',observedAt:1},{key:'x',value:2,unit:'u',observedAt:1}], {}, 2), /TWIN_OBSERVATION_DUPLICATE/);
});
test('event chain detects altered payloads and duplicate IDs', () => {
  const chain = new TwinEventChain({tenantId:'t1',twinId:'tw1'});
  chain.append({eventId:'e1',occurredAt:1000,type:'inspection.completed',payload:{ok:true}});
  chain.append({eventId:'e2',occurredAt:2000,type:'maintenance.requested',severity:'warning',payload:{reason:'wear'}});
  assert.equal(chain.verify().valid, true);
  assert.throws(() => chain.append({eventId:'e2',occurredAt:3000,type:'x',payload:{}}), /TWIN_EVENT_DUPLICATE/);
  const exported = chain.export(); exported[0].payload.ok = false;
  assert.equal(chain.verify().valid, true, 'export is detached from internal records');
});
test('threshold policy is explainable and missing values are unknown, not healthy', () => {
  assert.equal(evaluateThresholds({temperature:90},{temperature:{max:80}}).status,'ALERT');
  assert.equal(evaluateThresholds({}, {temperature:{max:80}}).status,'UNKNOWN');
  assert.equal(evaluateThresholds({temperature:60},{temperature:{min:0,max:80}}).status,'WITHIN_POLICY');
});

test('twin state is deeply immutable and rejects values that JSON would silently lose', () => {
  const nested = { sensor: { value: 5 }, labels: ['a'] };
  const twin = createTwin({ tenantId:'tenant-1', twinId:'twin-immutable', entityType:'building', createdAt:1000, state:nested });
  nested.sensor.value = 99;
  assert.equal(twin.state.sensor.value, 5);
  assert.equal(Object.isFrozen(twin.state.sensor), true);
  assert.throws(() => { twin.state.sensor.value = 8; }, TypeError);
  assert.throws(() => createTwin({ tenantId:'t', twinId:'w', entityType:'asset', createdAt:1, state:{x:undefined} }), /TWIN_STATE_INVALID/);
  assert.throws(() => createTwin({ tenantId:'t', twinId:'w', entityType:'asset', createdAt:1, state:{x:Infinity} }), /TWIN_STATE_INVALID/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => createTwin({ tenantId:'t', twinId:'w', entityType:'asset', createdAt:1, state:cyclic }), /TWIN_STATE_INVALID/);
});

test('event append return value cannot mutate internal chain records', () => {
  const chain = new TwinEventChain({ tenantId:'t1', twinId:'tw1' });
  const returned = chain.append({ eventId:'e1', occurredAt:1000, type:'inspection.completed', payload:{ evidence:{sha256:'abc'} } });
  returned.payload.evidence.sha256 = 'tampered';
  assert.equal(chain.verify().valid, true);
  assert.equal(chain.export()[0].payload.evidence.sha256, 'abc');
  assert.throws(() => chain.append({ eventId:'e2', occurredAt:2000, type:'inspection.completed', payload:{v:undefined} }), /TWIN_EVENT_PAYLOAD_INVALID/);
});

test('threshold evaluation never reports healthy when no policy exists and rejects contradictory ranges', () => {
  assert.equal(evaluateThresholds({temperature:20}, {}).status, 'UNKNOWN');
  assert.throws(() => evaluateThresholds({temperature:20}, {temperature:{min:30,max:10}}), /TWIN_THRESHOLD_RANGE_INVALID/);
});

test('canonical twin inputs reject sparse arrays, symbols and accessor side effects', () => {
  const sparse = []; sparse.length = 2; sparse[1] = 'x';
  assert.throws(() => createTwin({tenantId:'t',twinId:'w',entityType:'asset',createdAt:1,state:{items:sparse}}), /TWIN_STATE_INVALID/);
  const symbolState = {ok:true}; symbolState[Symbol('hidden')] = 'not-hashed';
  assert.throws(() => createTwin({tenantId:'t',twinId:'w',entityType:'asset',createdAt:1,state:symbolState}), /TWIN_STATE_INVALID/);
  let executed = false; const getterState = {};
  Object.defineProperty(getterState, 'danger', {enumerable:true, get(){executed=true;return 'value';}});
  assert.throws(() => createTwin({tenantId:'t',twinId:'w',entityType:'asset',createdAt:1,state:getterState}), /TWIN_STATE_INVALID/);
  assert.equal(executed, false);
});
