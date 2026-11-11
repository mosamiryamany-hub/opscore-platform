'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('runtime policy helper grant is narrow and role-specific', () => {
  const migration = read('sql/postgres/052_runtime_policy_function_grants.sql');
  assert.match(migration, /to_regprocedure\('public\.opscore_is_privileged\(\)'\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.opscore_is_privileged\(\) TO opscore_runtime/);
  assert.doesNotMatch(migration, /TO PUBLIC/i);
  assert.doesNotMatch(migration, /ALTER\s+ROLE|CREATE\s+ROLE|GRANT[^;]*TO\s+PUBLIC/i);
});

test('migration runner verifies runtime role RLS helper privileges without granting RLS bypass', () => {
  const runner = read('scripts/apply-postgres-migrations.js');
  assert.match(runner, /runtime_role_exists/);
  assert.match(runner, /runtime_login/);
  assert.match(runner, /runtime_bypassrls/);
  assert.match(runner, /runtime_privileged_membership_count/);
  assert.match(runner, /runtime_privileged_execute/);
  assert.match(runner, /runtime_policy_function_gap_count/);
  assert.match(runner, /runtime_control_plane_privilege_gap_count/);
  assert.match(runner, /runtime_database_create/);
  assert.match(runner, /runtime_schema_create/);
  assert.match(runner, /runtime_neon_superuser_set/);
  assert.match(runner, /!post\.runtime_role_exists/);
});

test('live PostgreSQL gate tests the runtime role and tenant policies', () => {
  const gate = read('scripts/postgres-live-rls-gate.js');
  assert.match(gate, /052_runtime_policy_function_grants\.sql/);
  assert.match(gate, /SET LOCAL ROLE opscore_runtime/);
  assert.match(gate, /runtime-role-tenant-self-read/);
  assert.match(gate, /runtime-role-cross-tenant-read-denied/);
  const workflow = fs.readFileSync(path.resolve(root, '..', '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');
  assert.match(workflow, /backend\/sql\/postgres\/052_runtime_policy_function_grants\.sql/);
  assert.match(workflow, /CREATE ROLE opscore_runtime NOLOGIN/);
});
