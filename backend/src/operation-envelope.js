'use strict';
const crypto = require('node:crypto');

const ENVELOPE_VERSION = 'opscore.operation-envelope.v1';
const DOMAIN_EVENT_VERSION = 'opscore.domain-event.v1';

function validCorrelationId(value) {
  const s = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(s) ? s : null;
}

function requestHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

function makeEnvelope({
  id,
  organizationId,
  actorUserId,
  role,
  source = 'api',
  correlationId,
  causationId = null,
  idempotencyKey = null,
  operation,
  resourceType = null,
  resourceId = null,
  requestHashSha256 = null,
  status = 'started',
  startedAt,
  completedAt = null,
  errorCode = null
}) {
  if (!organizationId || !actorUserId || !operation || !id)
    throw new Error('OPERATION_ENVELOPE_REQUIRED_FIELDS');
  if (!['started', 'committed', 'failed'].includes(status))
    throw new Error('OPERATION_ENVELOPE_INVALID_STATUS');
  return Object.freeze({
    schemaVersion: ENVELOPE_VERSION,
    id,
    organizationId,
    actorUserId,
    role: role || null,
    source,
    correlationId: validCorrelationId(correlationId),
    causationId: causationId || null,
    idempotencyKey: idempotencyKey || null,
    operation,
    resourceType,
    resourceId,
    requestHashSha256,
    status,
    startedAt,
    completedAt,
    errorCode
  });
}

function makeDomainEvent({
  eventId,
  eventType,
  eventVersion = 1,
  organizationId,
  actorUserId = null,
  aggregateType,
  aggregateId,
  correlationId,
  causationId = null,
  occurredAt,
  payload = {}
}) {
  if (!eventId || !eventType || !organizationId || !aggregateType || !aggregateId || !occurredAt)
    throw new Error('DOMAIN_EVENT_REQUIRED_FIELDS');
  if (!Number.isInteger(eventVersion) || eventVersion < 1)
    throw new Error('DOMAIN_EVENT_INVALID_VERSION');
  return Object.freeze({
    schemaVersion: DOMAIN_EVENT_VERSION,
    eventId,
    eventType,
    eventVersion,
    organizationId,
    actorUserId,
    aggregateType,
    aggregateId,
    correlationId: validCorrelationId(correlationId),
    causationId,
    occurredAt,
    payload
  });
}

module.exports = { ENVELOPE_VERSION, DOMAIN_EVENT_VERSION, validCorrelationId, requestHash, makeEnvelope, makeDomainEvent };
