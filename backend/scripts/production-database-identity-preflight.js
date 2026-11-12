'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const REQUIRED_AUTH_FUNCTIONS = Object.freeze([
  'opscore_resolve_login_candidate(text)',
  'opscore_list_memberships_for_user(text)',
  'opscore_resolve_session_by_token_hash(text)',
  'opscore_revoke_session_by_token_hash(text)',
  'opscore_count_users()',
  'opscore_resolve_oidc_identity(text,text)',
  'opscore_create_password_reset_token(text,text,text,timestamptz)',
  'opscore_validate_password_reset_token(text)',
  'opscore_consume_password_reset_token(text,text)',
  'opscore_is_privileged()'
]);

const MIGRATION_PATH = path.resolve(__dirname, '..', 'sql', 'postgres', '056_runtime_auth_definer_function_grants.sql');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseDatabaseTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    const error = new Error('OPSC_DATABASE_URL_MISSING');
    error.code = 'OPSC_DATABASE_URL_MISSING';
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const error = new Error('OPSC_DATABASE_URL_INVALID');
    error.code = 'OPSC_DATABASE_URL_INVALID';
    throw error;
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    const error = new Error('OPSC_DATABASE_URL_PROTOCOL_INVALID');
    error.code = 'OPSC_DATABASE_URL_PROTOCOL_INVALID';
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();
  const labels = hostname.split('.');
  const isNeon = hostname.endsWith('.neon.tech');
  const endpointLabel = isNeon ? String(labels[0] || '').replace(/-pooler$/i, '') : null;
  const endpointId = endpointLabel && /^ep-[a-z0-9-]+$/i.test(endpointLabel) ? endpointLabel : null;

  return {
    provider: isNeon ? 'neon' : 'postgresql',
    endpointId,
    region: isNeon && labels.includes('aws') && labels.indexOf('aws') > 0 ? labels[labels.indexOf('aws') - 1] : null,
    hostnameSha256: sha256(hostname),
    clientSslMode: parsed.searchParams.get('sslmode') || 'not-specified',
    channelBinding: parsed.searchParams.get('channel_binding') || 'not-specified'
  };
}

function safeErrorCode(error) {
  const code = String(error && error.code || '');
  return /^[0-9A-Z]{5}$/.test(code) ? code : 'DATABASE_IDENTITY_QUERY_FAILED';
}

function sourceCommit(env = process.env) {
  const sha = String(env.GITHUB_SHA || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(sha) ? sha : null;
}

function migrationSourceDigest() {
  return sha256(fs.readFileSync(MIGRATION_PATH));
}

function buildEnvironmentChecks(env = process.env, selectedConnection = selectDatabaseConnection(env)) {
  const opscUrl = String(env.OPSC_DATABASE_URL || '').trim();
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  return {
    opscDatabaseUrlPresent: Boolean(opscUrl),
    selectedConnectionStringPresent: Boolean(selectedConnection.connectionString),
    databaseUrlPresent: Boolean(databaseUrl),
    databaseUrlUnpooledPresent: Boolean(String(env.DATABASE_URL_UNPOOLED || '').trim()),
    databaseUrlMatchesOpscDatabaseUrl: !databaseUrl || (Boolean(opscUrl) && databaseUrl === opscUrl)
  };
}

function selectDatabaseConnection(env = process.env) {
  const opscUrl = String(env.OPSC_DATABASE_URL || '').trim();
  if (opscUrl) return { connectionString: opscUrl, source: 'OPSC_DATABASE_URL', applicationBinding: true };

  const unpooledUrl = String(env.DATABASE_URL_UNPOOLED || '').trim();
  if (unpooledUrl) {
    return {
      connectionString: unpooledUrl,
      source: 'DATABASE_URL_UNPOOLED',
      applicationBinding: false
    };
  }

  return { connectionString: '', source: 'NONE', applicationBinding: false };
}


async function safeRead(client, sql, params = []) {
  await client.query('SAVEPOINT identity_preflight_read');
  try {
    const result = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT identity_preflight_read');
    return { result, errorCode: null };
  } catch (error) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT identity_preflight_read');
      await client.query('RELEASE SAVEPOINT identity_preflight_read');
    } catch {
      return { result: null, errorCode: 'READ_ONLY_TRANSACTION_RECOVERY_FAILED' };
    }
    return { result: null, errorCode: safeErrorCode(error) };
  }
}

