const crypto = require('node:crypto');
const {id, now} = require('./security');
const {appendChain} = require('./signature-chain');
const {tableExists} = require('./table-exists');

function canonical(x) {
  return JSON.stringify({
    organization_id: x.organizationId || null,
    actor_user_id: x.actorUserId || null,
    action: x.action,
    resource_type: x.resourceType,
    resource_id: x.resourceId || null,
    metadata: x.metadata || {},
    created_at: x.createdAt
  });
}

/**
 * Immutable sequential audit ledger (real audit_log columns only).
 * event_hash = sha256(previous_hash + canonical(event)).
 * Chain verification follows previous_hash links; append timestamps are made
 * strictly increasing so the indexed (organization_id, created_at) lookup
 * identifies the last append without relying on random UUID ordering.
 * Dual-linked to signature-chain appendChain for governance evidence.
 */
function latestAuditRow(db, organizationId) {
  return organizationId
    ? db.prepare('SELECT id,event_hash,created_at FROM audit_log WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(organizationId)
    : db.prepare('SELECT id,event_hash,created_at FROM audit_log WHERE organization_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 1').get();
}

function nextAuditTimestamp(previousAt) {
  const current = Date.parse(now());
  if (!Number.isFinite(current)) throw new Error('AUDIT_TIMESTAMP_INVALID');
  if (!previousAt) return new Date(current).toISOString();
  const previous = Date.parse(previousAt);
  if (!Number.isFinite(previous)) throw new Error('AUDIT_TIMESTAMP_INVALID');
  return new Date(Math.max(current, previous + 1)).toISOString();
}

function audit(db, {organizationId, actorUserId, action, resourceType, resourceId, metadata = {}}) {
  const prevRow = latestAuditRow(db, organizationId);
  const prev = (prevRow && prevRow.event_hash) || '';
  const createdAt = nextAuditTimestamp(prevRow?.created_at);
  // Strip reserved chain keys from caller metadata so hash remains stable.
  const safeMeta = { ...metadata };
  delete safeMeta.chainHash;
  delete safeMeta.payloadHash;
  delete safeMeta._chain;
  const event = {
    organizationId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    metadata: safeMeta,
    createdAt
  };
  const eventHash = crypto.createHash('sha256').update(prev + canonical(event)).digest('hex');
  const chain = appendChain(prev || null, {
    organizationId: organizationId || null,
    actorUserId: actorUserId || null,
    action,
    resourceType,
    resourceId: resourceId || null,
    createdAt,
    eventHash
  });
  // Store original metadata only in metadata_json (verify contract). Chain evidence is dual-written when table exists.
  db.prepare(`INSERT INTO audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at, previous_hash, event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id('aud'),
    organizationId || null,
    actorUserId || null,
    action,
    resourceType,
    resourceId || null,
    JSON.stringify(safeMeta),
    createdAt,
    prev,
    eventHash
  );
  try {
    // Dual-write is local/SQLite by default. Under Postgres only when opted in so a
    // missing-table probe can never abort the caller's transaction.
    const allowChain = String(process.env.OPSC_SIGNATURE_CHAIN || '').toLowerCase() === 'true'
      || String(process.env.DATABASE_ENGINE || '').toLowerCase() !== 'postgres';
    const has = allowChain && tableExists(db, 'signature_chain_events');
    if (has) {
      db.prepare(`INSERT INTO signature_chain_events (id, organization_id, entity_type, entity_id, level, previous_hash, payload_hash, chain_hash, payload_json, actor_user_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        id('sig'),
        organizationId || null,
        resourceType,
        resourceId || null,
        0,
        chain.previousHash,
        chain.payloadHash,
        chain.chainHash,
        JSON.stringify({ action, eventHash, createdAt }),
        actorUserId || null,
        createdAt
      );
    }
  } catch (_) { /* audit_log remains authoritative */ }
  return { eventHash, chainHash: chain.chainHash, previousHash: prev };
}

function verifyAuditChain(db, organizationId) {
  const rows = organizationId
    ? db.prepare('SELECT * FROM audit_log WHERE organization_id = ?').all(organizationId)
    : db.prepare('SELECT * FROM audit_log WHERE organization_id IS NULL').all();
  if (rows.length === 0) return { valid: true, checked: 0 };

  const nextByPrevious = new Map();
  const hashes = new Set();
  for (const row of rows) {
    const previous = row.previous_hash || '';
    if (nextByPrevious.has(previous)) {
      return { valid: false, brokenAt: row.id, checked: 0, reason: 'AUDIT_CHAIN_FORKED' };
    }
    if (!row.event_hash || hashes.has(row.event_hash)) {
      return { valid: false, brokenAt: row.id, checked: 0, reason: 'AUDIT_CHAIN_DUPLICATE_HASH' };
    }
    nextByPrevious.set(previous, row);
    hashes.add(row.event_hash);
  }

  let previous = '';
  let checked = 0;
  const visited = new Set();
  while (nextByPrevious.has(previous)) {
    const row = nextByPrevious.get(previous);
    const event = {
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: JSON.parse(row.metadata_json || '{}'),
      createdAt: row.created_at
    };
    const expected = crypto.createHash('sha256').update(previous + canonical(event)).digest('hex');
    if (row.previous_hash !== previous || row.event_hash !== expected) {
      return { valid: false, brokenAt: row.id, checked: checked + 1, reason: 'AUDIT_CHAIN_HASH_MISMATCH' };
    }
    if (visited.has(row.id)) {
      return { valid: false, brokenAt: row.id, checked, reason: 'AUDIT_CHAIN_CYCLE' };
    }
    visited.add(row.id);
    previous = row.event_hash;
    checked++;
  }

  if (checked !== rows.length) {
    const orphan = rows.find(row => !visited.has(row.id));
    return { valid: false, brokenAt: orphan?.id || null, checked, reason: 'AUDIT_CHAIN_DISCONNECTED' };
  }
  return { valid: true, checked };
}

function assertAuditChainIntact(db, organizationId) {
  const result = verifyAuditChain(db, organizationId);
  if (!result.valid) {
    const err = new Error('AUDIT_CHAIN_BROKEN');
    err.status = 500;
    err.details = result;
    throw err;
  }
  return result;
}

module.exports = {
  audit,
  verifyAuditChain,
  assertAuditChainIntact,
  canonical
};
