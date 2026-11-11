'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'sql/postgres/053_control_plane_restrictive_tenant_guards.sql'), 'utf8');

test('control-plane policy migration separates permissive tenant access from restrictive tenant boundary', () => {
  for (const table of ['feature_flags', 'safe_mode_states', 'control_plane_runs']) {
    assert.match(migration, new RegExp(table));
  }


  assert.match(migration, /AS PERMISSIVE FOR ALL/i);
  assert.match(migration, /AS RESTRICTIVE FOR ALL/i);
  assert.match(migration, /opscore_tenant_permissive/);
  assert.match(migration, /opscore_tenant_boundary_guard/);
  assert.match(migration, /current_setting\(''app\.tenant_id'', true\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE)\s+INTO\b/i);
});

test('migration runner enforces the restrictive control-plane policy postcondition', () => {
  const runner = fs.readFileSync(path.join(root, 'scripts/apply-postgres-migrations.js'), 'utf8');
  assert.match(runner, /control_plane_restrictive_policy_gap_count/);
  assert.match(runner, /opscore_tenant_boundary_guard/);
  assert.match(runner, /polpermissive/);
  assert.match(runner, /control_plane_restrictive_policy_gap_count/);
});

test('live PostgreSQL RLS gate tests feature flags, safe mode state and control-plane run inserts', () => {
  const gate = fs.readFileSync(path.join(root, 'scripts/postgres-live-rls-gate.js'), 'utf8');
  assert.match(gate, /053_control_plane_restrictive_tenant_guards\.sql/);
  assert.match(gate, /control-plane-tenant-self-read/);
  assert.match(gate, /control-plane-cross-tenant-read-denied/);
  assert.match(gate, /control-plane-cross-tenant-insert-denied/);
  assert.ok(gate.includes("row.policy_roles === '{0}'"));
  assert.ok(gate.includes('rows.length === 2'));
  assert.ok(gate.includes('exactPermissive'));
  assert.ok(gate.includes('exactRestrictive'));
  const workflow = fs.readFileSync(path.resolve(root, '..', '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');
  assert.match(workflow, /backend\/sql\/postgres\/053_control_plane_restrictive_tenant_guards\.sql/);
});
