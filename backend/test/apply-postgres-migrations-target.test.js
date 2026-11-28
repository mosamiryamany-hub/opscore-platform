'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTarget, expectedMigrationOwnerRole, extractNeonEndpointId, readMigrations, unwrapOuterTransaction, verifyNeonEndpointIdentity, tenantPolicyExprValid, validateAppRolePreflight, verifyLegacyAppRoleOptionalCatalog } = require('../scripts/apply-postgres-migrations');

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

test('Preview, Production and test migrations require the exact Neon migration owner role', () => {
  assert.equal(expectedMigrationOwnerRole(envFor('preview')), 'neondb_owner');
  assert.equal(expectedMigrationOwnerRole(envFor('preview', { OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'neondb_owner' })), 'neondb_owner');
  assert.equal(expectedMigrationOwnerRole(envFor('production')), 'neondb_owner');
  assert.equal(expectedMigrationOwnerRole(envFor('test')), 'neondb_owner');
  assert.throws(
    () => expectedMigrationOwnerRole(envFor('production', { OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'opscore_owner' })),
    /MIGRATION_OWNER_ROLE_NOT_ALLOWED/
  );
  assert.throws(
    () => expectedMigrationOwnerRole(envFor('preview', { OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'opscore_owner' })),
    /MIGRATION_OWNER_ROLE_NOT_ALLOWED/
  );
  assert.throws(
    () => expectedMigrationOwnerRole(envFor('preview', { OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'arbitrary_admin' })),
    /MIGRATION_OWNER_ROLE_NOT_ALLOWED/
  );
});

