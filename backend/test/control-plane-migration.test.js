'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration 042 defines control-plane tables and fail-closed tenant RLS', () => {
  const migrationPath = path.join(__dirname, '..', 'sql', 'postgres', '042_control_plane_tables.sql');
  assert.ok(fs.existsSync(migrationPath), 'migration 042 must ship with source');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const table of ['feature_flags', 'safe_mode_states', 'control_plane_runs']) {
    assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table));
    assert.match(sql, new RegExp('ALTER TABLE public\\.' + table + ' ENABLE ROW LEVEL SECURITY'));
    assert.match(sql, new RegExp('ALTER TABLE public\\.' + table + ' FORCE ROW LEVEL SECURITY'));
    assert.match(sql, new RegExp('CREATE POLICY opscore_tenant_boundary_guard ON public\\.' + table));
  }
  assert.match(sql, /current_setting\('app\.tenant_id', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});

test('migration 047 explicitly grants only the runtime operations required by control-plane tables', () => {
  const migrationPath = path.join(__dirname, '..', 'sql', 'postgres', '047_control_plane_runtime_privileges.sql');
  assert.ok(fs.existsSync(migrationPath), 'migration 047 must ship with source');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.feature_flags, public\.safe_mode_states, public\.control_plane_runs FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.feature_flags, public\.safe_mode_states, public\.control_plane_runs FROM opscore_app/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.feature_flags TO opscore_app/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.safe_mode_states TO opscore_app/);
  assert.match(sql, /GRANT INSERT ON TABLE public\.control_plane_runs TO opscore_app/);
  assert.doesNotMatch(sql, /GRANT ALL PRIVILEGES|GRANT DELETE|GRANT TRUNCATE/i);
});
