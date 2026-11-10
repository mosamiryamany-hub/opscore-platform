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
 * event_hash = sha256(previous_hash + canonical(event))
 * Dual-linked to signature-chain appendChain for governance evidence.
 */
function audit(db, {organizationId, actorUserId, action, resourceType, resourceId, metadata = {}}) {
  const createdAt = now();
  const prevRow = organizationId
    ? db.prepare('SELECT event_hash FROM audit_log WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(organizationId)
    : db.prepare('SELECT event_hash FROM audit_log WHERE organization_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 1').get();
  const prev = (prevRow && prevRow.event_hash) || '';
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
  const rows = (organizationId ? db.prepare('SELECT * FROM audit_log WHERE organization_id = ? ORDER BY created_at ASC, id ASC').all(organizationId) : db.prepare('SELECT * FROM audit_log WHERE organization_id IS NULL ORDER BY created_at ASC, id ASC').all());
  let prev = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const event = {
      organizationId: r.organization_id,
      actorUserId: r.actor_user_id,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      metadata: JSON.parse(r.metadata_json || '{}'),
      createdAt: r.created_at
    };
    const expected = crypto.createHash('sha256').update(prev + canonical(event)).digest('hex');
    if (r.previous_hash !== prev || r.event_hash !== expected) {
      return { valid: false, brokenAt: r.id, checked: i + 1 };
    }
    prev = r.event_hash;
  }
  return { valid: true, checked: rows.length };
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