test('pinned Neon identity is limited to the exact disposable Preview project, branch, direct host and database', async () => {
  const env = {
    ...envFor('preview', { OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'neondb_owner' }),
    OPSC_MIGRATION_PINNED_NEON_IDENTITY: '1',
    OPSC_MIGRATION_EXPECTED_PROJECT_ID: 'sweet-union-58466913',
    OPSC_MIGRATION_EXPECTED_BRANCH_ID: 'br-muddy-pine-bbrexgxx',
    OPSC_MIGRATION_EXPECTED_HOST: 'ep-green-frog-bbyayuh5.c-15.us-east-1.aws.neon.tech'
  };
  const url = new URL('postgresql://neondb_owner:never-print-this@ep-green-frog-bbyayuh5.c-15.us-east-1.aws.neon.tech/opscore_acceptance?sslmode=verify-full&channel_binding=require');
  const result = await verifyNeonEndpointIdentity(url, env);
  assert.equal(result.verified, false);
  assert.equal(result.skipped, true);
  assert.equal(result.pinned, true);
  assert.equal(result.verification, 'STATIC_EXACT_PREVIEW_TARGET');
  assert.equal(result.projectId, 'sweet-union-58466913');
  assert.equal(result.branchId, 'br-muddy-pine-bbrexgxx');
  assert.equal(result.host, 'ep-green-frog-bbyayuh5.c-15.us-east-1.aws.neon.tech');
  await assert.rejects(
    () => verifyNeonEndpointIdentity(new URL('postgresql://opscore_owner:x@ep-other.c-15.us-east-1.aws.neon.tech/opscore_acceptance'), env),
    /MIGRATION_PINNED_NEON_IDENTITY_MISMATCH/
  );
  await assert.rejects(
    () => verifyNeonEndpointIdentity(new URL('postgresql://opscore_owner:x@ep-green-frog-bbyayuh5.c-15.us-east-1.aws.neon.tech/neondb'), env),
    /MIGRATION_PINNED_NEON_IDENTITY_MISMATCH/
  );
});

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
  // The legacy app role is optional on Neon; migration context is bound only
  // when the role exists. Runtime authorization remains independently constrained.
  assert.match(source, /set_config\('opscore\.app_role',CASE WHEN EXISTS\(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname='opscore_app'\) THEN 'opscore_app' ELSE '' END,true\)/);
  assert.doesNotMatch(source, /set_config\('opscore\.app_role','opscore_app',true\)/);
  assert.match(source, /has_table_privilege\('opscore_runtime'/);
  assert.match(source, /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/);
  assert.match(source, /app_bypassrls/);
  assert.match(source, /app_privileged_membership_count/);
  assert.match(source, /pg_has_role\(r\.rolname,elevated\.oid,'MEMBER'\)/);
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
  assert.equal(tenantPolicyExprValid("(organization_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))"), true);
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

test('legacy opscore_app repair is allowed only for an inactive, unowned role with no unexpected elevated memberships', () => {
  const role = {
    role_exists: true,
    rolsuper: false,
    rolbypassrls: true,
    rolcreaterole: true,
    rolcreatedb: true,
    active_sessions: '0',
    owned_objects: '0',
    incoming_memberships: '0',
    current_user_admin_option: true,
    memberships: ['neon_superuser']
  };
  assert.deepEqual(validateAppRolePreflight(role, true), {
    status: 'REPAIR_PENDING',
    repairPending: true,
    roleExists: true,
    quarantinedOutgoingMemberships: ['neon_superuser']
  });
  assert.deepEqual(validateAppRolePreflight({
    ...role,
    memberships: '{neon_superuser}'
  }, true), {
    status: 'REPAIR_PENDING',
    repairPending: true,
    roleExists: true,
    quarantinedOutgoingMemberships: ['neon_superuser']
  });
  assert.throws(
    () => validateAppRolePreflight({ ...role, current_user_admin_option: false }, true),
    /MIGRATION_APP_ROLE_REPAIR_ADMIN_OPTION_REQUIRED/
  );
});

test('legacy opscore_app lockdown refuses to rewrite a role with active sessions or owned objects', () => {
  const base = {
    role_exists: true,
    rolsuper: false,
    rolbypassrls: true,
    rolcreaterole: true,
    rolcreatedb: true,
    active_sessions: 0,
    owned_objects: 0,
    incoming_memberships: 0,
    memberships: ['neon_superuser']
  };
  assert.throws(
    () => validateAppRolePreflight({ ...base, active_sessions: 1 }, true),
    /MIGRATION_APP_ROLE_REPAIR_HAS_ACTIVE_SESSIONS/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...base, owned_objects: 1 }, true),
    /MIGRATION_APP_ROLE_REPAIR_OWNS_OBJECTS/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...base, incoming_memberships: 1 }, true),
    /MIGRATION_APP_ROLE_REPAIR_HAS_INCOMING_MEMBERSHIPS/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...base, memberships: ['neon_superuser', 'unrelated_admin'] }, true),
    /MIGRATION_APP_ROLE_REPAIR_UNEXPECTED_MEMBERSHIPS/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...base, rolsuper: true }, true),
    /MIGRATION_APP_ROLE_REPAIR_SUPERUSER_FORBIDDEN/
  );
});

