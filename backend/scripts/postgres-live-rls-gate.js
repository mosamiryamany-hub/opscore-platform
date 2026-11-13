#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATABASE_SECURITY_SQL } = require('../src/database-security-proof');

function controlPlaneCatalogProofSql() {
  // Parameterize every schema filter in the shared catalog proof, preserving
  // each SQL alias. The proof now inspects both tenant-scoped control-plane
  // tables and runtime system tables, so the alias inventory is explicit.
  const pattern = /\\b(n|sn)\\.nspname = 'public'/g;
  const matches = [...DATABASE_SECURITY_SQL.matchAll(pattern)];
  const aliasCounts = matches.reduce((counts, match) => {
    counts[match[1]] = (counts[match[1]] || 0) + 1;
    return counts;
  }, {});
  if (matches.length !== 3 || aliasCounts.n !== 2 || aliasCounts.sn !== 1) {
    throw new Error('DATABASE_SECURITY_PROOF_NAMESPACE_FILTER_INVENTORY_INVALID');
  }
  return DATABASE_SECURITY_SQL.replace(pattern, (_match, alias) => alias + '.nspname = $1');
}


const backendRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(backendRoot, 'sql', 'postgres', '031_digital_twin_chain_hardening.sql');
const runtimeGrantMigrationPath = path.join(backendRoot, 'sql', 'postgres', '052_runtime_policy_function_grants.sql');
const controlPlanePolicyMigrationPath = path.join(backendRoot, 'sql', 'postgres', '053_control_plane_restrictive_tenant_guards.sql');
const reportPath = path.join(backendRoot, 'docs', 'verification', 'POSTGRES_LIVE_RLS_RESULT.json');

