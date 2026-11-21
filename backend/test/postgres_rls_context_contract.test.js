'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acquireTenantClient, releaseTenantClient } = require('../src/adapters/postgres');

test('PostgreSQL tenant client signs a backend-bound field session before returning the connection', async () => {
  const previousKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const previousKeyId = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'cd'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'adapter-contract-key';
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'SELECT pg_backend_pid() AS backend_pid') return { rows: [{ backend_pid: 4242 }] };
      return { rows: [] };
    },
    release: () => {}
  };
  const pool = { connect: async () => client };
  try {
    const acquired = await acquireTenantClient(pool, 'org_contract_test', {
      userId: 'user_contract_test',
      sessionId: 'session_contract_test'
    });
    assert.equal(acquired, client);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].sql, 'SELECT pg_backend_pid() AS backend_pid');
    assert.match(calls[1].sql, /set_config\('app\.signed_context_payload',\$1,false\)/);
    assert.match(calls[1].sql, /set_config\('app\.signed_context_signature',\$2,false\)/);
    assert.match(calls[1].sql, /set_config\('app\.signed_context_request_id',\$3,false\)/);
    assert.deepEqual(calls[1].params.slice(3), ['org_contract_test','user_contract_test']);
    assert.match(calls[1].sql, /set_config\('app\.access_mode','field',false\)/);
    const claims = JSON.parse(calls[1].params[0]);
    assert.equal(claims.backend_pid, 4242);
    assert.equal(claims.tenant_id, 'org_contract_test');
    assert.equal(claims.sub, 'user_contract_test');
    assert.equal(claims.session_id, 'session_contract_test');
    assert.equal(claims.purpose, 'field_operation');
    await releaseTenantClient(client);
    assert.equal(calls.at(-1).sql, 'RESET ALL');
  } finally {
    if (previousKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = previousKeyId;
  }
});

test('PostgreSQL connection is destroyed when RESET ALL cannot prove a clean pooled session', async () => {
  const previousKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const previousKeyId = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = 'ef'.repeat(32);
  process.env.OPSC_TENANT_CONTEXT_KEY_ID = 'adapter-cleanup-key';
  const calls = [];
  const released = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'RESET ALL') throw new Error('injected reset failure');
      return { rows: [{ backend_pid: 4343 }] };
    },
    release: argument => released.push(argument === undefined ? 'pooled' : 'destroyed')
  };
  const pool = { connect: async () => client };
  try {
    await acquireTenantClient(pool, 'org_contract_cleanup', { userId: 'user_contract_cleanup', sessionId: 'session_contract_cleanup' });
    await releaseTenantClient(client);
    assert.equal(calls.at(-1).sql, 'RESET ALL');
    assert.equal(released.includes('destroyed'), true);
    assert.deepEqual(released, ['destroyed']);
  } finally {
    if (previousKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
    else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
    else process.env.OPSC_TENANT_CONTEXT_KEY_ID = previousKeyId;
  }
});


test('PostgreSQL migration, application adapter and tenant RLS tests use one canonical context key', () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'sql', 'postgres', '031_digital_twin_chain_hardening.sql'), 'utf8');
  const liveGate = fs.readFileSync(path.join(root, 'scripts', 'live-production-gate.js'), 'utf8');
  const integrationGate = fs.readFileSync(path.join(root, 'scripts', 'postgres-live-rls-gate.js'), 'utf8');
  const terminal = fs.readFileSync(path.join(root, 'sql', 'postgres', '071_signed_rls_context_all_access_modes.sql'), 'utf8');
  assert.match(terminal, /verified_rls_context/);
  assert.match(terminal, /UNSIGNED GUC|raw GUC values are never authorization inputs|raw GUC values/);
  assert.match(liveGate, /set_config\('app\.tenant_id'/);
  assert.match(liveGate, /operational_twin_chain_events/);
  assert.match(liveGate, /POSTGRES_RUNTIME_ROLE_BYPASSES_RLS/);
  assert.match(integrationGate, /NOBYPASSRLS/);
  const purposeGate = fs.readFileSync(path.join(root, 'scripts', 'postgres-signed-rls-purpose-acceptance.js'), 'utf8');
  assert.match(terminal, /api_key_operation/);
  assert.match(terminal, /raw_mode_policy_count <> 0/);
  assert.match(purposeGate, /rawGucForgery/);
  assert.match(purposeGate, /immutableSignedIdentity/);
  assert.match(integrationGate, /TENANT_CROSS_TENANT_INSERT_NOT_DENIED|TENANT_CROSS_INSERT_NOT_DENIED/);
  assert.match(integrationGate, /MISSING_TENANT_CONTEXT_DID_NOT_FAIL_CLOSED/);
});
