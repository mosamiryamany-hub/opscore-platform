'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTarget, unwrapOuterTransaction } = require('../scripts/apply-postgres-migrations');

const database = 'opscore_acceptance';
const projectId = 'summer-leaf-18448271';
const branchId = 'br-wispy-term-bcrqqj84';
const host = 'ep-prod-example.c-16.us-east-1.aws.neon.tech';

function connection(targetHost = host) {
  return new URL('postgresql://neondb_owner:never-print-this@' + targetHost + '/' + database);
}

function envFor(targetClass, overrides = {}) {
  return {
    OPSC_MIGRATION_TARGET_CLASS: targetClass,
    OPSC_MIGRATION_EXPECTED_DATABASE: database,
    OPSC_MIGRATION_EXPECTED_HOST: host,
    OPSC_MIGRATION_EXPECTED_PROJECT_ID: projectId,
    OPSC_MIGRATION_EXPECTED_BRANCH_ID: branchId,
    ...overrides
  };
}

test('database names containing acceptance never imply a Preview or test target', () => {
  assert.throws(
    () => assertTarget(connection(), database, false, {
      OPSC_MIGRATION_EXPECTED_DATABASE: database
    }),
    /MIGRATION_TARGET_CLASS_REQUIRED/
  );
});

test('local test migrations require an explicit test class and exact database name', () => {
  const local = connection('127.0.0.1');
  const env = envFor('test');
  assert.equal(assertTarget(local, database, false, env), 'preview-or-test');
  assert.equal(assertTarget(local, database, true, {
    ...env,
    OPSC_MIGRATION_CONFIRM_DATABASE: database
  }), 'preview-or-test');
  assert.throws(
    () => assertTarget(connection(), database, true, {
      ...env,
      OPSC_MIGRATION_CONFIRM_DATABASE: database
    }),
    /MIGRATION_TEST_TARGET_MUST_BE_LOCAL/
  );
  assert.throws(
    () => assertTarget(local, 'another_database', false, env),
    /MIGRATION_EXPECTED_DATABASE_MISMATCH/
  );
});

test('Preview migration requires exact endpoint, project, and branch identity', () => {
  const env = envFor('preview');
  assert.equal(assertTarget(connection(), database, false, env), 'preview-or-test');
  assert.throws(
    () => assertTarget(connection('ep-other.c-16.us-east-1.aws.neon.tech'), database, false, env),
    /MIGRATION_ENDPOINT_HOST_MISMATCH/
  );
  assert.throws(
    () => assertTarget(connection(), database, false, envFor('preview', {
      OPSC_MIGRATION_EXPECTED_BRANCH_ID: ''
    })),
    /MIGRATION_BRANCH_ID_REQUIRED/
  );
  assert.equal(assertTarget(connection(), database, true, {
    ...env,
    OPSC_MIGRATION_CONFIRM_DATABASE: database,
    OPSC_MIGRATION_CONFIRM_HOST: host,
    OPSC_MIGRATION_CONFIRM_PROJECT_ID: projectId,
    OPSC_MIGRATION_CONFIRM_BRANCH_ID: branchId
  }), 'preview-or-test');
  assert.throws(
    () => assertTarget(connection(), database, true, {
      ...env,
      OPSC_MIGRATION_CONFIRM_DATABASE: database,
      OPSC_MIGRATION_CONFIRM_HOST: host,
      OPSC_MIGRATION_CONFIRM_PROJECT_ID: projectId,
      OPSC_MIGRATION_CONFIRM_BRANCH_ID: 'br-wrong-branch'
    }),
    /MIGRATION_BRANCH_CONFIRMATION_REQUIRED/
  );
});

test('Production migration requires explicit opt-in and exact four-part confirmation', () => {
  const env = envFor('production');
  assert.throws(
    () => assertTarget(connection(), database, false, env),
    /MIGRATION_TARGET_NOT_PREVIEW_OR_TEST/
  );
  const optedIn = { ...env, OPSC_MIGRATION_ALLOW_PRODUCTION: '1' };
  assert.equal(assertTarget(connection(), database, false, optedIn), 'production-explicit-opt-in');
  assert.throws(
    () => assertTarget(connection(), database, true, optedIn),
    /MIGRATION_DATABASE_CONFIRMATION_REQUIRED/
  );
  const confirmed = {
    ...optedIn,
    OPSC_MIGRATION_CONFIRM_DATABASE: database,
    OPSC_MIGRATION_CONFIRM_HOST: host,
    OPSC_MIGRATION_CONFIRM_PROJECT_ID: projectId,
    OPSC_MIGRATION_CONFIRM_BRANCH_ID: branchId
  };
  assert.equal(assertTarget(connection(), database, true, confirmed), 'production-explicit-opt-in');
  assert.throws(
    () => assertTarget(connection(), database, true, {
      ...confirmed,
      OPSC_MIGRATION_CONFIRM_HOST: 'ep-other.c-16.us-east-1.aws.neon.tech'
    }),
    /MIGRATION_HOST_CONFIRMATION_REQUIRED/
  );
  assert.throws(
    () => assertTarget(connection(), database, false, {
      ...envFor('preview'),
      OPSC_MIGRATION_ALLOW_PRODUCTION: '1'
    }),
    /MIGRATION_PRODUCTION_OPT_IN_TARGET_CLASS_MISMATCH/
  );
});

test('pooler endpoints are always rejected for migrations', () => {
  assert.throws(
    () => assertTarget(connection('ep-prod-pooler.c-16.us-east-1.aws.neon.tech'), database, false, envFor('production', {
      OPSC_MIGRATION_ALLOW_PRODUCTION: '1'
    })),
    /MIGRATION_DIRECT_CONNECTION_REQUIRED/
  );
});

test('runner requires a least-privilege runtime role before migration work', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../scripts/apply-postgres-migrations.js'), 'utf8');
  assert.match(source, /MIGRATION_RUNTIME_ROLE_NOT_LEAST_PRIVILEGED/);
  assert.match(source, /set_config\('opscore\.app_role','opscore_runtime',true\)/);
  assert.match(source, /has_table_privilege\('opscore_runtime'/);
});


test('runner strips only the outer transaction wrapper so migration SQL and its ledger row commit atomically', () => {
  const migration = \`-- migration header
BEGIN;
CREATE TABLE public.atomic_example(id integer);
DO $body$
BEGIN
  PERFORM 1;
END
$body$;
COMMIT;
\`;
  const unwrapped = unwrapOuterTransaction(migration, '063_test.sql');
  assert.match(unwrapped, /^-- migration header\n/);
  assert.match(unwrapped, /CREATE TABLE public\.atomic_example/);
  assert.match(unwrapped, /DO \$body\$[\s\S]*?BEGIN[\s\S]*?END[\s\S]*?\$body\$;/);
  assert.doesNotMatch(unwrapped, /^\s*BEGIN\s*;/i);
  assert.doesNotMatch(unwrapped, /COMMIT\s*;\s*$/i);
});

test('runner fails closed when an explicit outer BEGIN has no final COMMIT', () => {
  assert.throws(
    () => unwrapOuterTransaction('-- header\nBEGIN;\nCREATE TABLE public.atomic_example(id integer);', 'bad.sql'),
    /MIGRATION_TRANSACTION_WRAPPER_UNBALANCED/
  );
});

test('runner preserves migration files that do not declare an outer transaction', () => {
  const migration = '-- plain migration\nCREATE INDEX ix_example ON public.atomic_example(id);\n';
  assert.equal(unwrapOuterTransaction(migration, 'plain.sql'), migration);
});
