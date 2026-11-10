'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AdapterRegistry, validateAdapterManifest, findScheduleConflicts } = require('../src/extensions/adapter-contract');

test('adapter manifest is normalized, immutable and fingerprinted', () => {
  const m = validateAdapterManifest({ id: 'vision.first-time-right', version: '1.0.0', capabilities: ['inspect.evidence', 'read.barcode'], requiredConfig: ['VISION_ENDPOINT'], outboundData: false });
  assert.deepEqual(m.capabilities, ['inspect.evidence', 'read.barcode']);
  assert.match(m.manifestHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(m), true);
});
test('rejects malformed or duplicate capabilities', () => {
  assert.throws(() => validateAdapterManifest({ id: 'Bad ID', version: '1', capabilities: ['a'] }), /ADAPTER_ID_INVALID/);
  assert.throws(() => validateAdapterManifest({ id: 'good', version: '1.0.0', capabilities: ['a', 'a'] }), /ADAPTER_CAPABILITY_DUPLICATE/);
});
test('registry requires every declared capability to be implemented and does not claim health', () => {
  const r = new AdapterRegistry();
  const manifest = { id: 'schedule.checker', version: '1.0.0', capabilities: ['check.conflicts'] };
  assert.throws(() => r.register(manifest, {}), /ADAPTER_CAPABILITY_NOT_IMPLEMENTED/);
  r.register(manifest, { 'check.conflicts': findScheduleConflicts });
  assert.equal(r.describe()[0].runtimeStatus, 'unverified');
  assert.throws(() => r.register(manifest, { 'check.conflicts': findScheduleConflicts }), /ADAPTER_ALREADY_REGISTERED/);
});
test('schedule conflict detector reports overlapping work for same technician only', () => {
  const rows = [
    { technicianId: 't1', workOrderId: 'w1', startAt: '2026-10-21T08:00:00Z', endAt: '2026-10-21T10:00:00Z' },
    { technicianId: 't1', workOrderId: 'w2', startAt: '2026-10-21T09:00:00Z', endAt: '2026-10-21T11:00:00Z' },
    { technicianId: 't2', workOrderId: 'w3', startAt: '2026-10-21T09:00:00Z', endAt: '2026-10-21T11:00:00Z' }
  ];
  const result = findScheduleConflicts(rows);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].workOrderIds, ['w1', 'w2']);
});
test('invalid schedule intervals fail closed', () => {
  assert.throws(() => findScheduleConflicts([{ technicianId: 't', workOrderId: 'w', startAt: 'bad', endAt: 'also-bad' }]), /SCHEDULE_INTERVAL_INVALID/);
});
