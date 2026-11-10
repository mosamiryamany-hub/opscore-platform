#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const backendRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(backendRoot, 'sql', 'postgres', '031_digital_twin_chain_hardening.sql');
const reportPath = path.join(backendRoot, 'docs', 'verification', 'POSTGRES_LIVE_RLS_RESULT.json');

function emit(status, details = {}, exitCode = 0) {
  const report = {
    schemaVersion: 'opscore.postgres-live-rls-gate.v1',
    generatedAt: new Date().toISOString(),
    status,
    target: 'isolated temporary schema; operational_twin_chain_events migration 031',
    productionCertification: false,
    ...details
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = exitCode;
}

async function main() {
  const runtimeUrl = String(process.env.OPSC_PG_TEST_URL || '').trim();
  const url = String(process.env.OPSC_MIGRATION_DATABASE_URL || runtimeUrl).trim();
  if (!runtimeUrl) {
    emit('UNVERIFIED', {
      reason: 'OPSC_PG_TEST_URL_REQUIRED',
      required: ['PostgreSQL test database URL', 'pg optional peer dependency', 'database role able to CREATE ROLE and CREATE SCHEMA'],
      note: 'No live PostgreSQL request was attempted because no dedicated test URL was supplied.'
    }, 2);
    return;
  }

  let Pool;
  try { ({ Pool } = require('pg')); }
  catch {
    emit('UNVERIFIED', { reason: 'POSTGRES_DRIVER_MISSING', note: 'Install the buyer-approved pg peer dependency in the test environment; no fallback driver is used.' }, 2);
    return;
  }

  let parsedUrl;
  try { parsedUrl = new URL(url); }
  catch {
    emit('FAIL', { reason: 'OPSC_PG_TEST_URL_INVALID' }, 1);
    return;
  }
  if (!/^postgres(?:ql)?:$/.test(parsedUrl.protocol)) {
    emit('FAIL', { reason: 'OPSC_PG_TEST_URL_PROTOCOL_INVALID' }, 1);
    return;
  }
  // Secret hygiene: never persist or print the connection string. Only the
  // non-secret database name is echoed in emitted reports.
  const safeDbName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')) || 'unknown';

  const pool = new Pool({ connectionString: url, max: 1, application_name: 'opscore-digital-twin-rls-test', connectionTimeoutMillis: 5000, statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 });
  const client = await pool.connect().catch(error => {
    emit('FAIL', { reason: 'POSTGRES_CONNECT_FAILED', errorCode: error.code || null, error: error.message }, 1);
    return null;
  });
  if (!client) { await pool.end(); return; }

  const checks = [];
  const schemaName = `opscore_dt_rls_${crypto.randomBytes(6).toString('hex')}`;
  const roleName = `opscore_dt_rt_${crypto.randomBytes(6).toString('hex')}`;
  const quotedSchema = `"${schemaName}"`;
  let quotedRole = `"${roleName}"`;
  let inTransaction = false;
  try {
    const info = (await client.query("SELECT current_database() AS database, current_user AS connected_role, current_setting('server_version') AS server_version")).rows[0];
    const looksDisposable = /test|testing|ci|disposable|scratch|acceptance/i.test(info.database);
    if (!looksDisposable && process.env.OPSC_PG_TEST_ALLOW_NON_TEST_DATABASE !== '1') {
      throw Object.assign(new Error('DATABASE_NAME_NOT_MARKED_AS_TEST'), { code: 'OPSC_PG_TEST_DATABASE_SAFETY_GUARD' });
    }
    checks.push({ id: 'database-safety-guard', status: 'PASS', database: info.database, serverVersion: info.server_version, connectedRole: info.connected_role });
    // Defense in depth: refuse a role that could bypass RLS even if the URL
    // pointed at a role the safety guard below cannot see.
    const guard = (await client.query('SELECT r.rolsuper, r.rolbypassrls, current_user AS role_name FROM pg_roles r WHERE r.rolname = current_user')).rows[0];
    const usingAdminDdl = Boolean(String(process.env.OPSC_MIGRATION_DATABASE_URL || '').trim()) && (guard.rolbypassrls || guard.rolsuper || guard.role_name === 'neondb_owner');
    if (!usingAdminDdl && (!guard || guard.rolsuper || guard.rolbypassrls)) throw new Error('TEST_CONNECTION_ROLE_MUST_NOT_BYPASS_RLS');
    if (usingAdminDdl) checks.push({ id: 'admin-ddl-connection', status: 'PASS', role: guard.role_name, note: 'DDL via migration owner; RLS checks run under SET LOCAL ROLE opscore_app' });
    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SAVEPOINT sp_create_role');
    try {
      await client.query(`CREATE ROLE ${quotedRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      await client.query('RELEASE SAVEPOINT sp_create_role');
    } catch (roleErr) {
      await client.query('ROLLBACK TO SAVEPOINT sp_create_role');
      await client.query('RELEASE SAVEPOINT sp_create_role');
      // Neon managed roles often cannot CREATE ROLE. Fall back to the connected
      // non-bypass role (e.g. opscore_app) when the safety checks already passed.
      const code = roleErr && roleErr.code;
      if (code !== '42501' && !/permission denied to create role/i.test(String(roleErr && roleErr.message || ''))) throw roleErr;
      const who = (await client.query('SELECT current_user AS u, r.rolbypassrls, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user')).rows[0];
      if (!who || who.rolbypassrls || who.rolsuper) throw roleErr;
      quotedRole = '"' + String(who.u).replace(/"/g, '""') + '"';
      checks.push({ id: 'create-role-fallback', status: 'PASS', detail: 'using connected role ' + who.u + ' (CREATE ROLE denied by platform)' });
    }
    await client.query('SAVEPOINT sp_grant_role');
    try {
      await client.query(`GRANT ${quotedRole} TO CURRENT_USER`);
      await client.query('RELEASE SAVEPOINT sp_grant_role');
    } catch (_) {
      await client.query('ROLLBACK TO SAVEPOINT sp_grant_role');
      await client.query('RELEASE SAVEPOINT sp_grant_role');
    }
    await client.query(`CREATE SCHEMA ${quotedSchema} AUTHORIZATION CURRENT_USER`);
    await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
    await client.query('CREATE TABLE organizations (id TEXT PRIMARY KEY)');
    await client.query('CREATE TABLE users (id TEXT PRIMARY KEY)');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    await client.query(migration);

    const rls = (await client.query("SELECT c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='operational_twin_chain_events'", [schemaName])).rows[0];
    if (!rls || !rls.relrowsecurity || !rls.relforcerowsecurity) throw new Error('TWIN_CHAIN_RLS_NOT_FORCED');
    checks.push({ id: 'migration-rls-flags', status: 'PASS', rowSecurity: rls.relrowsecurity, forceRowSecurity: rls.relforcerowsecurity });

    await client.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ${quotedRole}`);
    await client.query(`GRANT SELECT ON organizations, users TO ${quotedRole}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON operational_twin_chain_events TO ${quotedRole}`);
    if (usingAdminDdl) {
      await client.query('GRANT USAGE ON SCHEMA ' + quotedSchema + ' TO opscore_app');
      await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, operational_twin_chain_events TO opscore_app');
    }
    const orgA = `org_a_${crypto.randomBytes(4).toString('hex')}`;
    const orgB = `org_b_${crypto.randomBytes(4).toString('hex')}`;
    const userA = `user_a_${crypto.randomBytes(4).toString('hex')}`;
    const userB = `user_b_${crypto.randomBytes(4).toString('hex')}`;
    await client.query('INSERT INTO organizations(id) VALUES ($1),($2)', [orgA, orgB]);
    await client.query('INSERT INTO users(id) VALUES ($1),($2)', [userA, userB]);

    // Prefer explicit runtime role when DDL used the migration owner connection (post-051).
    if (usingAdminDdl) {
      await client.query('SET LOCAL ROLE opscore_app');
    } else {
      await client.query(`SET LOCAL ROLE ${quotedRole}`);
    }
    await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
    // Re-assert fixtures visible under runtime role search_path (FK targets).
    await client.query('INSERT INTO organizations(id) VALUES ($1),($2) ON CONFLICT (id) DO NOTHING', [orgA, orgB]);
    await client.query('INSERT INTO users(id) VALUES ($1),($2) ON CONFLICT (id) DO NOTHING', [userA, userB]);
    const roleCheck = (await client.query('SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user')).rows[0];
    if (!roleCheck || roleCheck.rolsuper || roleCheck.rolbypassrls) throw new Error('RLS_TEST_ROLE_CAN_BYPASS_RLS');
    const eventId = `event_${crypto.randomBytes(8).toString('hex')}`;
    const eventPayload = JSON.stringify({ schemaVersion: 'opscore.digital-twin-chain-event.v1', organizationId: orgA, sequenceNo: 1, eventType: 'snapshot.created', snapshotId: 'snapshot-a', previousHash: 'GENESIS' });
    const insertOwn = async () => client.query('INSERT INTO operational_twin_chain_events(id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)', [eventId, orgA, 'snapshot.created', 'snapshot-a', 'GENESIS', eventPayload, 'a'.repeat(64), userA]);

    await client.query("SELECT set_config('app.tenant_id',$1,true)", [orgA]);
    await insertOwn();
    const selfRead = await client.query('SELECT id FROM operational_twin_chain_events WHERE id=$1', [eventId]);
    if (selfRead.rowCount !== 1) throw new Error('TENANT_SELF_READ_FAILED');
    checks.push({ id: 'tenant-self-read', status: 'PASS' });

    await client.query("SELECT set_config('app.tenant_id',$1,true)", [orgB]);
    const crossRead = await client.query('SELECT id FROM operational_twin_chain_events WHERE id=$1', [eventId]);
    if (crossRead.rowCount !== 0) throw new Error('TENANT_CROSS_READ_BREACH');
    const crossUpdate = await client.query("UPDATE operational_twin_chain_events SET event_type='tampered' WHERE id=$1", [eventId]);
    if (crossUpdate.rowCount !== 0) throw new Error('TENANT_CROSS_UPDATE_BREACH');
    const crossDelete = await client.query('DELETE FROM operational_twin_chain_events WHERE id=$1', [eventId]);
    if (crossDelete.rowCount !== 0) throw new Error('TENANT_CROSS_DELETE_BREACH');
    checks.push({ id: 'tenant-cross-tenant-read-update-delete', status: 'PASS', crossReadRows: crossRead.rowCount, crossUpdateRows: crossUpdate.rowCount, crossDeleteRows: crossDelete.rowCount });

    await client.query('SAVEPOINT cross_tenant_insert');
    let crossInsertDenied = false;
    try {
      await client.query('INSERT INTO operational_twin_chain_events(id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by) VALUES ($1,$2,2,$3,$4,$5,$6,$7,$8)', [`cross_${eventId}`, orgA, 'snapshot.created', 'snapshot-b', 'a'.repeat(64), eventPayload, 'b'.repeat(64), userA]);
    } catch (error) {
      crossInsertDenied = error.code === '42501';
      await client.query('ROLLBACK TO SAVEPOINT cross_tenant_insert');
    }
    await client.query('RELEASE SAVEPOINT cross_tenant_insert');
    if (!crossInsertDenied) throw new Error('TENANT_CROSS_INSERT_NOT_DENIED');
    checks.push({ id: 'tenant-cross-tenant-insert', status: 'PASS', deniedByRls: true });

    await client.query("SELECT set_config('app.tenant_id','',true)");
    const noContext = await client.query('SELECT id FROM operational_twin_chain_events');
    if (noContext.rowCount !== 0) throw new Error('MISSING_TENANT_CONTEXT_DID_NOT_FAIL_CLOSED');
    checks.push({ id: 'missing-tenant-context-fails-closed', status: 'PASS' });
    await client.query('ROLLBACK');
    inTransaction = false;
    emit('PASS', { database: info.database, serverVersion: info.server_version, executedChecks: checks, checkCount: checks.length, note: 'This gate tests migration 031 and RLS behavior in a rollback-only isolated schema. It does not certify all production migrations, grants, or application-level PostgreSQL parity.' });
  } catch (error) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        process.stderr.write(`Rollback failed: ${rollbackError.code || rollbackError.message}\n`);
      }
    }
    emit('FAIL', { executedChecks: checks, failedCheck: error.code || error.message, error: error.message, note: 'A failed live gate is not production certification.' }, 1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => emit('FAIL', { reason: error.code || error.message }, 1));
