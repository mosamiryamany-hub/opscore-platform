'use strict';

const crypto = require('node:crypto');

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CLASSIFICATIONS = new Set(['public', 'internal', 'confidential', 'restricted']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const MAX_DATE_MS = 8640000000000000;
const DEFAULT_MAX_JSON_DEPTH = 64;
const DEFAULT_MAX_JSON_NODES = 50000;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function requiredId(value, code) {
  if (typeof value !== 'string' || !ID.test(value)) fail(code);
  return value;
}
function timestamp(value, code) {
  const n = typeof value === 'number' ? value : (typeof value === 'string' ? Date.parse(value) : NaN);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_DATE_MS) fail(code);
  return n;
}

/**
 * Convert values to strict JSON data. Reject lossy JSON coercions (undefined,
 * non-finite numbers, custom prototypes, cycles, and prototype-sensitive keys)
 * instead of letting the hash describe a different value from the caller's.
 */
function normalizeJson(value, code = 'TWIN_JSON_VALUE_INVALID', limits = {}) {
  const maxDepth = Number.isSafeInteger(limits.maxDepth) && limits.maxDepth >= 1 ? limits.maxDepth : DEFAULT_MAX_JSON_DEPTH;
  const maxNodes = Number.isSafeInteger(limits.maxNodes) && limits.maxNodes >= 1 ? limits.maxNodes : DEFAULT_MAX_JSON_NODES;
  const ancestors = new WeakSet();
  let nodes = 0;
  function visit(v, depth) {
    nodes += 1;
    if (nodes > maxNodes || depth > maxDepth) fail(code);
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail(code);
      return v;
    }
    if (typeof v !== 'object') fail(code);
    if (ancestors.has(v)) fail(code);
    if (!Array.isArray(v)) {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) fail(code);
    }
    if (Object.getOwnPropertySymbols(v).length) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    ancestors.add(v);
    let result;
    if (Array.isArray(v)) {
      const keys = Object.keys(descriptors).filter(k => k !== 'length');
      if (keys.length !== v.length) fail(code); // Reject sparse arrays and extra named properties.
      result = new Array(v.length);
      for (let i = 0; i < v.length; i++) {
        const descriptor = descriptors[String(i)];
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code);
        result[i] = visit(descriptor.value, depth + 1);
      }
    } else {
      result = {};
      for (const key of Object.keys(descriptors).sort()) {
        const descriptor = descriptors[key];
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code);
        result[key] = visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(v);
    return result;
  }
  return visit(value, 0);
}
function canonical(value) {
  // All public entry points normalize first; this function canonicalizes valid JSON values.
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
function detached(value) { return JSON.parse(JSON.stringify(value)); }
function jsonWithinLimit(value, maxBytes, code) {
  const normalized = normalizeJson(value, code);
  const encoded = canonical(normalized);
  if (Buffer.byteLength(encoded, 'utf8') > maxBytes) fail(code === 'TWIN_STATE_INVALID' ? 'TWIN_STATE_TOO_LARGE' : 'TWIN_EVENT_PAYLOAD_TOO_LARGE');
  return { normalized, encoded };
}

/** Domain-neutral, deterministic twin state engine. It stores no data and performs no I/O. */
function createTwin(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('TWIN_INPUT_INVALID');
  const tenantId = requiredId(input.tenantId, 'TWIN_TENANT_REQUIRED');
  const twinId = requiredId(input.twinId, 'TWIN_ID_INVALID');
  const entityType = requiredId(input.entityType, 'TWIN_ENTITY_TYPE_INVALID');
  const createdAtMs = timestamp(input.createdAt, 'TWIN_CREATED_AT_INVALID');
  const classification = input.classification || 'confidential';
  if (!CLASSIFICATIONS.has(classification)) fail('TWIN_CLASSIFICATION_INVALID');
  if (!input.state || typeof input.state !== 'object' || Array.isArray(input.state)) fail('TWIN_STATE_INVALID');
  const maxStateBytes = Number.isSafeInteger(options.maxStateBytes) && options.maxStateBytes >= 1 ? options.maxStateBytes : 65536;
  const { normalized: state, encoded: stateJson } = jsonWithinLimit(input.state, maxStateBytes, 'TWIN_STATE_INVALID');
  const source = input.source ? requiredId(input.source, 'TWIN_SOURCE_INVALID') : 'manual';
  const result = { schemaVersion: 'opscore.digital-twin.v2', tenantId, twinId, entityType,
    classification, createdAt: new Date(createdAtMs).toISOString(), state: deepFreeze(state),
    stateHash: sha256(stateJson), source,
    claims: deepFreeze({ physicalStateVerified: false, providerConnected: false, productionReady: false }) };
  return Object.freeze(result);
}

/** Evaluate telemetry without silently accepting stale, future-dated, or malformed observations. */
function evaluateTelemetry(observations, policy = {}, now = Date.now()) {
  if (!Array.isArray(observations)) fail('TWIN_TELEMETRY_INVALID');
  if (!Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0 || now > MAX_DATE_MS) fail('TWIN_NOW_INVALID');
  const maxAgeMs = policy.maxAgeMs === undefined ? 300000 : policy.maxAgeMs;
  const futureSkewMs = policy.futureSkewMs === undefined ? 30000 : policy.futureSkewMs;
  const maxObservations = policy.maxObservations === undefined ? 10000 : policy.maxObservations;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0 || !Number.isSafeInteger(futureSkewMs) || futureSkewMs < 0 ||
      !Number.isSafeInteger(maxObservations) || maxObservations < 1 || observations.length > maxObservations) fail('TWIN_POLICY_INVALID');
  const seen = new Set();
  const results = observations.map((o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail('TWIN_OBSERVATION_INVALID');
    const key = requiredId(o.key, 'TWIN_OBSERVATION_KEY_INVALID');
    if (seen.has(key)) fail('TWIN_OBSERVATION_DUPLICATE');
    seen.add(key);
    const observedAt = timestamp(o.observedAt, 'TWIN_OBSERVATION_TIME_INVALID');
    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) fail('TWIN_OBSERVATION_VALUE_INVALID');
    if (typeof o.unit !== 'string' || !o.unit.trim() || o.unit.length > 32) fail('TWIN_OBSERVATION_UNIT_INVALID');
    let status = 'fresh';
    if (observedAt > now + futureSkewMs) status = 'future-dated';
    else if (now - observedAt > maxAgeMs) status = 'stale';
    let source = 'unspecified';
    if (o.source !== undefined && o.source !== null && o.source !== '') source = requiredId(o.source, 'TWIN_OBSERVATION_SOURCE_INVALID');
    return { key, value: o.value, unit: o.unit.trim(), observedAt: new Date(observedAt).toISOString(), ageMs: now - observedAt, status, source };
  });
  return { schemaVersion: 'opscore.digital-twin.telemetry.v1', evaluatedAt: new Date(now).toISOString(),
    status: results.some(x => x.status === 'future-dated') ? 'REJECT' : results.some(x => x.status === 'stale') ? 'DEGRADED' : 'FRESH',
    observationCount: results.length, freshCount: results.filter(x => x.status === 'fresh').length,
    staleCount: results.filter(x => x.status === 'stale').length, futureDatedCount: results.filter(x => x.status === 'future-dated').length,
    observations: results };
}

