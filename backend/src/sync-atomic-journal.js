'use strict';

/**
 * Crash-resilient application journal.
 * Ordered, idempotent, replayable — domain merge policies stay explicit at the command boundary.
 */
const crypto = require('node:crypto');

function canonical(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
}
function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function makeBlock(events, actorId, blockId = crypto.randomUUID()) {
  const normalized = events.map((event, index) => ({
    sequence: index,
    clientEventId: String(event.clientEventId),
    operation: String(event.operation),
    entityId: String(event.entityId),
    payload: event.payload ?? null,
    createdAt: event.createdAt ?? new Date().toISOString()
  }));
  return {
    blockId,
    actorId: String(actorId),
    events: normalized,
    eventCount: normalized.length,
    blockHash: hash({ blockId, actorId, events: normalized })
  };
}
function verifyBlock(block) {
  if (!block || !Array.isArray(block.events) || !block.blockId || !block.actorId) return false;
  return block.blockHash === hash({
    blockId: block.blockId, actorId: block.actorId, events: block.events
  });
}

/**
 * Idempotent reconciliation: for the same clientEventId keep the latest createdAt only.
 * Natural key may also include entityId + operation when clientEventId is absent.
 * Does not invent storage — pure function for store.applySyncEvents / offline ingest.
 */
function reconcileEvents(events) {
  if (!Array.isArray(events) || !events.length) {
    return { events: [], dropped: 0, kept: 0 };
  }
  const byKey = new Map();
  let dropped = 0;
  for (const raw of events) {
    const clientEventId = raw.clientEventId != null ? String(raw.clientEventId) : '';
    const operation = String(raw.operation || '');
    const entityId = String(raw.entityId || '');
    const key = clientEventId
      ? `id:${clientEventId}`
      : `nat:${operation}|${entityId}|${String(raw.createdAt || '')}`;
    const createdAt = String(raw.createdAt || '');
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, raw);
      continue;
    }
    // Keep chronologically latest field event (Zero Re-visit / no double apply)
    if (createdAt >= String(prev.createdAt || '')) {
      byKey.set(key, raw);
    }
    dropped += 1;
  }
  const out = [...byKey.values()].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  );
  return { events: out, dropped, kept: out.length };
}

/** Build a stable field idempotency key from geo + time (mobile offline). */
function fieldIdempotencyKey({ latitude, longitude, recordedAt, entityId, operation }) {
  return hash({
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
    recordedAt: String(recordedAt || ''),
    entityId: String(entityId || ''),
    operation: String(operation || '')
  });
}

module.exports = {
  canonical,
  hash,
  makeBlock,
  verifyBlock,
  reconcileEvents,
  fieldIdempotencyKey
};
