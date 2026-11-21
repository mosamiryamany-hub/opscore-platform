'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  MAX_ASSERTION_TTL_SECONDS,
  RLS_SESSION_PURPOSES,
  createSignedRlsSessionContext
} = require('../src/signed-tenant-context');

const keyHex = 'ab'.repeat(32);
const env = { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: 'unit-test-key' };
const common = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  sessionId: 'session-a',
  backendPid: 12345,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  env,
  nowMs: 1_800_000_000_000
};

test('each application purpose has a distinct HMAC over the exact backend and request binding', () => {
  for (const [accessMode, purpose] of Object.entries(RLS_SESSION_PURPOSES)) {
    const isField = accessMode === 'field';
    const signed = createSignedRlsSessionContext({
      ...common,
      tenantId: isField ? 'tenant-a' : '',
      userId: isField ? 'user-a' : '',
      sessionId: isField ? 'session-a' : '',
      accessMode
    });
    const claims = JSON.parse(signed.payload);
    assert.equal(claims.purpose, purpose);
    assert.equal(claims.access_mode, accessMode);
    assert.equal(claims.tenant_id, isField ? 'tenant-a' : null);
    assert.equal(claims.sub, isField ? 'user-a' : null);
    assert.equal(claims.session_id, isField ? 'session-a' : null);
    assert.equal(claims.backend_pid, 12345);
    assert.equal(claims.request_id, common.requestId);
    assert.equal(claims.binding_scope, 'backend_session');
    assert.equal(claims.transaction_id, null);
    assert.equal(claims.exp - claims.iat, MAX_ASSERTION_TTL_SECONDS);
    const expected = crypto.createHmac('sha256', Buffer.from(keyHex, 'hex')).update(signed.payload, 'utf8').digest('hex');
    assert.equal(signed.signature, expected);
  }
});

test('field mode requires a real session identity and cannot be rebound to an API key', () => {
  assert.throws(() => createSignedRlsSessionContext({ ...common, sessionId: '', accessMode: 'field' }), /TENANT_CONTEXT_FIELD_SESSION_PRINCIPAL_REQUIRED/);
  const keyContext = createSignedRlsSessionContext({ ...common, sessionId: '', apiKeyId: 'key-123', accessMode: 'field' });
  const claims = JSON.parse(keyContext.payload);
  assert.equal(claims.purpose, 'api_key_operation');
  assert.equal(claims.identity_kind, 'api_key');
  assert.equal(claims.api_key_id, 'key-123');
  assert.equal(claims.session_id, null);
});

test('transaction-bound context includes the exact transaction identity', () => {
  const signed = createSignedRlsSessionContext({ ...common, transactionId: '987654321', accessMode: 'field' });
  const claims = JSON.parse(signed.payload);
  assert.equal(claims.binding_scope, 'transaction');
  assert.equal(claims.transaction_id, '987654321');
});

test('signer rejects unsupported modes, malformed transaction IDs, bad backend IDs and missing keys', () => {
  assert.throws(() => createSignedRlsSessionContext({ ...common, accessMode: 'operator' }), /TENANT_CONTEXT_ACCESS_MODE_INVALID/);
  assert.throws(() => createSignedRlsSessionContext({ ...common, transactionId: 'bad' }), /TENANT_CONTEXT_TRANSACTION_ID_INVALID/);
  assert.throws(() => createSignedRlsSessionContext({ ...common, backendPid: 0 }), /TENANT_CONTEXT_BACKEND_ID_INVALID/);
  assert.throws(() => createSignedRlsSessionContext({ ...common, env: {} }), /TENANT_CONTEXT_SIGNING_KEY_REQUIRED/);
});
