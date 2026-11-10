'use strict';

const crypto = require('node:crypto');

const ADAPTER_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const STATUS = new Set(['configured', 'unconfigured', 'degraded', 'disabled']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function nonEmptyString(value, code, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(code);
  return value.trim();
}

/** Validate a provider-neutral adapter declaration. This does not connect to a provider. */
function validateAdapterManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('ADAPTER_MANIFEST_INVALID');
  const id = nonEmptyString(input.id, 'ADAPTER_ID_INVALID', 100);
  if (!ADAPTER_ID.test(id)) fail('ADAPTER_ID_INVALID');
  const version = nonEmptyString(input.version, 'ADAPTER_VERSION_INVALID', 40);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) fail('ADAPTER_VERSION_INVALID');
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) fail('ADAPTER_CAPABILITIES_REQUIRED');
  const capabilities = [...new Set(input.capabilities.map(value => {
    const capability = nonEmptyString(value, 'ADAPTER_CAPABILITY_INVALID', 100);
    if (!CAPABILITY_ID.test(capability)) fail('ADAPTER_CAPABILITY_INVALID');
    return capability;
  }))].sort();
  if (capabilities.length !== input.capabilities.length) fail('ADAPTER_CAPABILITY_DUPLICATE');
  const requiredConfig = input.requiredConfig === undefined ? [] : input.requiredConfig;
  if (!Array.isArray(requiredConfig) || requiredConfig.some(k => typeof k !== 'string' || !/^[A-Z][A-Z0-9_]{1,79}$/.test(k))) fail('ADAPTER_CONFIG_SCHEMA_INVALID');
  if (new Set(requiredConfig).size !== requiredConfig.length) fail('ADAPTER_CONFIG_DUPLICATE');
  return Object.freeze({
    id, version,
    domain: nonEmptyString(input.domain || 'cross-domain', 'ADAPTER_DOMAIN_INVALID', 80),
    capabilities: Object.freeze(capabilities),
    requiredConfig: Object.freeze([...requiredConfig]),
    dataClassification: ['public', 'internal', 'confidential', 'restricted'].includes(input.dataClassification) ? input.dataClassification : 'confidential',
    outboundData: input.outboundData === true,
    humanApprovalRequired: input.humanApprovalRequired !== false,
    manifestHash: crypto.createHash('sha256').update(JSON.stringify({ id, version, domain: input.domain || 'cross-domain', capabilities, requiredConfig, dataClassification: input.dataClassification || 'confidential', outboundData: input.outboundData === true, humanApprovalRequired: input.humanApprovalRequired !== false })).digest('hex')
  });
}

/** In-memory registry only. It deliberately makes no claim about provider availability or health. */
class AdapterRegistry {
  #adapters = new Map();
  register(manifest, implementation) {
    const validated = validateAdapterManifest(manifest);
    if (this.#adapters.has(validated.id)) fail('ADAPTER_ALREADY_REGISTERED');
    if (!implementation || typeof implementation !== 'object') fail('ADAPTER_IMPLEMENTATION_REQUIRED');
    for (const capability of validated.capabilities) {
      if (typeof implementation[capability] !== 'function') fail('ADAPTER_CAPABILITY_NOT_IMPLEMENTED');
    }
    this.#adapters.set(validated.id, Object.freeze({ manifest: validated, implementation }));
    return validated;
  }
  describe() {
    return [...this.#adapters.values()].map(({ manifest }) => ({ ...manifest, capabilities: [...manifest.capabilities], requiredConfig: [...manifest.requiredConfig], runtimeStatus: 'unverified' }));
  }
  get(id) { return this.#adapters.get(id) || null; }
}

/** Detects overlapping assignments; it does not predict traffic, weather, or optimize routes. */
function findScheduleConflicts(assignments) {
  if (!Array.isArray(assignments)) fail('SCHEDULE_ASSIGNMENTS_INVALID');
  const normalized = assignments.map((item, index) => {
    if (!item || typeof item !== 'object') fail('SCHEDULE_ASSIGNMENT_INVALID');
    const technicianId = nonEmptyString(String(item.technicianId || ''), 'SCHEDULE_TECHNICIAN_REQUIRED', 160);
    const workOrderId = nonEmptyString(String(item.workOrderId || ''), 'SCHEDULE_WORK_ORDER_REQUIRED', 160);
    const start = Date.parse(item.startAt), end = Date.parse(item.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail('SCHEDULE_INTERVAL_INVALID');
    return { technicianId, workOrderId, start, end, index };
  });
  const conflicts = [];
  const byTechnician = new Map();
  for (const item of normalized) {
    const list = byTechnician.get(item.technicianId) || [];
    list.push(item); byTechnician.set(item.technicianId, list);
  }
  for (const [technicianId, items] of byTechnician) {
    items.sort((a, b) => a.start - b.start || a.end - b.end || a.workOrderId.localeCompare(b.workOrderId));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length && items[j].start < items[i].end; j++) {
        if (items[i].workOrderId !== items[j].workOrderId) conflicts.push({ technicianId, workOrderIds: [items[i].workOrderId, items[j].workOrderId], overlapStart: new Date(Math.max(items[i].start, items[j].start)).toISOString(), overlapEnd: new Date(Math.min(items[i].end, items[j].end)).toISOString(), type: 'technician-time-overlap' });
      }
    }
  }
  return conflicts;
}

module.exports = { AdapterRegistry, validateAdapterManifest, findScheduleConflicts };
