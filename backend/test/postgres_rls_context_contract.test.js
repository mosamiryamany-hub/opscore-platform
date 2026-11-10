'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acquireTenantClient, releaseTenantClient } = require('../src/adapters/postgres');

test('PostgreSQL tenant client sets the exact app.tenant_id key consumed by RLS policies', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; }, release: () => {} };
  const pool = { connect: async () => client };
  const acquired = await acquireTenantClient(pool, 'org_contract_test');
  assert.equal(acquired, client);
  assert.match(calls[0].sql, /set_config\('app\.tenant_id',\$1,false\)/);
  assert.match(calls[0].sql, /set_config\('app\.current_tenant_id',\$1,false\)/);
  assert.match(calls[0].sql, /set_config\('app\.organization_id',\$1,false\)/);
  assert.deepEqual(calls[0].params, ['org_contract_test']);
  await releaseTenantClient(client);
  assert.equal(calls.at(-1).sql, 'RESET ALL');
});

test('PostgreSQL cleanup fallback clears every tenant alias before pooling a connection', async () => {
  const calls = [];
  const released = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'RESET ALL') throw new Error('injected reset failure');
      return { rows: [] };
    },
    release: argument => released.push(argument === undefined ? 'pooled' : 'destroyed')
  };
  const pool = { connect: async () => client };
  await acquireTenantClient(pool, 'org_contract_cleanup');
  await releaseTenantClient(client);
  const cleanup = calls.at(-1);
  assert.match(cleanup.sql, /set_config\('app\.tenant_id', '', false\)/);
  assert.match(cleanup.sql, /set_config\('app\.current_tenant_id', '', false\)/);
  assert.match(cleanup.sql, /set_config\('app\.organization_id', '', false\)/);
  assert.deepEqual(released, ['pooled']);
});


test('PostgreSQL migration, application adapter and tenant RLS tests use one canonical context key', () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'sql', 'postgres', '031_digital_twin_chain_hardening.sql'), 'utf8');
  const liveGate = fs.readFileSync(path.join(root, 'scripts', 'live-production-gate.js'), 'utf8');
  const integrationGate = fs.readFileSync(path.join(root, 'scripts', 'postgres-live-rls-gate.js'), 'utf8');
  assert.match(migration, /current_setting\('app\.tenant_id', true\)/);
  assert.match(liveGate, /set_config\('app\.tenant_id'/);
  assert.match(liveGate, /operational_twin_chain_events/);
  assert.match(liveGate, /POSTGRES_RUNTIME_ROLE_BYPASSES_RLS/);
  assert.match(integrationGate, /NOBYPASSRLS/);
  assert.match(integrationGate, /TENANT_CROSS_TENANT_INSERT_NOT_DENIED|TENANT_CROSS_INSERT_NOT_DENIED/);
  assert.match(integrationGate, /MISSING_TENANT_CONTEXT_DID_NOT_FAIL_CLOSED/);
});
