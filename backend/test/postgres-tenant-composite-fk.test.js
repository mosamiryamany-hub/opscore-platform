'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'sql/postgres/054_tenant_composite_foreign_keys.sql'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'scripts/postgres-tenant-composite-fk-gate.js'), 'utf8');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');

const versionMigration = fs.readFileSync(path.join(root, 'sql/postgres/055_completion_policy_version.sql'), 'utf8');
const localControlPlane = fs.readFileSync(path.join(root, 'src/local-control-plane.js'), 'utf8');
const platformIntelligence = fs.readFileSync(path.join(root, 'src/platform-intelligence-layer.js'), 'utf8');
const enterpriseAdditions = fs.readFileSync(path.join(root, 'src/enterprise-2026-additions.js'), 'utf8');
const fieldValueExtensions = fs.readFileSync(path.join(root, 'src/field-value-extensions.js'), 'utf8');
const geofencing = fs.readFileSync(path.join(root, 'src/geofencing.js'), 'utf8');

test('completion policy version migration backfills existing rows and enforces a positive version', () => {
  assert.match(versionMigration, /ADD COLUMN IF NOT EXISTS version INTEGER/i);
  assert.match(versionMigration, /UPDATE public\.completion_policies[\s\S]*SET version = 1[\s\S]*WHERE version IS NULL/i);
  assert.match(versionMigration, /ALTER COLUMN version SET DEFAULT 1/i);
  assert.match(versionMigration, /ALTER COLUMN version SET NOT NULL/i);
  assert.match(versionMigration, /CHECK \(version >= 1\)/i);
  assert.match(versionMigration, /VALIDATE CONSTRAINT completion_policies_version_positive/i);
});

test('PostgreSQL runtime skips DDL for migration-owned control-plane and twin tables', () => {
  for (const source of [localControlPlane, platformIntelligence, enterpriseAdditions, fieldValueExtensions]) {
    assert.match(source, /db\.engine\s*===\s*['"]postgres['"]/);
  }
  assert.equal((geofencing.match(/enabled=TRUE/g) || []).length, 3);
});

test('tenant FK migration installs and validates a composite key before removing the old FK', () => {
  assert.match(migration, /FOREIGN KEY \(%I, %I\) REFERENCES %I\.%I \(%I, %I\)/i);
  assert.ok(migration.indexOf('VALIDATE CONSTRAINT') < migration.indexOf('DROP CONSTRAINT'));
  assert.ok(migration.indexOf('DROP CONSTRAINT') < migration.indexOf('RENAME CONSTRAINT'));
  assert.match(migration, /organization_id/);
  assert.match(migration, /TENANT_FK_UNPAIRED_REFERENCES_REMAIN/);
});

test('tenant FK migration preserves nullable SET NULL and fails closed on unverified actions', () => {
  assert.match(migration, /ON DELETE SET NULL \(%I\)/i);
  assert.match(migration, /IF fk\.confupdtype <> 'a'/);
  assert.match(migration, /IF fk\.confmatchtype <> 's'/);
  assert.match(migration, /IF fk\.condeferrable OR fk\.condeferred/);
  assert.doesNotMatch(migration, /ON DELETE SET DEFAULT/);
  assert.doesNotMatch(migration, /ON UPDATE (?:CASCADE|RESTRICT|SET NULL|SET DEFAULT)/i);
  assert.match(migration, /array_length\(fk\.conkey, 1\) = 2/);
});

test('PostgreSQL 18 gate verifies two-tenant writes and delete actions under the least-privilege runtime role', () => {
  for (const token of [
    'opscore_runtime',
    'runtime-cross-tenant-insert',
    'runtime-cross-tenant-update',
    'on-delete-set-null-preserves-tenant-key',
    'on-delete-cascade-preserved',
    'on-delete-restrict-preserved',
    'self-reference-cross-tenant'
  ]) {
    assert.ok(gate.includes(token), 'gate must contain ' + token);
  }
  assert.match(gate, /assert\.equal\(runtime\.rolsuper, false,/);
  assert.match(gate, /assert\.equal\(runtime\.rolbypassrls, false,/);
  assert.match(workflow, /backend\/sql\/postgres\/\*\*/);
  assert.match(workflow, /scripts\/postgres-tenant-composite-fk-gate\.js/);
  assert.match(workflow, /image: postgis\/postgis:18-3\.7/);
  assert.match(workflow, /postgresql-18-pgvector/);
  assert.match(workflow, /opscore_http_acceptance/);
  assert.match(workflow, /opscore_matrix_test/);
  assert.match(workflow, /OPSC_PG_ACCEPTANCE_HOST=127\.0\.0\.1/);
  assert.match(workflow, /db:migrate:postgres -- --apply/);
  assert.match(workflow, /postgres-commercial-acceptance-http\.test\.js/);
  assert.match(workflow, /tenant-isolation-matrix\.test\.js/);
  assert.match(workflow, /GRANT opscore_app TO opscore_runtime/);
  assert.match(workflow, /ALTER ROLE opscore_runtime WITH LOGIN/);
});