/** Append-only in-memory event chain; persistence, key management and signatures are external responsibilities. */
class TwinEventChain {
  #events = [];
  #eventIds = new Set();
  #lastHash = '0'.repeat(64);
  #maxEvents;
  #maxPayloadBytes;
  constructor({ tenantId, twinId, maxEvents = 100000, maxPayloadBytes = 65536 }) {
    this.tenantId = requiredId(tenantId, 'TWIN_TENANT_REQUIRED');
    this.twinId = requiredId(twinId, 'TWIN_ID_INVALID');
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || !Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) fail('TWIN_EVENT_POLICY_INVALID');
    this.#maxEvents = maxEvents;
    this.#maxPayloadBytes = maxPayloadBytes;
  }
  append(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('TWIN_EVENT_INVALID');
    if (this.#events.length >= this.#maxEvents) fail('TWIN_EVENT_LIMIT_REACHED');
    const eventId = requiredId(event.eventId, 'TWIN_EVENT_ID_INVALID');
    if (this.#eventIds.has(eventId)) fail('TWIN_EVENT_DUPLICATE');
    const occurredAt = timestamp(event.occurredAt, 'TWIN_EVENT_TIME_INVALID');
    const type = requiredId(event.type, 'TWIN_EVENT_TYPE_INVALID');
    const severity = event.severity || 'info';
    if (!SEVERITIES.has(severity)) fail('TWIN_EVENT_SEVERITY_INVALID');
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) fail('TWIN_EVENT_PAYLOAD_INVALID');
    const { normalized: payload, encoded } = jsonWithinLimit(event.payload, this.#maxPayloadBytes, 'TWIN_EVENT_PAYLOAD_INVALID');
    // size check applies to canonical payload bytes, and rejects non-JSON values before hashing.
    if (Buffer.byteLength(encoded, 'utf8') > this.#maxPayloadBytes) fail('TWIN_EVENT_PAYLOAD_TOO_LARGE');
    const body = deepFreeze({ tenantId: this.tenantId, twinId: this.twinId, eventId,
      occurredAt: new Date(occurredAt).toISOString(), type, severity, payload: deepFreeze(payload), previousHash: this.#lastHash });
    const hash = sha256(canonical(body));
    const record = deepFreeze({ ...body, hash });
    this.#events.push(record); this.#eventIds.add(eventId); this.#lastHash = hash;
    return detached(record);
  }
  verify() {
    let previousHash = '0'.repeat(64);
    for (const event of this.#events) {
      const { hash, ...body } = event;
      if (body.previousHash !== previousHash || sha256(canonical(body)) !== hash) return { valid: false, eventId: event.eventId };
      previousHash = hash;
    }
    return { valid: true, count: this.#events.length, headHash: previousHash };
  }
  export() { return detached(this.#events); }
}

/** Explainable policy evaluation. Missing telemetry/rules are UNKNOWN, never silently healthy. */
function evaluateThresholds(values, thresholds) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || !thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) fail('TWIN_THRESHOLDS_INVALID');
  const keys = Object.keys(thresholds).sort();
  if (keys.length === 0) return { schemaVersion: 'opscore.digital-twin.policy.v1', status: 'UNKNOWN', reason: 'NO_THRESHOLDS_DEFINED', results: [] };
  const results = keys.map(key => {
    const rule = thresholds[key];
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !['min', 'max'].some(k => Number.isFinite(rule[k]))) fail('TWIN_THRESHOLD_RULE_INVALID');
    if (Number.isFinite(rule.min) && Number.isFinite(rule.max) && rule.min > rule.max) fail('TWIN_THRESHOLD_RANGE_INVALID');
    const value = values[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return { key, status: 'UNKNOWN', reason: 'VALUE_MISSING_OR_INVALID' };
    const violations = [];
    if (Number.isFinite(rule.min) && value < rule.min) violations.push('BELOW_MIN');
    if (Number.isFinite(rule.max) && value > rule.max) violations.push('ABOVE_MAX');
    return { key, value, status: violations.length ? 'OUT_OF_RANGE' : 'WITHIN_RANGE', violations };
  });
  return { schemaVersion: 'opscore.digital-twin.policy.v1', status: results.some(x => x.status === 'OUT_OF_RANGE') ? 'ALERT' : results.some(x => x.status === 'UNKNOWN') ? 'UNKNOWN' : 'WITHIN_POLICY', results };
}

module.exports = { createTwin, evaluateTelemetry, TwinEventChain, evaluateThresholds, canonical, sha256 };
