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
  assert.match(runner, /runtime_app_role_member/);
  assert.match(runner, /!post\.runtime_role_exists/);
});

test('live PostgreSQL gate tests the runtime role and tenant policies', () => {
  const gate = read('scripts/postgres-live-rls-gate.js');
  assert.ok(gate.includes('052_runtime_policy_function_grants.sql'));
  assert.match(gate, /SET LOCAL ROLE opscore_runtime/);
  assert.match(gate, /runtime-role-tenant-self-read/);
  assert.match(gate, /runtime-role-cross-tenant-read-denied/);
  assert.match(gate, /legacy_app_member/);
  assert.match(gate, /runtime-role-system-table-rls-and-least-privilege/);
  assert.ok(gate.includes("matches.length !== 3"));
  assert.ok(gate.includes("aliasCounts.n !== 2 || aliasCounts.sn !== 1"));
  const workflow = fs.readFileSync(path.resolve(root, '..', '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');
  assert.ok(workflow.includes('backend/sql/postgres/**'));
  assert.ok(workflow.includes('CREATE ROLE opscore_runtime NOLOGIN'));
  assert.ok(!workflow.includes('GRANT opscore_app TO opscore_runtime'));
});

test('migration 059 grants direct runtime privileges and transfers unscoped system-table RLS policies', () => {
  const migration = read('sql/postgres/059_runtime_system_table_policy_and_privilege_alignment.sql');
  for (const expected of [
    'GRANT USAGE ON SCHEMA public TO opscore_runtime',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opscore_runtime',
    'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_throttle, public.firewall_rate_buckets TO opscore_runtime',
    'GRANT INSERT ON TABLE public.worker_guard_system_events TO opscore_runtime',
    'REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM opscore_runtime',
    'GRANT SELECT ON TABLE public.spatial_ref_sys TO opscore_runtime'
  ]) assert.ok(migration.includes(expected), 'missing migration clause: ' + expected);
  for (const table of ['login_throttle', 'firewall_rate_buckets', 'worker_guard_system_events']) {
    assert.ok(migration.includes('ALTER POLICY opscore_system_table_guard ON public.' + table + ' TO opscore_runtime'));
  }
  assert.ok(!migration.includes('GRANT opscore_app TO opscore_runtime'));
  assert.ok(!migration.includes('TO PUBLIC'));
  assert.ok(!/BYPASSRLS|CREATEROLE|CREATEDB/i.test(migration));
});

test('migration 057 exposes only a runtime-bound read-only migration 056 attestation function', () => {
  const migration = read('sql/postgres/057_read_only_runtime_migration_ledger_attestation.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.opscore_attest_migration_056\(p_expected_sha256 text\)/);
  assert.match(migration, /STABLE\s+SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO pg_catalog, public, pg_temp/);
  assert.match(migration, /SET row_security = off/);
  assert.match(migration, /session_user <> 'opscore_runtime'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.opscore_attest_migration_056\(text\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.opscore_attest_migration_056\(text\) TO opscore_runtime/);
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.schema_migrations/i);
  assert.match(migration, /function_owner <> 'neondb_owner'/);
});


test('migration 058 pins every public SECURITY DEFINER routine to a catalog-first search path', () => {
  const migration = read('sql/postgres/058_security_definer_search_path_hardening.sql');
  assert.match(migration, /required_signatures text\[\]/);
  assert.match(migration, /opscore_attest_migration_056\(text\)/);
  assert.match(migration, /ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp/);
  assert.match(migration, /owner_superuser IS NOT FALSE/);
  assert.match(migration, /OPSC_SECURITY_DEFINER_SEARCH_PATH_HARDENING_FAILED/);
  assert.doesNotMatch(migration, /GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*TO\s+PUBLIC/i);
  assert.doesNotMatch(migration, /GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.schema_migrations/i);
});
