'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATION_056 = path.resolve(__dirname, '..', 'sql', 'postgres', '056_runtime_auth_definer_function_grants.sql');
const SIGNATURE = 'public.opscore_attest_migration_056(text)';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeCode(error) {
  const code = String(error && error.code || '');
  return /^[0-9A-Z]{5}$/.test(code) ? code : 'MIGRATION_LEDGER_ATTESTATION_TEST_FAILED';
}

async function main() {
  const rawUrl = String(process.env.OPSC_PG_ACCEPTANCE_URL || '').trim();
  if (!rawUrl) throw new Error('OPSC_PG_ACCEPTANCE_URL_REQUIRED');

  const parsed = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('OPSC_PG_ACCEPTANCE_URL_PROTOCOL_INVALID');
  }

  const client = new Client({
    connectionString: rawUrl,
    application_name: 'opscore-runtime-migration-ledger-attestation-test',
    connectionTimeoutMillis: 7000,
    statement_timeout: 10000,
    query_timeout: 12000
  });

  let connected = false;
  let transactionOpen = false;
  const report = {
    schemaVersion: 'opscore.runtime-migration-ledger-attestation-test.v1',
    status: 'FAIL',
    writeOperations: 0,
    databaseName: decodeURIComponent(parsed.pathname.replace(/^\\/+/, '')) || null,
    runtimeRole: null,
    checks: []
  };

  const add = (id, passed, detail = null) => {
    report.checks.push({
      id,
      status: passed ? 'PASS' : 'FAIL',
      ...(detail ? { detail: String(detail).slice(0, 96) } : {})
    });
    if (!passed) throw new Error(id.toUpperCase() + '_FAILED');
  };

  try {
    await client.connect();
    connected = true;
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;

    const identity = (await client.query(
      "SELECT current_database() AS database_name, current_user AS current_user, session_user AS session_user, current_setting('transaction_read_only') AS transaction_read_only, current_setting('server_version') AS server_version"
    )).rows[0];

    report.runtimeRole = identity.current_user;
    add('runtime_login_identity',
      identity.current_user === 'opscore_runtime' &&
      identity.session_user === 'opscore_runtime' &&
      identity.transaction_read_only === 'on' &&
      /^18\\./.test(identity.server_version));

    const catalog = (await client.query(`
      SELECT
        c.relrowsecurity AS ledger_rls_enabled,
        c.relforcerowsecurity AS ledger_force_rls,
        has_table_privilege(current_user, c.oid, 'SELECT') AS runtime_can_select_ledger,
        p.prosecdef AS security_definer,
        owner_role.rolname AS function_owner,
        owner_role.rolbypassrls AS owner_bypasses_rls,
        has_function_privilege(current_user, p.oid, 'EXECUTE') AS runtime_can_execute,
        EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
          WHERE setting ILIKE 'search_path=%'
            AND setting ILIKE '%pg_catalog%'
            AND setting ILIKE '%public%'
            AND setting ILIKE '%pg_temp%'
        ) AS search_path_pinned,
        EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
          WHERE setting = 'row_security=off'
        ) AS row_security_disabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = to_regprocedure($1)
      JOIN pg_roles owner_role ON owner_role.oid = p.proowner
      WHERE n.nspname = 'public' AND c.relname = 'schema_migrations'
    `, [SIGNATURE])).rows[0];

    add('ledger_remains_forced_rls',
      catalog && catalog.ledger_rls_enabled === true && catalog.ledger_force_rls === true);
    add('runtime_cannot_select_migration_ledger',
      catalog && catalog.runtime_can_select_ledger === false);
    add('restricted_security_definer_contract',
      catalog &&
      catalog.security_definer === true &&
      catalog.function_owner === 'neondb_owner' &&
      catalog.owner_bypasses_rls === true &&
      catalog.runtime_can_execute === true &&
      catalog.public_can_execute === false &&
      catalog.search_path_pinned === true &&
      catalog.row_security_disabled === true);

    const expectedDigest = sha256File(MIGRATION_056);
    const attestation = (await client.query(
      `SELECT migration_056_recorded, migration_056_hash_matches, latest_filename, migration_count
         FROM ${SIGNATURE}($1)`,
      [expectedDigest]
    )).rows[0];

    add('migration_056_source_hash_matches',
      attestation &&
      attestation.migration_056_recorded === true &&
      attestation.migration_056_hash_matches === true &&
      attestation.latest_filename === '057_read_only_runtime_migration_ledger_attestation.sql' &&
      Number(attestation.migration_count) >= 57);

    const otherCaller = (await client.query(
      "SELECT pg_has_role(current_user, 'neondb_owner', 'MEMBER') AS runtime_is_neondb_owner_member"
    )).rows[0];
    add('runtime_has_no_owner_membership', otherCaller.runtime_is_neondb_owner_member === false);

    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.reasonCode = safeCode(error);
  } finally {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); }
      catch { report.rollbackFailed = true; report.status = 'FAIL'; }
    }
    if (connected) {
      try { await client.end(); }
      catch { report.connectionCloseFailed = true; report.status = 'FAIL'; }
    }
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch(() => {
  process.stdout.write(JSON.stringify({
    schemaVersion: 'opscore.runtime-migration-ledger-attestation-test.v1',
    status: 'FAIL',
    writeOperations: 0,
    reasonCode: 'MIGRATION_LEDGER_ATTESTATION_TEST_FAILED'
  }, null, 2) + '\\n');
  process.exitCode = 1;
});