test('locked legacy opscore_app is accepted only with no login, no inheritance and the single disclosed Neon-managed residual', () => {
  const role = {
    role_exists: true,
    rolcanlogin: false,
    rolinherit: false,
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
    active_sessions: 0,
    owned_objects: 0,
    incoming_memberships: 0,
    memberships: []
  };
  assert.deepEqual(validateAppRolePreflight(role, false), {
    status: 'PASS',
    repairPending: false,
    roleExists: true
  });
  assert.deepEqual(validateAppRolePreflight({ ...role, memberships: ['neon_superuser'] }, false), {
    status: 'PASS_WITH_ADMIN_RESIDUAL',
    repairPending: false,
    roleExists: true,
    administrativeResidual: 'opscore_app -> neon_superuser membership remains; role is NOLOGIN/NOINHERIT/NOBYPASSRLS and has no incoming memberships'
  });
  assert.throws(
    () => validateAppRolePreflight({ ...role, rolcanlogin: true, memberships: ['neon_superuser'] }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...role, rolinherit: true, memberships: ['neon_superuser'] }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...role, incoming_memberships: 1 }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/
  );
  assert.throws(
    () => validateAppRolePreflight({ ...role, memberships: ['neon_superuser', 'unrelated_role'] }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/
  );
  assert.deepEqual(validateAppRolePreflight({ ...role, role_exists: false }, false), {
    status: 'PASS_WITH_ABSENT_LEGACY_ROLE',
    repairPending: false,
    roleExists: false,
    note: 'OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED'
  });
  assert.throws(
    () => validateAppRolePreflight({ ...role, role_exists: false, rolcanlogin: true }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/
  );
});

test('migration plan includes one in-place lockdown and reports the Neon-managed membership residual', () => {
  const migrations = readMigrations();
  const repairs = migrations.filter(item => item.filename === '068_opscore_app_role_privilege_lockdown.sql');
  assert.equal(repairs.length, 1);
  assert.match(repairs[0].content, /OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED/);
  assert.doesNotMatch(repairs[0].content, /CREATE ROLE opscore_app/);
  assert.doesNotMatch(repairs[0].content, /ALTER ROLE opscore_app RENAME TO/);
  assert.match(repairs[0].content, /ALTER ROLE opscore_app[\s\S]*?NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS/);
  assert.match(repairs[0].content, /OPSC_LEGACY_APP_ROLE_HAS_ACTIVE_SESSIONS/);
  assert.match(repairs[0].content, /OPSC_LEGACY_APP_ROLE_OWNS_OBJECTS/);
  assert.match(repairs[0].content, /OPSC_LOCKED_APP_ROLE_MEMBERSHIP_POSTCONDITION_FAILED/);
  assert.match(repairs[0].content, /neon_superuser/);
  assert.match(repairs[0].content, /OPSC_LEGACY_APP_ROLE_ADMIN_OPTION_REQUIRED/);
});

test('legacy app-role migration reconciliation requires complete catalog-equivalence evidence', async () => {
  const validRow = {
    required_table_count: '12',
    forced_rls_table_count: '12',
    system_policy_target_table_count: '3',
    work_order_context_policy: true,
    ledger_owner_policy: true,
    privileged_function_definer: true,
    contextual_functions_present: true,
    legacy_app_role_contract: true
  };
  const verified = await verifyLegacyAppRoleOptionalCatalog({
    query: async sql => {
      assert.match(sql, /opscore_system_table_guard/);
      assert.match(sql, /opscore_schema_migrations_owner_only/);
      assert.match(sql, /opscore_app/);
      return { rows: [validRow] };
    }
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.verifier, 'legacy_app_role_optional_catalog_equivalence_v1');
  const rejected = await verifyLegacyAppRoleOptionalCatalog({
    query: async () => ({ rows: [{ ...validRow, forced_rls_table_count: '11' }] })
  });
  assert.equal(rejected.verified, false);
});

test('self-hosted migrations require an operator-pinned host, database, direct TLS and dedicated migrator role', async () => {
  const selfHost = 'db.customer.example';
  const url = new URL('postgresql://opscore_migrator:never-print-this@' + selfHost + '/' + database + '?sslmode=verify-full');
  const env = {
    OPSC_MIGRATION_TARGET_CLASS: 'self-hosted',
    OPSC_MIGRATION_EXPECTED_DATABASE: database,
    OPSC_MIGRATION_EXPECTED_HOST: selfHost,
    OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'opscore_migrator',
    NODE_ENV: 'production',
    OPSC_PG_SSL_MODE: 'verify-full'
  };
  assert.equal(expectedMigrationOwnerRole(env), 'opscore_migrator');
  assert.equal(assertTarget(url, database, false, env), 'self-hosted-explicit-target');
  assert.deepEqual(await verifyNeonEndpointIdentity(url, env), {
    verified: false,
    skipped: true,
    reason: 'operator-pinned-self-hosted-target',
    host: selfHost,
    database,
    verification: 'EXPLICIT_HOST_DATABASE_AND_TLS_PIN'
  });
  const confirmed = {
    ...env,
    OPSC_MIGRATION_CONFIRM_DATABASE: database,
    OPSC_MIGRATION_CONFIRM_HOST: selfHost,
    OPSC_MIGRATION_ALLOW_SELF_HOSTED: '1'
  };
  assert.equal(assertTarget(url, database, true, confirmed), 'self-hosted-explicit-target');
  assert.throws(() => assertTarget(url, database, true, {
    ...confirmed,
    OPSC_MIGRATION_ALLOW_SELF_HOSTED: undefined
  }), /MIGRATION_SELF_HOSTED_APPLY_OPT_IN_REQUIRED/);
  assert.throws(() => assertTarget(
    new URL('postgresql://opscore_migrator:x@db.other.example/' + database + '?sslmode=verify-full'),
    database, false, env
  ), /MIGRATION_ENDPOINT_HOST_MISMATCH/);
  assert.throws(() => assertTarget(
    new URL('postgresql://opscore_migrator:x@' + selfHost + '/' + database + '?sslmode=require'),
    database, false, env
  ), /MIGRATION_SELF_HOSTED_TLS_VERIFY_FULL_REQUIRED/);
  assert.throws(() => expectedMigrationOwnerRole({
    ...env,
    OPSC_MIGRATION_EXPECTED_OWNER_ROLE: 'neondb_owner'
  }), /MIGRATION_OWNER_ROLE_NOT_ALLOWED/);
});

test('self-hosted PostgreSQL role initializer reads secrets and validates runtime, migrator, worker and owner roles', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../docker/postgres-init/10-opscore-roles.sh'), 'utf8');
  assert.match(source, /\\getenv runtime_password OPSCORE_RUNTIME_PASSWORD/);
  assert.match(source, /\\getenv migrator_password OPSCORE_MIGRATOR_PASSWORD/);
  assert.match(source, /\\getenv worker_password OPSCORE_WORKER_PASSWORD/);
  assert.match(source, /CREATE ROLE opscore_migrator LOGIN NOSUPERUSER BYPASSRLS NOINHERIT/);
  assert.match(source, /CREATE ROLE neondb_owner NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT/);
  assert.match(source, /GRANT neondb_owner TO opscore_migrator WITH INHERIT FALSE, SET TRUE/);
  assert.match(source, /ALTER DATABASE %I OWNER TO neondb_owner/);
  assert.match(source, /OPSCORE_RUNTIME_ROLE_CONTRACT_FAILED/);
  assert.match(source, /OPSCORE_MIGRATOR_ROLE_CONTRACT_FAILED/);
  assert.match(source, /OPSCORE_WORKER_ROLE_CONTRACT_FAILED/);
  assert.match(source, /OPSCORE_MIGRATION_OWNER_ROLE_CONTRACT_FAILED/);
  assert.doesNotMatch(source, /psql[^\n]*-v\s+(?:runtime_password|migrator_password|worker_password)/);
});

test('self-hosted migration uses a local no-login compatibility owner without changing historical migrations', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const runner = fs.readFileSync(path.join(__dirname, '../scripts/apply-postgres-migrations.js'), 'utf8');
  assert.match(runner, /targetClass==='self-hosted-explicit-target'\?'neondb_owner':info\.role/);
  assert.match(runner, /SET ROLE neondb_owner/);
  assert.match(runner, /MIGRATION_SELF_HOSTED_OWNER_ROLE_CONTRACT_FAILED/);
  assert.match(runner, /set_config\('opscore\.fn_owner',\$1,true\).*migrationOwnerRole/);
  const historical = ['046_migration_ledger_access_lockdown.sql','049_app_role_table_privileges.sql','057_read_only_runtime_migration_ledger_attestation.sql','058_security_definer_search_path_hardening.sql','059_runtime_system_table_policy_and_privilege_alignment.sql','072_deployment_release_evidence_store.sql'];
  for (const filename of historical) {
    const migration = fs.readFileSync(path.join(__dirname, '../sql/postgres', filename), 'utf8');
    assert.match(migration, /neondb_owner/, filename);
  }
});
