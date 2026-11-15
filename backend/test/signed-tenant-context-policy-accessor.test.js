'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const migrationPath = path.join(ROOT, 'sql', 'postgres', '067_signed_tenant_context_rls_policy_accessor_alignment.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const previousMigration = path.join(ROOT, 'sql', 'postgres', '066_signed_tenant_context_verifier_search_path_hardening.sql');

test('signed tenant policy alignment follows verifier search-path hardening', () => {
  assert.ok(fs.existsSync(previousMigration), '066 verifier hardening must precede 067 policy alignment');
  assert.match(migration.replace(/^--[^\\n]*(?:\\r?\\n|$)/gm, '').trimStart(), /^BEGIN;/);
  assert.match(migration.trimEnd(), /COMMIT;$/);
});

test('direct app.tenant_id policy expressions are rewritten through the canonical verified tenant accessor', () => {
  assert.match(migration, /opscore_current_tenant\(\)/);
  assert.match(migration, /regexp_replace/);
  assert.match(migration, /current_setting\\\('app\\\.tenant_id'/);
  assert.match(migration, /ALTER POLICY/);
  assert.match(migration, /COALESCE\(qual, ''\) ILIKE '%current_setting%app\.tenant_id%'/);
  assert.match(migration, /COALESCE\(with_check, ''\) ILIKE '%current_setting%app\.tenant_id%'/);
});

test('policy alignment preserves both USING and WITH CHECK expressions and fails closed on residual GUC policies', () => {
  assert.match(migration, /policy_row\.qual IS NOT NULL/);
  assert.match(migration, /policy_row\.with_check IS NOT NULL/);
  assert.match(migration, /USING \(%s\)/);
  assert.match(migration, /WITH CHECK \(%s\)/);
  assert.match(migration, /OPSC_SIGNED_CONTEXT_POLICY_EXPRESSION_NOT_REWRITABLE/);
  assert.match(migration, /OPSC_SIGNED_CONTEXT_POLICY_DIRECT_GUC_REMAINS/);
  assert.match(migration, /OPSC_SIGNED_CONTEXT_POLICY_ALIGNMENT_NO_POLICIES_CHANGED/);
});

test('policy alignment requires both the canonical tenant accessor and signed verifier', () => {
  assert.match(migration, /to_regprocedure\('public\.opscore_current_tenant\(\)'\)/);
  assert.match(migration, /to_regprocedure\('opscore_security\.verified_tenant_context\(\)'\)/);
});
