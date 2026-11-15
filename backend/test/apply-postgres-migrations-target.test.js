'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTarget, extractNeonEndpointId, readMigrations, unwrapOuterTransaction, verifyNeonEndpointIdentity, tenantPolicyExprValid } = require('../scripts/apply-postgres-migrations');

const database = 'opscore_acceptance';
const projectId = 'summer-leaf-18448271';
const branchId = 'br-wispy-term-bcrqqj84';
const host = 'ep-prod-example.c-16.us-east-1.aws.neon.tech';

function connection(targetHost = host) {
  return new URL('postgresql://neondb_owner:never-print-this@' + targetHost + '/' + database);
}


function fakeNeonResponse(endpointOverrides={}) {
  return async (url,options) => {
    assert.match(url,/^https:\/\/console\.neon\.tech\/api\/v2\/projects\//);
    assert.equal(options.method,'GET');
    assert.equal(options.headers.accept,'application/json');
    assert.equal(options.headers.authorization,'Bearer test-neon-api-key');
    return {
      ok:true,
      json:async()=>({endpoints:[{
        id:'ep-prod-example',
        project_id:projectId,
        branch_id:branchId,
        host,
        type:'read_write',
        ...endpointOverrides
      }]})
    };
  };
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



test('runner safely unwraps every checked-in migration transaction before adding its ledger row', () => {
  const migrations = readMigrations();
  assert.ok(migrations.length >= 60, 'expected the complete ordered PostgreSQL migration set');
  const wrapped = [];
  for (const migration of migrations) {
    const prepared = unwrapOuterTransaction(migration.content, migration.filename);
    if (prepared !== migration.content) {
      wrapped.push(migration.filename);
      assert.doesNotMatch(prepared.trimStart(), /^BEGIN\s*;/i, migration.filename);
      assert.doesNotMatch(prepared.trimEnd(), /COMMIT\s*;$/i, migration.filename);
    }
  }
  assert.ok(wrapped.length >= 10, 'expected existing transaction-wrapped migrations to be covered');
});


test('Neon endpoint identity is independently resolved from the project API before non-test migrations', async () => {
  const env = {...envFor('preview'), NEON_API_KEY:'test-neon-api-key'};
  const identity = await verifyNeonEndpointIdentity(connection(), env, fakeNeonResponse());
  assert.deepEqual(identity, {
    verified:true,
    endpointId:'ep-prod-example',
    projectId,
    branchId,
    host,
    endpointType:'read_write'
  });
});

test('Neon endpoint identity fails closed when API credentials or endpoint metadata are missing', async () => {
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(), envFor('preview'), fakeNeonResponse()),
    /MIGRATION_NEON_API_KEY_REQUIRED/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(), {...envFor('preview'),NEON_API_KEY:'test-neon-api-key'},
      async()=>({ok:true,json:async()=>({endpoints:[]})})),
    /MIGRATION_NEON_ENDPOINT_NOT_UNIQUELY_RESOLVED/
  );
  const duplicate=async()=>({ok:true,json:async()=>({endpoints:[
    {id:'ep-prod-example',project_id:projectId,branch_id:branchId,host,type:'read_write'},
    {id:'ep-prod-example',project_id:projectId,branch_id:branchId,host,type:'read_write'}
  ]})});
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(), {...envFor('preview'),NEON_API_KEY:'test-neon-api-key'},duplicate),
    /MIGRATION_NEON_ENDPOINT_NOT_UNIQUELY_RESOLVED/
  );
});

test('Neon endpoint identity rejects project, branch, hostname and endpoint type mismatches', async () => {
  const env={...envFor('preview'),NEON_API_KEY:'test-neon-api-key'};
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,fakeNeonResponse({project_id:'wrong-project'})),
    /MIGRATION_NEON_PROJECT_IDENTITY_MISMATCH/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,fakeNeonResponse({branch_id:'br-wrong-branch'})),
    /MIGRATION_NEON_BRANCH_IDENTITY_MISMATCH/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,fakeNeonResponse({host:'ep-other.c-16.us-east-1.aws.neon.tech'})),
    /MIGRATION_NEON_ENDPOINT_HOST_IDENTITY_MISMATCH/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,fakeNeonResponse({type:'read_only'})),
    /MIGRATION_NEON_READ_WRITE_ENDPOINT_REQUIRED/
  );
});

test('Neon API errors and malformed JSON fail closed without exposing credentials', async () => {
  const env={...envFor('preview'),NEON_API_KEY:'do-not-print-this'};
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,async()=>({ok:false,status:401})),
    /MIGRATION_NEON_IDENTITY_API_REJECTED/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,async()=>({ok:true,json:async()=>{throw new Error('private response details')}})),
    error=>error.message==='MIGRATION_NEON_IDENTITY_RESPONSE_INVALID'&&!error.message.includes(env.NEON_API_KEY)
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(connection(),env,async()=>{throw new Error('private network details');}),
    error=>error.message==='MIGRATION_NEON_IDENTITY_API_UNAVAILABLE'&&!error.message.includes(env.NEON_API_KEY)
  );
});

test('local test target deliberately skips Neon API identity lookup', async () => {
  const result=await verifyNeonEndpointIdentity(connection('127.0.0.1'),envFor('test'));
  assert.deepEqual(result,{verified:false,skipped:true,reason:'loopback-test-target'});
});


test('control-plane migration postcondition accepts the verified tenant accessor used by signed RLS policies', () => {
  assert.equal(tenantPolicyExprValid('(organization_id = opscore_current_tenant())'), true);
  assert.equal(tenantPolicyExprValid('(organization_id = NULLIF(current_setting(\\'app.tenant_id\\'::text, true), \\'\\'::text))'), true);
  assert.equal(tenantPolicyExprValid('(organization_id = current_user)'), false);
  assert.equal(tenantPolicyExprValid('(id = opscore_current_tenant())'), false);
});

test('runner strips only the outer transaction wrapper so migration SQL and its ledger row commit atomically', () => {
  const migration = [
    '-- migration header',
    'BEGIN;',
    'CREATE TABLE public.atomic_example(id integer);',
    'DO $body$',
    'BEGIN',
    '  PERFORM 1;',
    'END',
    '$body$;',
    'COMMIT;',
    ''
  ].join('\n');
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


test('runner rejects transaction wrapper syntax it cannot safely unwrap', () => {
  assert.throws(
    () => unwrapOuterTransaction('BEGIN TRANSACTION;\nCREATE TABLE public.atomic_example(id integer);\nCOMMIT;', 'unsupported.sql'),
    /MIGRATION_TRANSACTION_WRAPPER_UNSUPPORTED/
  );
});

test('runner writes migration ledger before committing the runner-owned transaction', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../scripts/apply-postgres-migrations.js'), 'utf8');
  const loopStart = source.indexOf('const applied=[];');
  const begin = source.indexOf("await client.query('BEGIN');", loopStart);
  const migration = source.indexOf('await client.query(unwrapOuterTransaction(migration.content,migration.filename));', begin);
  const ledger = source.indexOf("await client.query('INSERT INTO public.schema_migrations", migration);
  const commit = source.indexOf("await client.query('COMMIT')", ledger);
  assert.ok(loopStart >= 0 && begin > loopStart && migration > begin && ledger > migration && commit > ledger);
});
