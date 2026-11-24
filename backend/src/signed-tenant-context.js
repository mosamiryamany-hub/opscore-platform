'use strict';

const crypto = require('node:crypto');
const { hmacSha256 } = require('./security');

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
  const atomicConfig = String(env.OPSC_TENANT_CONTEXT_KEY_JSON || '').trim();
  if (atomicConfig) {
    let parsed;
    try {
      parsed = JSON.parse(atomicConfig);
    } catch {
      throw fail('TENANT_CONTEXT_SIGNING_KEY_INVALID');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw fail('TENANT_CONTEXT_SIGNING_KEY_INVALID');
    }
    const encoded = String(parsed.secret_hex || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(encoded)) {
      throw fail('TENANT_CONTEXT_SIGNING_KEY_REQUIRED');
    }
    const keyId = requiredText(parsed.key_id, 'TENANT_CONTEXT_KEY_ID_REQUIRED');
    if (keyId.length > 64) throw fail('TENANT_CONTEXT_KEY_ID_INVALID');
    return { key: Buffer.from(encoded, 'hex'), keyId };
  }

  // Backward-compatible split variables; atomic JSON takes precedence when present.
  const encoded = String(env.OPSC_TENANT_CONTEXT_HMAC_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(encoded)) {
    throw fail('TENANT_CONTEXT_SIGNING_KEY_REQUIRED');
  }
  const keyId = requiredText(env.OPSC_TENANT_CONTEXT_KEY_ID, 'TENANT_CONTEXT_KEY_ID_REQUIRED');
  if (keyId.length > 64) throw fail('TENANT_CONTEXT_KEY_ID_INVALID');
  return { key: Buffer.from(encoded, 'hex'), keyId };
}


const RLS_SESSION_PURPOSES = Object.freeze({
  field: 'field_operation',
  auth: 'auth_operation',
  system: 'system_operation',
  backoffice: 'backoffice_operation'
});

function optionalText(value, code) {
  if (value == null || value === '') return null;
  return requiredText(value, code);
}

function createSignedRlsSessionContext({
  tenantId = '',
  userId = '',
  sessionId = '',
  apiKeyId = '',
  accessMode = 'field',
  backendPid,
  transactionId = null,
  requestId,
  env = process.env,
  nowMs = Date.now()
}) {
  const mode = String(accessMode || 'field').trim();
  const basePurpose = RLS_SESSION_PURPOSES[mode];
  if (!basePurpose) throw fail('TENANT_CONTEXT_ACCESS_MODE_INVALID');

  const tenant = optionalText(tenantId, 'TENANT_CONTEXT_TENANT_INVALID');
  const user = optionalText(userId, 'TENANT_CONTEXT_USER_INVALID');
  const session = optionalText(sessionId, 'TENANT_CONTEXT_SESSION_INVALID');
  const apiKey = optionalText(apiKeyId, 'TENANT_CONTEXT_API_KEY_INVALID');
  const request = requiredText(requestId, 'TENANT_CONTEXT_REQUEST_ID_REQUIRED');

  if (mode === 'field' && (!tenant || !user || (!session && !apiKey) || (session && apiKey))) {
    throw fail('TENANT_CONTEXT_FIELD_SESSION_PRINCIPAL_REQUIRED');
  }
  if (mode !== 'field' && (session || apiKey)) {
    throw fail('TENANT_CONTEXT_NON_FIELD_SESSION_BINDING_FORBIDDEN');
  }

  const pid = Number(backendPid);
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) {
    throw fail('TENANT_CONTEXT_BACKEND_ID_INVALID');
  }
  const xid = transactionId == null || transactionId === '' ? null : String(transactionId).trim();
  if (xid !== null && !/^[0-9]{1,20}$/.test(xid)) {
    throw fail('TENANT_CONTEXT_TRANSACTION_ID_INVALID');
  }
  const { key, keyId } = loadSigningKey(env);
  const issuedAt = Math.floor(Number(nowMs) / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1) throw fail('TENANT_CONTEXT_CLOCK_INVALID');

  const claims = {
    v: '1',
    iss: 'opscore-api',
    aud: 'opscore-database',
    purpose: mode === 'field' && apiKey ? 'api_key_operation' : basePurpose,
    identity_kind: mode === 'field' && apiKey ? 'api_key' : 'session',
    api_key_id: apiKey,
    access_mode: mode,
    sub: user,
    tenant_id: tenant,
    session_id: session,
    request_id: request,
    binding_scope: xid === null ? 'backend_session' : 'transaction',
    transaction_id: xid,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + MAX_ASSERTION_TTL_SECONDS,
    jti: crypto.randomUUID(),
    kid: keyId,
    backend_pid: pid
  };
  const payload = JSON.stringify(claims);
  if (Buffer.byteLength(payload, 'utf8') > 4096) throw fail('TENANT_CONTEXT_PAYLOAD_TOO_LARGE');
  const signature = hmacSha256(key, payload);
  return Object.freeze({
    payload, signature, expiresAt: claims.exp, backendPid: pid,
    transactionId: xid, accessMode: mode, purpose: claims.purpose, requestId: request
  });
}

async function bindSignedRlsSessionContext(client, {
  tenantId = '',
  userId = '',
  sessionId = '',
  apiKeyId = '',
  accessMode = 'field',
  requestId = crypto.randomUUID(),
  env = process.env
} = {}) {
  if (!client || typeof client.query !== 'function') throw fail('TENANT_CONTEXT_CLIENT_REQUIRED');
  const identity = await client.query('SELECT pg_backend_pid() AS backend_pid');
  const assertion = createSignedRlsSessionContext({
    tenantId, userId, sessionId, apiKeyId, accessMode,
    backendPid: Number(identity.rows[0] && identity.rows[0].backend_pid),
    transactionId: null, requestId, env
  });
  await client.query(
    "SELECT set_config('app.signed_context_payload',$1,false), set_config('app.signed_context_signature',$2,false), set_config('app.signed_context_request_id',$3,false), set_config('app.tenant_id',$4,false), set_config('app.user_id',$5,false), set_config('app.access_mode',$6,false)",
    [assertion.payload, assertion.signature, requestId, String(tenantId || ''), String(userId || ''), accessMode]
  );
  return assertion;
}

async function clearSignedRlsSessionContext(client) {
  if (!client || typeof client.query !== 'function') throw fail('TENANT_CONTEXT_CLIENT_REQUIRED');
  await client.query(
    "SELECT set_config('app.signed_context_payload','',false), set_config('app.signed_context_signature','',false), set_config('app.signed_context_request_id','',false), set_config('app.tenant_id','',false), set_config('app.user_id','',false), set_config('app.access_mode','',false), set_config('app.current_tenant_id','',false), set_config('app.organization_id','',false)"
  );
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
  const signature = hmacSha256(key, payload);
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
  createSignedTenantContext,
  RLS_SESSION_PURPOSES,
  createSignedRlsSessionContext,
  bindSignedRlsSessionContext,
  clearSignedRlsSessionContext
};
