'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationDir = path.join(__dirname, '../sql/postgres');

function read(name) {
  return fs.readFileSync(path.join(migrationDir, name), 'utf8');
}

test('signed tenant verifier explicitly places pg_temp last after trusted schemas', () => {
  const initial = read('063_signed_tenant_context_verifier.sql');
  const hardening = read('066_signed_tenant_context_verifier_search_path_hardening.sql');
  assert.match(initial, /SECURITY DEFINER[\s\S]*?SET search_path TO pg_catalog, opscore_security/);
  assert.match(
    hardening,
    /ALTER FUNCTION opscore_security\.verified_tenant_context\(\)[\s\S]*?SET search_path TO pg_catalog, opscore_security, pg_temp/
  );
  assert.match(hardening, /OPSC_SIGNED_CONTEXT_VERIFIER_OWNER_OR_MODE_INVALID/);
  assert.match(hardening, /OPSC_SIGNED_CONTEXT_VERIFIER_SEARCH_PATH_HARDENING_FAILED/);
});

test('signed context privileged routing helper keeps pg_temp last', () => {
  const routing = read('064_signed_tenant_context_work_orders_routing.sql');
  assert.match(routing, /SECURITY DEFINER[\s\S]*?SET search_path TO pg_catalog, public, pg_temp/);
});

test('search-path hardening preserves runtime verifier access and HMAC key secrecy', () => {
  const hardening = read('066_signed_tenant_context_verifier_search_path_hardening.sql');
  assert.match(hardening, /has_function_privilege\([\s\S]*?'opscore_runtime'[\s\S]*?'EXECUTE'/);
  assert.match(hardening, /OPSC_SIGNED_CONTEXT_PUBLIC_EXECUTE_REMAINS/);
  assert.match(hardening, /OPSC_SIGNED_CONTEXT_RUNTIME_CAN_READ_HMAC_KEYS/);
});