function emit(status, details = {}, exitCode = 0) {
  const report = {
    schemaVersion: 'opscore.postgres-live-rls-gate.v1',
    generatedAt: new Date().toISOString(),
    status,
    target: 'GitHub Actions disposable PostgreSQL 18 service; rollback-only temporary schema; migrations 031, 052 and 053; tenant RLS for twin, work, appointment and control-plane tables',
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

    // Exercise the actual runtime login-role contract separately from opscore_app.
    const runtimeRole = (await client.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='opscore_runtime'")).rows[0];
    if (!runtimeRole || runtimeRole.rolsuper || runtimeRole.rolbypassrls) throw new Error('RUNTIME_ROLE_MISSING_OR_CAN_BYPASS_RLS');
    await client.query(`CREATE OR REPLACE FUNCTION public.opscore_current_user()
      RETURNS text LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('app.user_id', true), '') $fn$`);
    await client.query(`CREATE OR REPLACE FUNCTION public.opscore_is_privileged()
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO pg_catalog, public, pg_temp
      AS $fn$ SELECT false $fn$`);
    await client.query('REVOKE ALL ON FUNCTION public.opscore_current_user() FROM PUBLIC');
    await client.query('REVOKE ALL ON FUNCTION public.opscore_is_privileged() FROM PUBLIC');
    await client.query('GRANT EXECUTE ON FUNCTION public.opscore_current_user() TO opscore_runtime');

    await client.query(`CREATE TABLE feature_flags (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organizations(id),
      flag_key text NOT NULL,
      enabled integer NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      reason text NOT NULL DEFAULT '',
      updated_by text NOT NULL REFERENCES users(id),
      created_at text NOT NULL,
      updated_at text NOT NULL,
      UNIQUE (organization_id, flag_key)
    )`);
    await client.query(`CREATE TABLE safe_mode_states (
      organization_id text PRIMARY KEY REFERENCES organizations(id),
      enabled integer NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      reason text NOT NULL DEFAULT '',
      updated_by text NOT NULL REFERENCES users(id),
      updated_at text NOT NULL
    )`);
    await client.query(`CREATE TABLE control_plane_runs (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organizations(id),
      run_type text NOT NULL,
      result_json text NOT NULL,
      result_sha256 text NOT NULL,
      created_by text NOT NULL REFERENCES users(id),
      created_at text NOT NULL
    )`);
    const controlPlaneMigration = fs.readFileSync(controlPlanePolicyMigrationPath, 'utf8');
    await client.query(controlPlaneMigration);
    const controlPolicyRows = (await client.query(
      "SELECT c.relname AS table_name,p.polname AS policy_name, " +
      "p.polpermissive AS permissive,p.polcmd AS command,p.polroles::text AS policy_roles, " +
      "pg_get_expr(p.polqual,p.polrelid) AS using_expr, " +
      "pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr " +
      "FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid " +
      "JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname=$1 AND c.relname=ANY($2::text[])",
      [schemaName, ['feature_flags', 'safe_mode_states', 'control_plane_runs']]
    )).rows;
    // Compare PostgreSQL's canonical pg_get_expr representation verbatim.
    // Whitespace inside quoted literals is semantically significant.
    const expectedControlPlanePredicate = "(organization_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))";
    const isExactTenantPolicy = row => row.command === '*' &&
      row.policy_roles === '{0}' &&
      row.using_expr === expectedControlPlanePredicate &&
      row.check_expr === expectedControlPlanePredicate;
    const controlPolicyResults = ['feature_flags', 'safe_mode_states', 'control_plane_runs'].map(table => {
      const rows = controlPolicyRows.filter(row => row.table_name === table);
      const permissive = rows.filter(row =>
        row.policy_name === 'opscore_tenant_permissive' && row.permissive === true);
      const restrictive = rows.filter(row =>
        row.policy_name === 'opscore_tenant_boundary_guard' && row.permissive === false);
      const exactPermissive = permissive.filter(isExactTenantPolicy).length;
      const exactRestrictive = restrictive.filter(isExactTenantPolicy).length;
      const unexpectedPolicies = rows.filter(row =>
        !['opscore_tenant_permissive', 'opscore_tenant_boundary_guard'].includes(row.policy_name)
      ).map(row => row.policy_name);
      const valid = rows.length === 2 && permissive.length === 1 && restrictive.length === 1 &&
        exactPermissive === 1 && exactRestrictive === 1 && unexpectedPolicies.length === 0;
      return {
        table, policyCount: rows.length, permissive: permissive.length, restrictive: restrictive.length,
        exactPermissive, exactRestrictive, unexpectedPolicies,
        status: valid ? 'PASS' : 'FAIL'
      };
    });
    if (controlPolicyResults.some(row => row.status !== 'PASS')) {
      throw new Error('CONTROL_PLANE_RESTRICTIVE_POLICY_CATALOG_INVALID');
    }
    checks.push({ id: 'control-plane-policy-catalog', status: 'PASS', tables: controlPolicyResults });

    // Run the same read-only catalog proof used by /api/verify/database-security
    // against this disposable schema. Only its schema filter is parameterized.
    const proofSql = controlPlaneCatalogProofSql();
    const readControlPlaneProofCount = async () => {
      const result = await client.query(proofSql, [schemaName]);
      return Number(result.rows?.[0]?.control_plane_policy_valid_table_count ?? 0);
    };
    const initialProofCount = await readControlPlaneProofCount();
    if (initialProofCount !== 3) {
      throw new Error('CONTROL_PLANE_DATABASE_SECURITY_PROOF_DID_NOT_VALIDATE_ALL_TABLES');
    }
    checks.push({
      id: 'control-plane-database-security-proof',
      status: 'PASS',
      validatedTableCount: initialProofCount
    });

    // Negative control: changing the policy role away from PUBLIC must fail proof.
    await client.query(`ALTER POLICY opscore_tenant_permissive ON ${quotedSchema}.feature_flags TO opscore_runtime`);
    const wrongRoleProofCount = await readControlPlaneProofCount();
    if (wrongRoleProofCount !== 2) {
      throw new Error('DATABASE_SECURITY_PROOF_ACCEPTED_WRONG_POLICY_ROLE');
    }
    await client.query(`ALTER POLICY opscore_tenant_permissive ON ${quotedSchema}.feature_flags TO PUBLIC`);

    // Whitespace inside a quoted literal changes the predicate and must be rejected.
    await client.query(
      `ALTER POLICY opscore_tenant_boundary_guard ON ${quotedSchema}.feature_flags
       USING (organization_id = NULLIF(current_setting('app.tenant_id', true), ' '))
       WITH CHECK (organization_id = NULLIF(current_setting('app.tenant_id', true), ' '))`
    );
    const whitespaceLiteralProofCount = await readControlPlaneProofCount();
    if (whitespaceLiteralProofCount !== 2) {
      throw new Error('DATABASE_SECURITY_PROOF_ACCEPTED_WHITESPACE_ALTERED_LITERAL');
    }

    // A tautological tenant predicate must fail proof as well.
    await client.query(`ALTER POLICY opscore_tenant_boundary_guard ON ${quotedSchema}.feature_flags USING (true) WITH CHECK (true)`);
    const weakPredicateProofCount = await readControlPlaneProofCount();
    if (weakPredicateProofCount !== 2) {
      throw new Error('DATABASE_SECURITY_PROOF_ACCEPTED_WEAK_TENANT_PREDICATE');
    }
    await client.query(
      `ALTER POLICY opscore_tenant_boundary_guard ON ${quotedSchema}.feature_flags
       USING (organization_id = NULLIF(current_setting('app.tenant_id', true), ''))
       WITH CHECK (organization_id = NULLIF(current_setting('app.tenant_id', true), ''))`
    );
    const restoredProofCount = await readControlPlaneProofCount();
    if (restoredProofCount !== 3) {
      throw new Error('DATABASE_SECURITY_PROOF_DID_NOT_RECOVER_AFTER_NEGATIVE_CONTROLS');
    }
    checks.push({
      id: 'control-plane-database-security-proof-negative-controls',
      status: 'PASS',
      wrongRoleRejected: wrongRoleProofCount === 2,
      whitespaceLiteralRejected: whitespaceLiteralProofCount === 2,
      weakPredicateRejected: weakPredicateProofCount === 2,
      restoredValidatedTableCount: restoredProofCount
    });

    const flagA = `feature_flag_a_${crypto.randomBytes(4).toString('hex')}`;
    const safeModeA = `safe_mode_a_${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      'INSERT INTO feature_flags(id,organization_id,flag_key,enabled,reason,updated_by,created_at,updated_at) VALUES ($1,$2,$3,1,$4,$5,$6,$6)',
      [flagA, orgA, 'test-flag', 'isolated RLS fixture', userA, new Date().toISOString()]
    );
    await client.query(
      'INSERT INTO safe_mode_states(organization_id,enabled,reason,updated_by,updated_at) VALUES ($1,1,$2,$3,$4)',
      [orgA, 'isolated RLS fixture', userA, new Date().toISOString()]
    );


    await client.query('CREATE TABLE appointments (id text PRIMARY KEY, organization_id text NOT NULL, technician_id text NOT NULL)');
    await client.query('CREATE TABLE work_orders (id text PRIMARY KEY, organization_id text NOT NULL, assigned_to text, created_by text)');
    await client.query('ALTER TABLE appointments ENABLE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE appointments FORCE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY');
    await client.query('ALTER TABLE work_orders FORCE ROW LEVEL SECURITY');
    await client.query(`CREATE POLICY opscore_appointment_context ON appointments
      USING (organization_id = current_setting('app.tenant_id', true)
        AND (public.opscore_is_privileged() OR technician_id = public.opscore_current_user()))
      WITH CHECK (organization_id = current_setting('app.tenant_id', true))`);
    await client.query(`CREATE POLICY opscore_work_order_context ON work_orders
      USING (organization_id = current_setting('app.tenant_id', true)
        AND (public.opscore_is_privileged() OR assigned_to = public.opscore_current_user() OR created_by = public.opscore_current_user()))
      WITH CHECK (organization_id = current_setting('app.tenant_id', true))`);
    await client.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO opscore_runtime`);
    await client.query('GRANT SELECT ON appointments, work_orders TO opscore_runtime');
    await client.query('GRANT SELECT, INSERT, UPDATE ON feature_flags, safe_mode_states TO opscore_runtime');
    await client.query('GRANT INSERT ON control_plane_runs TO opscore_runtime');
    const runtimeGrantMigration = fs.readFileSync(runtimeGrantMigrationPath, 'utf8');
    await client.query(runtimeGrantMigration);
    const runtimeFunctionGrant = (await client.query("SELECT has_function_privilege('opscore_runtime','public.opscore_is_privileged()','EXECUTE') AS can_execute")).rows[0];
    if (!runtimeFunctionGrant.can_execute) throw new Error('RUNTIME_POLICY_FUNCTION_EXECUTE_GRANT_MISSING');
    checks.push({ id: 'runtime-policy-function-execute-grant', status: 'PASS', role: 'opscore_runtime', helper: 'public.opscore_is_privileged()' });

    const appointmentA = `appointment_a_${crypto.randomBytes(4).toString('hex')}`;
    const appointmentB = `appointment_b_${crypto.randomBytes(4).toString('hex')}`;
    const workOrderA = `work_order_a_${crypto.randomBytes(4).toString('hex')}`;
    const workOrderB = `work_order_b_${crypto.randomBytes(4).toString('hex')}`;
    await client.query('INSERT INTO appointments(id,organization_id,technician_id) VALUES ($1,$2,$3),($4,$5,$6)', [appointmentA, orgA, userA, appointmentB, orgB, userB]);
    await client.query('INSERT INTO work_orders(id,organization_id,assigned_to,created_by) VALUES ($1,$2,$3,$3),($4,$5,$6,$6)', [workOrderA, orgA, userA, workOrderB, orgB, userB]);

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

    // Validate the exact role used by the Vercel runtime, not only opscore_app.
    await client.query('RESET ROLE');
    await client.query('SET LOCAL ROLE opscore_runtime');
    await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
    const runtimeCheck = (await client.query("SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls, pg_has_role(current_user,'opscore_app','MEMBER') AS legacy_app_member, has_function_privilege(current_user,'public.opscore_is_privileged()','EXECUTE') AS helper_execute FROM pg_roles r WHERE r.rolname=current_user")).rows[0];
    if (!runtimeCheck || runtimeCheck.rolsuper || runtimeCheck.rolbypassrls || runtimeCheck.legacy_app_member || !runtimeCheck.helper_execute) throw new Error('RUNTIME_ROLE_POLICY_HELPER_POSTCONDITION_FAILED');
    await client.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true), set_config('app.access_mode','field',true)", [orgA, userA]);
    const ownAppointments = await client.query('SELECT id FROM appointments');
    const ownWorkOrders = await client.query('SELECT id FROM work_orders');
    if (ownAppointments.rowCount !== 1 || ownAppointments.rows[0].id !== appointmentA) throw new Error('RUNTIME_APPOINTMENT_TENANT_READ_FAILED');
    if (ownWorkOrders.rowCount !== 1 || ownWorkOrders.rows[0].id !== workOrderA) throw new Error('RUNTIME_WORK_ORDER_TENANT_READ_FAILED');
    checks.push({ id: 'runtime-role-tenant-self-read', status: 'PASS', role: runtimeCheck.role_name });

    await client.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true)", [orgA, userB]);
    const crossAppointments = await client.query('SELECT id FROM appointments');
    const crossWorkOrders = await client.query('SELECT id FROM work_orders');
    if (crossAppointments.rowCount !== 0) throw new Error('RUNTIME_APPOINTMENT_CROSS_TENANT_READ_BREACH');
    if (crossWorkOrders.rowCount !== 0) throw new Error('RUNTIME_WORK_ORDER_CROSS_TENANT_READ_BREACH');
    checks.push({ id: 'runtime-role-cross-tenant-read-denied', status: 'PASS', appointmentsRows: crossAppointments.rowCount, workOrdersRows: crossWorkOrders.rowCount });

    // Control-plane rows must remain tenant-scoped even if another permissive
    // policy is introduced later. The restrictive policy is tested under the
    // exact NOBYPASSRLS runtime role, not the migration owner.
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true),set_config('app.access_mode','field',true)", [orgA, userA]);
    const ownFeatureFlags = await client.query('SELECT id FROM feature_flags WHERE id=$1', [flagA]);
    const ownSafeMode = await client.query('SELECT organization_id FROM safe_mode_states WHERE organization_id=$1', [orgA]);
    if (ownFeatureFlags.rowCount !== 1 || ownSafeMode.rowCount !== 1) throw new Error('CONTROL_PLANE_TENANT_SELF_READ_FAILED');
    checks.push({ id: 'control-plane-tenant-self-read', status: 'PASS', featureFlagsRows: ownFeatureFlags.rowCount, safeModeRows: ownSafeMode.rowCount });

    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)", [orgB, userB]);
    const crossFeatureFlags = await client.query('SELECT id FROM feature_flags WHERE id=$1', [flagA]);
    const crossSafeMode = await client.query('SELECT organization_id FROM safe_mode_states WHERE organization_id=$1', [orgA]);
    if (crossFeatureFlags.rowCount !== 0 || crossSafeMode.rowCount !== 0) throw new Error('CONTROL_PLANE_CROSS_TENANT_READ_BREACH');
    const crossFlagUpdate = await client.query("UPDATE feature_flags SET reason='cross-tenant-write' WHERE id=$1", [flagA]);
    if (crossFlagUpdate.rowCount !== 0) throw new Error('CONTROL_PLANE_CROSS_TENANT_UPDATE_BREACH');
    checks.push({ id: 'control-plane-cross-tenant-read-denied', status: 'PASS', featureFlagsRows: crossFeatureFlags.rowCount, safeModeRows: crossSafeMode.rowCount, updateRows: crossFlagUpdate.rowCount });

    const controlRunA = `control_run_a_${crypto.randomBytes(4).toString('hex')}`;
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)", [orgA, userA]);
    await client.query(
      'INSERT INTO control_plane_runs(id,organization_id,run_type,result_json,result_sha256,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [controlRunA, orgA, 'rls-test', '{}', 'a'.repeat(64), userA, new Date().toISOString()]
    );
    checks.push({ id: 'control-plane-tenant-self-insert', status: 'PASS' });
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)", [orgB, userB]);
    await client.query('SAVEPOINT control_plane_cross_insert');
    let controlCrossInsertDenied = false;
    try {
      await client.query(
        'INSERT INTO control_plane_runs(id,organization_id,run_type,result_json,result_sha256,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [`control_run_cross_${crypto.randomBytes(4).toString('hex')}`, orgA, 'rls-test-cross', '{}', 'b'.repeat(64), userA, new Date().toISOString()]
      );
    } catch (error) {
      controlCrossInsertDenied = error.code === '42501';
      await client.query('ROLLBACK TO SAVEPOINT control_plane_cross_insert');
    }
    await client.query('RELEASE SAVEPOINT control_plane_cross_insert');
    if (!controlCrossInsertDenied) throw new Error('CONTROL_PLANE_CROSS_TENANT_INSERT_NOT_DENIED');
    checks.push({ id: 'control-plane-cross-tenant-insert-denied', status: 'PASS', deniedByRls: true });

    // System-wide operational tables must be usable by the same NOBYPASSRLS
    // runtime role as production. These writes are inside the outer rollback-only
    // transaction and never persist beyond this disposable CI test.
    await client.query("SELECT set_config('app.tenant_id','',true),set_config('app.user_id','',true),set_config('app.access_mode','auth',true)");
    const systemThrottleKey = `system_rls_throttle_${crypto.randomBytes(8).toString('hex')}`;
    const systemBucketKey = `system_rls_bucket_${crypto.randomBytes(8).toString('hex')}`;
    const systemEventId = `system_rls_event_${crypto.randomBytes(8).toString('hex')}`;
    const systemNow = Date.now();
    const systemTimestamp = new Date().toISOString();

    await client.query(
      'INSERT INTO public.login_throttle(throttle_key,window_start,attempts,locked_until,updated_at) VALUES($1,$2,1,0,$3)',
      [systemThrottleKey, systemNow, systemTimestamp]
    );
    const throttleRead = await client.query('SELECT attempts FROM public.login_throttle WHERE throttle_key=$1', [systemThrottleKey]);
    if (throttleRead.rowCount !== 1 || Number(throttleRead.rows[0].attempts) !== 1) throw new Error('RUNTIME_LOGIN_THROTTLE_READ_FAILED');
    await client.query('UPDATE public.login_throttle SET attempts=2 WHERE throttle_key=$1', [systemThrottleKey]);
    const throttleUpdate = await client.query('SELECT attempts FROM public.login_throttle WHERE throttle_key=$1', [systemThrottleKey]);
    if (throttleUpdate.rowCount !== 1 || Number(throttleUpdate.rows[0].attempts) !== 2) throw new Error('RUNTIME_LOGIN_THROTTLE_UPDATE_FAILED');
    await client.query('DELETE FROM public.login_throttle WHERE throttle_key=$1', [systemThrottleKey]);

    await client.query(
      'INSERT INTO public.firewall_rate_buckets(bucket_key,window_start,requests,updated_at) VALUES($1,$2,1,$3)',
      [systemBucketKey, systemNow, systemTimestamp]
    );
    await client.query(
      'INSERT INTO public.firewall_rate_buckets(bucket_key,window_start,requests,updated_at) VALUES($1,$2,2,$3) ON CONFLICT(bucket_key) DO UPDATE SET requests=excluded.requests,updated_at=excluded.updated_at',
      [systemBucketKey, systemNow, systemTimestamp]
    );
    const bucketRead = await client.query('SELECT requests FROM public.firewall_rate_buckets WHERE bucket_key=$1', [systemBucketKey]);
    if (bucketRead.rowCount !== 1 || Number(bucketRead.rows[0].requests) !== 2) throw new Error('RUNTIME_FIREWALL_RATE_BUCKET_UPSERT_FAILED');
    await client.query('DELETE FROM public.firewall_rate_buckets WHERE bucket_key=$1', [systemBucketKey]);

    await client.query(
      'INSERT INTO public.worker_guard_system_events(id,queue_name,action,reason,metrics_json,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [systemEventId, 'rls-test', 'record', 'runtime-policy-check', '{}', systemTimestamp]
    );
    await client.query('SAVEPOINT worker_system_event_read');
    let workerEventReadDenied = false;
    try {
      await client.query('SELECT id FROM public.worker_guard_system_events WHERE id=$1', [systemEventId]);
    } catch (error) {
      workerEventReadDenied = error.code === '42501';
      await client.query('ROLLBACK TO SAVEPOINT worker_system_event_read');
    }
    await client.query('RELEASE SAVEPOINT worker_system_event_read');
    if (!workerEventReadDenied) throw new Error('RUNTIME_WORKER_SYSTEM_EVENT_NOT_APPEND_ONLY');
    checks.push({ id: 'runtime-role-system-table-rls-and-least-privilege', status: 'PASS', loginThrottle: 'read-write-delete', firewallRateBuckets: 'upsert-delete', workerGuardEvents: 'insert-only' });

    await client.query('RESET ROLE');
    await client.query('ROLLBACK');
    inTransaction = false;
    emit('PASS', { database: info.database, serverVersion: info.server_version, executedChecks: checks, checkCount: checks.length, note: 'This gate runs on the disposable PostgreSQL 18 service created by GitHub Actions. It tests migrations 031, 052, 053 and 059 plus tenant policy execution for twin, appointment, work-order, control-plane and system operational tables under the opscore_runtime role without inheriting opscore_app in a rollback-only isolated schema. It does not connect to Neon and does not certify all production data or production isolation.' });
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
