'use strict';
const {id, now} = require('./security');

function clean(v, fallback = null) {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

function recordAuthorizationDecision(db, ctx, decision) {
  if (!ctx || !ctx.organizationId) throw new Error('AUTHZ_CONTEXT_REQUIRED');
  const d = decision || {};
  const value = String(d.decision || 'deny');
  if (!['allow','deny'].includes(value)) throw new Error('AUTHZ_DECISION_INVALID');
  const reasonCode = clean(d.reasonCode, 'UNSPECIFIED');
  const createdAt = now();
  const row = {
    id: id('azd'),
    organizationId: ctx.organizationId,
    actorUserId: clean(ctx.userId),
    role: clean(ctx.role),
    source: clean(ctx.source, 'api'),
    correlationId: clean(ctx.correlationId),
    operationEnvelopeId: clean(ctx.operationEnvelopeId),
    action: clean(d.action, 'unknown'),
    resourceType: clean(d.resourceType),
    resourceId: clean(d.resourceId),
    decision: value,
    reasonCode,
    createdAt
  };
  db.prepare(`INSERT INTO authorization_decisions
    (id,organization_id,actor_user_id,role,source,correlation_id,operation_envelope_id,action,resource_type,resource_id,decision,reason_code,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    row.id,row.organizationId,row.actorUserId,row.role,row.source,row.correlationId,row.operationEnvelopeId,
    row.action,row.resourceType,row.resourceId,row.decision,row.reasonCode,row.createdAt
  );
  return {schemaVersion:'opscore.authorization-decision.v1', ...row};
}

function listAuthorizationDecisions(db, ctx, limit = 100) {
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  return db.prepare(`SELECT * FROM authorization_decisions
    WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId,n).map(r => ({
      schemaVersion:'opscore.authorization-decision.v1', id:r.id, organizationId:r.organization_id,
      actorUserId:r.actor_user_id, role:r.role, source:r.source, correlationId:r.correlation_id,
      operationEnvelopeId:r.operation_envelope_id, action:r.action, resourceType:r.resource_type,
      resourceId:r.resource_id, decision:r.decision, reasonCode:r.reason_code, createdAt:r.created_at
  }));
}

module.exports = {recordAuthorizationDecision, listAuthorizationDecisions};