async function inspectDatabase(env = process.env) {
  const selectedConnection = selectDatabaseConnection(env);
  const rawUrl = selectedConnection.connectionString;
  const report = {
    schemaVersion: 'opscore.production-database-identity-preflight.v1',
    checkedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(env),
    sourceRef: String(env.GITHUB_REF || '') === 'refs/heads/main' ? 'main' : null,
    status: 'UNVERIFIED',
    productionCertification: false,
    writeOperations: 0,
    transactionMode: 'READ ONLY',
    connectionSource: selectedConnection.source,
    identityScope: selectedConnection.applicationBinding ? 'APPLICATION_DATABASE' : 'INTEGRATION_CANDIDATE_ONLY',
    applicationDatabaseBinding: selectedConnection.applicationBinding ? 'PRESENT' : 'UNVERIFIED',
    target: null,
    environmentChecks: buildEnvironmentChecks(env, selectedConnection),
    identity: null,
    roles: null,
    authFunctionGrants: null,
    rowLevelSecurity: null,
    migrationLedger: null,
    limitations: [
      'Read-only catalog and identity inspection only.',
      'This report does not apply migrations, certify production isolation, or authorize deployment.'
    ]
  };

  let target;
  try {
    target = parseDatabaseTarget(rawUrl);
    report.target = target;
  } catch (error) {
    report.reasonCode = error.code || 'DATABASE_TARGET_INVALID';
    return report;
  }

  let migrationSha256;
  try {
    migrationSha256 = migrationSourceDigest();
  } catch {
    report.reasonCode = 'MIGRATION_056_SOURCE_UNAVAILABLE';
    return report;
  }

  const client = new Client({
    connectionString: rawUrl,
    application_name: 'opscore-production-database-identity-readonly',
    connectionTimeoutMillis: 12000,
    statement_timeout: 10000,
    query_timeout: 12000,
    keepAlive: true
  });

  let connected = false;
  let transactionOpen = false;

  try {
    await client.connect();
    connected = true;
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;

    const transaction = await client.query("SELECT current_setting('transaction_read_only') AS transaction_read_only");
    if (String(transaction.rows[0] && transaction.rows[0].transaction_read_only).toLowerCase() !== 'on') {
      report.reasonCode = 'READ_ONLY_TRANSACTION_NOT_ENFORCED';
      return report;
    }

    const base = await safeRead(client, `
      SELECT
        current_database() AS database_name,
        session_user AS session_user,
        current_user AS current_user,
        current_setting('server_version') AS server_version,
        current_setting('transaction_read_only') AS transaction_read_only,
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls_enabled
    `);
    if (!base.result || base.result.rows.length !== 1) {
      report.reasonCode = base.errorCode || 'DATABASE_IDENTITY_UNAVAILABLE';
      return report;
    }
    report.identity = base.result.rows[0];

    const roleNames = [...new Set([
      report.identity.session_user,
      report.identity.current_user,
      'opscore_runtime',
      'opscore_app'
    ].filter(Boolean))];

    const roleResult = await safeRead(client, `
      SELECT
        requested.role_name,
        (r.oid IS NOT NULL) AS role_exists,
        COALESCE(r.rolcanlogin, false) AS can_login,
        COALESCE(r.rolsuper, false) AS superuser,
        COALESCE(r.rolbypassrls, false) AS bypass_rls,
        COALESCE(r.rolcreaterole, false) AS create_role,
        COALESCE(r.rolcreatedb, false) AS create_db,
        CASE
          WHEN r.oid IS NULL THEN false
          ELSE COALESCE((
            SELECT bool_or(pg_has_role(r.oid, elevated.oid, 'MEMBER'))
            FROM pg_roles elevated
            WHERE elevated.rolsuper
               OR elevated.rolbypassrls
               OR elevated.rolcreaterole
               OR elevated.rolcreatedb
          ), false)
        END AS elevated_role_membership
      FROM unnest($1::text[]) AS requested(role_name)
      LEFT JOIN pg_roles r ON r.rolname = requested.role_name
      ORDER BY requested.role_name
    `, [roleNames]);

    report.roles = roleResult.result
      ? roleResult.result.rows
      : { status: 'UNREADABLE', reasonCode: roleResult.errorCode };

    const functionResult = await safeRead(client, `
      WITH runtime_role AS (
        SELECT oid FROM pg_roles WHERE rolname = 'opscore_runtime'
      ),
      requested(signature) AS (
        SELECT unnest($1::text[])
      )
      SELECT
        requested.signature,
        (p.oid IS NOT NULL) AS present,
        COALESCE(p.prosecdef, false) AS security_definer,
        COALESCE(owner_role.rolsuper OR owner_role.rolbypassrls, false) AS owner_bypasses_rls,
        CASE
          WHEN p.oid IS NOT NULL AND EXISTS (SELECT 1 FROM runtime_role)
          THEN has_function_privilege((SELECT oid FROM runtime_role), p.oid, 'EXECUTE')
          ELSE false
        END AS runtime_execute,
        CASE
          WHEN p.oid IS NOT NULL THEN EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
          )
          ELSE false
        END AS public_execute,
        CASE
          WHEN p.oid IS NOT NULL THEN EXISTS (
            SELECT 1
            FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
            WHERE settings.setting_value ILIKE 'search_path=%'
              AND settings.setting_value ILIKE '%public%'
              AND settings.setting_value ILIKE '%pg_temp%'
          )
          ELSE false
        END AS search_path_pinned
      FROM requested
      LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.' || requested.signature)
      LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
      ORDER BY requested.signature
    `, [REQUIRED_AUTH_FUNCTIONS]);

    if (functionResult.result) {
      const rows = functionResult.result.rows;
      report.authFunctionGrants = {
        required: REQUIRED_AUTH_FUNCTIONS.length,
        present: rows.filter(row => row.present).length,
        securityDefiner: rows.filter(row => row.present && row.security_definer).length,
        runtimeExecute: rows.filter(row => row.present && row.runtime_execute).length,
        publicExecuteAbsent: rows.filter(row => row.present && !row.public_execute).length,
        ownerBypassesRls: rows.filter(row => row.present && row.owner_bypasses_rls).length,
        searchPathPinned: rows.filter(row => row.present && row.search_path_pinned).length,
        missingFunctions: rows.filter(row => !row.present).map(row => row.signature),
        missingRuntimeExecute: rows.filter(row => row.present && !row.runtime_execute).map(row => row.signature),
        publicExecutePresent: rows.filter(row => row.present && row.public_execute).map(row => row.signature)
      };
    } else {
      report.authFunctionGrants = { status: 'UNREADABLE', reasonCode: functionResult.errorCode };
    }

    const rlsResult = await safeRead(client, `
      SELECT
        count(*)::integer AS public_application_tables,
        count(*) FILTER (WHERE c.relrowsecurity)::integer AS rls_enabled_tables,
        count(*) FILTER (WHERE c.relforcerowsecurity)::integer AS force_rls_tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass
            AND d.objid = c.oid
            AND d.refclassid = 'pg_extension'::regclass
            AND d.deptype = 'e'
        )
    `);

    report.rowLevelSecurity = rlsResult.result
      ? rlsResult.result.rows[0]
      : { status: 'UNREADABLE', reasonCode: rlsResult.errorCode };

    const ledgerInfo = await safeRead(client, `
      SELECT
        to_regclass('public.schema_migrations')::text AS ledger_name,
        count(*) FILTER (WHERE a.attname = 'filename')::integer AS has_filename_column,
        count(*) FILTER (WHERE a.attname = 'sha256')::integer AS has_sha256_column
      FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.schema_migrations')
        AND a.attnum > 0
        AND NOT a.attisdropped
    `);

    if (!ledgerInfo.result) {
      report.migrationLedger = { status: 'UNREADABLE', reasonCode: ledgerInfo.errorCode };
    } else {
      const ledger = ledgerInfo.result.rows[0];
      if (!ledger.ledger_name) {
        report.migrationLedger = { status: 'LEDGER_NOT_FOUND' };
      } else if (!ledger.has_filename_column || !ledger.has_sha256_column) {
        report.migrationLedger = { status: 'LEDGER_SCHEMA_UNSUPPORTED' };
      } else {
        const attestationMetadata = await safeRead(client, `
          SELECT
            p.oid IS NOT NULL AS function_present,
            COALESCE(p.prosecdef, false) AS security_definer,
            owner_role.rolname AS function_owner,
            COALESCE(owner_role.rolbypassrls, false) AS owner_bypasses_rls,
            COALESCE(owner_role.rolsuper, false) AS owner_superuser,
            CASE WHEN p.oid IS NOT NULL
              THEN has_function_privilege(current_user, p.oid, 'EXECUTE')
              ELSE false
            END AS runtime_execute,
            CASE WHEN p.oid IS NOT NULL THEN EXISTS (
              SELECT 1
              FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
              WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
            ) ELSE false END AS public_execute,
            CASE WHEN p.oid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
              WHERE settings.setting_value ILIKE 'search_path=%'
                AND settings.setting_value ILIKE '%pg_catalog%'
                AND settings.setting_value ILIKE '%public%'
                AND settings.setting_value ILIKE '%pg_temp%'
            ) ELSE false END AS search_path_pinned,
            CASE WHEN p.oid IS NOT NULL THEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting_value)
              WHERE settings.setting_value = 'row_security=off'
            ) ELSE false END AS row_security_disabled
          FROM (SELECT to_regprocedure('public.opscore_attest_migration_056(text)') AS function_oid) requested
          LEFT JOIN pg_proc p ON p.oid = requested.function_oid
          LEFT JOIN pg_roles owner_role ON owner_role.oid = p.proowner
        `);

        if (!attestationMetadata.result) {
          report.migrationLedger = {
            status: 'LEDGER_ATTESTATION_METADATA_UNREADABLE',
            reasonCode: attestationMetadata.errorCode
          };
        } else {
          const metadata = attestationMetadata.result.rows[0];
          const secure = metadata.function_present === true &&
            metadata.security_definer === true &&
            metadata.function_owner === 'neondb_owner' &&
            metadata.owner_bypasses_rls === true &&
            metadata.owner_superuser === false &&
            metadata.runtime_execute === true &&
            metadata.public_execute === false &&
            metadata.search_path_pinned === true &&
            metadata.row_security_disabled === true;

          if (!secure) {
            report.migrationLedger = {
              status: metadata.function_present ? 'LEDGER_ATTESTATION_FUNCTION_UNSAFE' : 'LEDGER_ATTESTATION_FUNCTION_MISSING',
              attestationFunctionPresent: metadata.function_present === true,
              attestationSecurityDefiner: metadata.security_definer === true,
              attestationOwner: metadata.function_owner || null,
              attestationOwnerBypassesRls: metadata.owner_bypasses_rls === true,
              attestationOwnerSuperuser: metadata.owner_superuser === true,
              attestationRuntimeExecute: metadata.runtime_execute === true,
              attestationPublicExecuteAbsent: metadata.public_execute === false,
              attestationSearchPathPinned: metadata.search_path_pinned === true,
              attestationRowSecurityDisabled: metadata.row_security_disabled === true
            };
          } else {
            const migrationRow = await safeRead(client, `
              SELECT migration_056_recorded,
                     migration_056_hash_matches,
                     latest_filename,
                     migration_count
              FROM public.opscore_attest_migration_056($1)
            `, [migrationSha256]);

            if (!migrationRow.result) {
              report.migrationLedger = {
                status: 'LEDGER_ATTESTATION_QUERY_FAILED',
                reasonCode: migrationRow.errorCode,
                attestationFunctionPresent: true,
                attestationSecurityDefiner: true,
                attestationOwner: 'neondb_owner',
                attestationOwnerBypassesRls: true,
                attestationOwnerSuperuser: false,
                attestationRuntimeExecute: true,
                attestationPublicExecuteAbsent: true,
                attestationSearchPathPinned: true,
                attestationRowSecurityDisabled: true
              };
            } else {
              const row = migrationRow.result.rows[0];
              report.migrationLedger = {
                status: row.migration_056_recorded !== true
                  ? 'MIGRATION_056_NOT_RECORDED'
                  : row.migration_056_hash_matches === true
                    ? 'MIGRATION_056_HASH_MATCH'
                    : 'MIGRATION_056_HASH_MISMATCH',
                migration056Recorded: row.migration_056_recorded === true,
                migration056SourceHashMatches: row.migration_056_hash_matches === true,
                latestFilename: row.latest_filename,
                migrationCount: row.migration_count,
                sourceSha256: migrationSha256,
                attestationFunctionPresent: true,
                attestationSecurityDefiner: true,
                attestationOwner: 'neondb_owner',
                attestationOwnerBypassesRls: true,
                attestationOwnerSuperuser: false,
                attestationRuntimeExecute: true,
                attestationPublicExecuteAbsent: true,
                attestationSearchPathPinned: true,
                attestationRowSecurityDisabled: true
              };
            }
          }
        }
      }
    }

    report.status = selectedConnection.applicationBinding ? 'IDENTITY_RESOLVED' : 'IDENTITY_RESOLVED_CANDIDATE';
    report.reasonCode = selectedConnection.applicationBinding ? null : 'OPSC_DATABASE_URL_NOT_EXPOSED_TO_DIAGNOSTIC_PROCESS';
  } catch (error) {
    report.status = 'UNVERIFIED';
    report.reasonCode = safeErrorCode(error);
    if (!connected) report.reasonCode = 'DATABASE_CONNECTION_FAILED';
  } finally {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        report.rollbackStatus = 'ROLLBACK_FAILED';
        report.status = 'UNVERIFIED';
        report.reasonCode = 'READ_ONLY_TRANSACTION_CLOSE_FAILED';
      }
    }
    if (connected) {
      try {
        await client.end();
      } catch {
        report.connectionCloseStatus = 'CLOSE_FAILED';
      }
    }
  }

  return report;
}

function writeReport(report, env = process.env) {
  const outputPath = String(env.OPSC_DB_IDENTITY_REPORT_PATH || '').trim();
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (outputPath) {
    const directory = path.dirname(outputPath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = outputPath + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, outputPath);
  }
  process.stdout.write(serialized);
}

async function main() {
  const report = await inspectDatabase();
  writeReport(report);
  if (report.status !== 'IDENTITY_RESOLVED') process.exitCode = 2;
}

if (require.main === module) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.production-database-identity-preflight.v1',
      status: 'UNVERIFIED',
      productionCertification: false,
      writeOperations: 0,
      reasonCode: 'PREFLIGHT_UNEXPECTED_FAILURE'
    }) + '\n');
    process.exitCode = 2;
  });
}

module.exports = {
  REQUIRED_AUTH_FUNCTIONS,
  migrationSourceDigest,
  parseDatabaseTarget,
  safeErrorCode,
  selectDatabaseConnection,
  buildEnvironmentChecks,
  inspectDatabase
};
