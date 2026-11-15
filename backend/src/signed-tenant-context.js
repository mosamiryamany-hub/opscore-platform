'use strict';

const crypto = require('node:crypto');

const MAX_ASSERTION_TTL_SECONDS = 45;
const MAX_CLAIM_LENGTH = 128;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredText(value, code) {
  const out = String(value == null ? '' : value).trim();
  if (!out || out.length > MAX_CLAIM_LENGTH || /[\u0000-\u001f\u007f]/.test(out)) {
    throw fail(code);
  }
  return out;
}

function loadSigningKey(env = process.env) {
  const encoded = String(env.OPSC_TENANT_CONTEXT_HMAC_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(encoded)) {
    throw fail('TENANT_CONTEXT_SIGNING_KEY_REQUIRED');
  }
  const keyId = requiredText(env.OPSC_TENANT_CONTEXT_KEY_ID, 'TENANT_CONTEXT_KEY_ID_REQUIRED');
  if (keyId.length > 64) throw fail('TENANT_CONTEXT_KEY_ID_INVALID');
  return { key: Buffer.from(encoded, 'hex'), keyId };
}

function createSignedTenantContext({ principal, backendPid, transactionId, env = process.env, nowMs = Date.now() }) {
  if (!principal || typeof principal !== 'object') {
    throw fail('TENANT_CONTEXT_PRINCIPAL_REQUIRED');
  }
  const sessionId = requiredText(principal.sessionId, 'TENANT_CONTEXT_SESSION_REQUIRED');
  const userId = requiredText(principal.userId, 'TENANT_CONTEXT_USER_REQUIRED');
  const tenantId = requiredText(principal.tenantId, 'TENANT_CONTEXT_TENANT_REQUIRED');
  const pid = Number(backendPid);
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) {
    throw fail('TENANT_CONTEXT_BACKEND_ID_INVALID');
  }
  const xid = String(transactionId == null ? '' : transactionId).trim();
  if (!/^[0-9]{1,20}$/.test(xid)) {
    throw fail('TENANT_CONTEXT_TRANSACTION_ID_INVALID');
  }
  const { key, keyId } = loadSigningKey(env);
  const issuedAt = Math.floor(Number(nowMs) / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1) {
    throw fail('TENANT_CONTEXT_CLOCK_INVALID');
  }
  const claims = {
    v: '1',
    iss: 'opscore-api',
    aud: 'opscore-database',
    purpose: 'field_request',
    sub: userId,
    tenant_id: tenantId,
    session_id: sessionId,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + MAX_ASSERTION_TTL_SECONDS,
    jti: crypto.randomUUID(),
    kid: keyId,
    backend_pid: pid,
    transaction_id: xid
  };
  const payload = JSON.stringify(claims);
  if (Buffer.byteLength(payload, 'utf8') > 4096) {
    throw fail('TENANT_CONTEXT_PAYLOAD_TOO_LARGE');
  }
  const signature = crypto.createHmac('sha256', key).update(payload, 'utf8').digest('hex');
  return Object.freeze({
    payload,
    signature,
    expiresAt: claims.exp,
    backendPid: pid,
    transactionId: xid
  });
}

module.exports = {
  MAX_ASSERTION_TTL_SECONDS,
  createSignedTenantContext
};
