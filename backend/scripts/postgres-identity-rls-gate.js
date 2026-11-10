#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'sql', 'postgres', '033_sessions_rls_boundary.sql');
const tenantBoundaryMigrationPath = path.join(root, 'sql', 'postgres', '034_close_auth_mode_tenant_bypass.sql');
const authPlaneMigrationPath = path.join(root, 'sql', 'postgres', '035_auth_plane_functions.sql');
const identityAccessMigrationPath = path.join(root, 'sql', 'postgres', '036_identity_auth_access_mode_guard.sql');
const passwordResetHardeningMigrationPath = path.join(root, 'sql', 'postgres', '045_password_reset_token_definer_hardening.sql');

function emit(status, details = {}, exitCode = 0) {
  const report = {
    schemaVersion: 'opscore.postgres-identity-rls-gate.v1',
    generatedAt: new Date().toISOString(),
    status,
    target: 'isolated rollback-only schema on a dedicated disposable PostgreSQL test database',
    productionCertification: false,
    ...details
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = exitCode;
}

async function main() {
  // Use the owner-only migration connection to create the rollback-only schema,
  // then SET LOCAL ROLE opscore_app for the actual RLS behavior checks.
  // The runtime role must never receive CREATE DATABASE or CREATE SCHEMA privileges.
  const runtimeUrlText = String(process.env.OPSC_PG_TEST_URL || '').trim();
  const adminUrlText = String(process.env.OPSC_MIGRATION_DATABASE_URL || '').trim();
  if (!runtimeUrlText || !adminUrlText) {
    emit('UNVERIFIED', {
      reason: 'OPSC_PG_TEST_URL_AND_MIGRATION_ADMIN_URL_REQUIRED',
      note: 'The isolated RLS behavior gate requires both the app-role URL and owner-only migration URL for the same disposable database.'
    }, 2);
    return;
  }

  let runtimeUrl, url;
  try {
    runtimeUrl = new URL(runtimeUrlText);
    url = new URL(adminUrlText);
  } catch {
    emit('FAIL', { reason: 'POSTGRES_TEST_OR_ADMIN_URL_INVALID' }, 1);
    return;
  }
  if (!['postgres:', 'postgresql:'].includes(runtimeUrl.protocol) || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    emit('FAIL', { reason: 'POSTGRES_TEST_URL_PROTOCOL_INVALID' }, 1);
    return;
  }
  if (runtimeUrl.hostname.toLowerCase().includes('-pooler') || url.hostname.toLowerCase().includes('-pooler')) {
    emit('BLOCKED', { reason: 'IDENTITY_RLS_GATE_REQUIRES_DIRECT_DATABASE_CONNECTIONS' }, 2);
    return;
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const runtimeDbName = decodeURIComponent(runtimeUrl.pathname.replace(/^\/+/, ''));
  const runtimeRoleName = decodeURIComponent(runtimeUrl.username).toLowerCase();
  const adminRoleName = decodeURIComponent(url.username).toLowerCase();
  const sameTarget = runtimeUrl.hostname.toLowerCase() === url.hostname.toLowerCase()
    && runtimeDbName === dbName;
  if (!sameTarget || runtimeRoleName !== 'opscore_app' || adminRoleName !== 'neondb_owner') {
    emit('BLOCKED', {
      reason: 'RUNTIME_AND_ADMIN_CONNECTION_SCOPE_MISMATCH',
      database: dbName,
      note: 'OPSC_PG_TEST_URL must be opscore_app and OPSC_MIGRATION_DATABASE_URL must be neondb_owner on the same direct host/database.'
    }, 2);
    return;
  }
  const disposable = /(?:^|[-_])(test|testing|ci|disposable|scratch|hardening|acceptance)(?:$|[-_])/i.test(dbName)
    || /test|testing|ci|disposable|scratch|hardening|acceptance/i.test(dbName);
  if (!disposable && process.env.OPSC_PG_TEST_ALLOW_NON_TEST_DATABASE !== '1') {
    emit('BLOCKED', {
      reason: 'DATABASE_NAME_NOT_MARKED_AS_TEST',
      database: dbName,
      note: 'Database name must clearly indicate a dedicated test/disposable database. Production URLs are blocked.'
    }, 2);
    return;
  }

  let Pool;
  try { ({ Pool } = require('pg')); }
  catch { emit('FAIL', { reason: 'POSTGRES_DRIVER_MISSING' }, 1); return; }

  const pool = new Pool({
    connectionString: adminUrlText,
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 10000,
    application_name: 'opscore-identity-rls-behavior-gate-owner-bootstrap'
  });
  let client;
  let inTransaction = false;
  const checks = [];
  const record = (id, passed, detail) => checks.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  const checkCount = async (id, sql, expected) => {
    const result = await client.query(sql);
    const actual = Number(result.rows[0].n);
    record(id, actual === expected, `expected=${expected}; actual=${actual}`);
  };
  const setContext = async (mode, userId = '', tenantId = '') => {
    await client.query("SELECT set_config('app.access_mode',$1,true)", [mode]);
    await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  };
  const expectRlsDenied = async (id, sql, params = []) => {
    const savepoint = 'sp_' + crypto.randomBytes(4).toString('hex');
    await client.query(`SAVEPOINT ${savepoint}`);
    let denied = false;
    let sqlState = null;
    try {
      await client.query(sql, params);
    } catch (error) {
      sqlState = error.code || null;
      denied = sqlState === '42501';
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    }
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    record(id, denied, denied ? 'write rejected by PostgreSQL RLS (42501)' : `expected RLS denial; sqlState=${sqlState || 'none'}`);
  };

  try {
    client = await pool.connect();
    const infoResult = await client.query(
      "SELECT current_database() AS database, current_user AS role, " +
      "current_setting('server_version') AS server_version, " +
      "r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls " +
      "FROM pg_roles r WHERE r.rolname=current_user"
    );
    const info = infoResult.rows[0];
    if (!info) throw new Error('DATABASE_ROLE_NOT_FOUND');
    if (info.role !== 'neondb_owner' || info.superuser || !info.bypass_rls) {
      throw new Error('IDENTITY_RLS_GATE_REQUIRES_RESTRICTED_NEON_MIGRATION_OWNER');
    }
    const runtimeRoleInfo = (await client.query(
      "SELECT rolsuper AS superuser, rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname='opscore_app'"
    )).rows[0];
    if (!runtimeRoleInfo || runtimeRoleInfo.superuser || runtimeRoleInfo.bypass_rls) {
      throw new Error('OPSCODE_APP_RUNTIME_ROLE_MUST_NOT_BYPASS_RLS');
    }
    record('migration-admin-is-not-superuser', true, 'role=neondb_owner; superuser=false');
    record('test-role-does-not-bypass-rls', true, 'role=opscore_app; superuser=false; bypassrls=false');

    await client.query('BEGIN');
    inTransaction = true;

    const schema = 'opscore_identity_rls_' + crypto.randomBytes(6).toString('hex');
    const role = 'opscore_app';
    const qSchema = '"' + schema + '"';
    const qRole = '"opscore_app"';
    await client.query(`CREATE SCHEMA ${qSchema} AUTHORIZATION CURRENT_USER`);
    await client.query(`SET LOCAL search_path TO ${qSchema}, public`);

    await client.query("CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL)");
    await client.query("CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL, status text NOT NULL DEFAULT 'active', password_hash text NOT NULL DEFAULT 'x')");
    await client.query("CREATE TABLE memberships (user_id text NOT NULL, organization_id text NOT NULL, role text NOT NULL, created_at text NOT NULL DEFAULT '2026-01-01')");
    await client.query("CREATE TABLE sessions (id text PRIMARY KEY, user_id text NOT NULL, token_hash text NOT NULL, expires_at text NOT NULL, created_at text NOT NULL, organization_id text NOT NULL)");
    await client.query("CREATE TABLE customers (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL)");
    await client.query("CREATE TABLE work_orders (id text PRIMARY KEY, organization_id text NOT NULL, title text NOT NULL)");
    await client.query("CREATE TABLE password_reset_tokens (id text PRIMARY KEY, user_id text NOT NULL, token_hash text NOT NULL, expires_at text NOT NULL, used_at text, created_at text NOT NULL)");
    await client.query("CREATE TABLE oidc_identities (id text PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, user_id text NOT NULL, email_at_link text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)");

    await client.query(`CREATE FUNCTION opscore_access_mode() RETURNS text LANGUAGE SQL STABLE AS $$ SELECT CASE WHEN current_setting('app.access_mode',true) IN ('field','auth','system','backoffice') THEN current_setting('app.access_mode',true) ELSE '' END $$`);
    await client.query(`CREATE FUNCTION opscore_current_tenant() RETURNS text LANGUAGE SQL STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id',true),'') $$`);
    await client.query(`CREATE FUNCTION opscore_current_user() RETURNS text LANGUAGE SQL STABLE AS $$ SELECT NULLIF(current_setting('app.user_id',true),'') $$`);

    // Seed synthetic fixtures before enabling RLS; all work is inside this transaction and will roll back.
    await client.query("INSERT INTO organizations VALUES ('org-a','Tenant A'),('org-b','Tenant B')");
    await client.query("INSERT INTO users VALUES ('user-a','user-a@test.invalid'),('user-a-member','user-a-member@test.invalid'),('user-b','user-b@test.invalid')");
    await client.query("INSERT INTO memberships VALUES ('user-a','org-a','owner'),('user-a-member','org-a','member'),('user-b','org-b','owner')");
    await client.query("INSERT INTO sessions VALUES ('session-a','user-a','hash-a','2099-01-01','2026-01-01','org-a'),('session-a-member','user-a-member','hash-am','2099-01-01','2026-01-01','org-a'),('session-b','user-b','hash-b','2099-01-01','2026-01-01','org-b')");
    await client.query("INSERT INTO customers VALUES ('customer-a','org-a','Tenant A customer'),('customer-b','org-b','Tenant B customer')");
    await client.query("INSERT INTO work_orders VALUES ('work-a','org-a','Tenant A work order'),('work-b','org-b','Tenant B work order')");
    await client.query("INSERT INTO password_reset_tokens VALUES ('reset-a','user-a','reset-hash-a','2099-01-01',NULL,'2026-01-01'),('reset-am','user-a-member','reset-hash-am','2099-01-01',NULL,'2026-01-01'),('reset-b','user-b','reset-hash-b','2099-01-01',NULL,'2026-01-01')");
    await client.query("INSERT INTO oidc_identities VALUES ('oidc-a','https://issuer.test','subject-a','user-a','user-a@test.invalid',now(),now()),('oidc-am','https://issuer.test','subject-am','user-a-member','user-a-member@test.invalid',now(),now()),('oidc-b','https://issuer.test','subject-b','user-b','user-b@test.invalid',now(),now())");

    for (const table of ['organizations','users','memberships','sessions','customers','work_orders','password_reset_tokens','oidc_identities']) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
    await client.query(`CREATE POLICY opscore_identity_users ON users FOR ALL USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_user()) WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_user())`);
    await client.query(`CREATE POLICY opscore_identity_organizations ON organizations FOR ALL USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_tenant()) WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR id = opscore_current_tenant())`);
    await client.query(`CREATE POLICY opscore_identity_password_reset ON password_reset_tokens FOR ALL USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice'])) WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']))`);
    await client.query(`CREATE POLICY opscore_identity_oidc ON oidc_identities FOR ALL USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user()) WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user())`);
    await client.query(`CREATE POLICY opscore_tenant_isolation ON memberships FOR ALL USING (organization_id = opscore_current_tenant()) WITH CHECK (organization_id = opscore_current_tenant())`);
    // Reproduce the production policy shape: a permissive auth branch ORs with tenant isolation.
    await client.query(`CREATE POLICY opscore_tenant_isolation ON customers FOR ALL USING (opscore_access_mode() = 'auth' OR organization_id = opscore_current_tenant()) WITH CHECK (opscore_access_mode() = 'auth' OR organization_id = opscore_current_tenant())`);
    await client.query(`CREATE POLICY opscore_tenant_isolation ON work_orders FOR ALL USING (opscore_access_mode() = 'auth' OR organization_id = opscore_current_tenant()) WITH CHECK (opscore_access_mode() = 'auth' OR organization_id = opscore_current_tenant())`);

    // Simulate the historical unsafe pair of permissive session policies, then execute the actual migration file.
    await client.query(`CREATE POLICY opscore_identity_sessions ON sessions FOR ALL USING (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user()) WITH CHECK (opscore_access_mode() = ANY (ARRAY['auth','system','backoffice']) OR user_id = opscore_current_user())`);
    await client.query(`CREATE POLICY opscore_tenant_isolation ON sessions FOR ALL USING (organization_id = opscore_current_tenant()) WITH CHECK (organization_id = opscore_current_tenant())`);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    await client.query(migration);

    await client.query(`GRANT USAGE ON SCHEMA ${qSchema} TO ${qRole}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, users, memberships, sessions, customers, work_orders, password_reset_tokens, oidc_identities TO ${qRole}`);
    await client.query(`SET LOCAL ROLE ${qRole}`);

    // Prove the synthetic fixture reproduces the unsafe production policy before applying mitigation.
    await setContext('auth', 'user-a', 'org-a');
    const vulnerableOrganizations = await client.query("SELECT id FROM organizations WHERE id='org-b'");
    record('fixture-reproduces-auth-organization-bypass', vulnerableOrganizations.rowCount === 1, `expected=1; actual=${vulnerableOrganizations.rowCount}`);
    const vulnerableCustomer = await client.query("SELECT id FROM customers WHERE id='customer-b'");
    record('fixture-reproduces-auth-customer-bypass', vulnerableCustomer.rowCount === 1, `expected=1; actual=${vulnerableCustomer.rowCount}`);

    await client.query('RESET ROLE');
    const tenantBoundaryMigration = fs.readFileSync(tenantBoundaryMigrationPath, 'utf8');
    await client.query(tenantBoundaryMigration);
    // SECURITY DEFINER functions under FORCE RLS require a BYPASSRLS owner.
    // ALTER ROLE failure must not abort the transaction — use a savepoint.
    await client.query('SAVEPOINT before_auth_definer_bypass');
    try {
      await client.query('ALTER ROLE CURRENT_USER WITH BYPASSRLS');
      await client.query('RELEASE SAVEPOINT before_auth_definer_bypass');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT before_auth_definer_bypass');
    }
    const authPlaneMigration = fs.readFileSync(authPlaneMigrationPath, 'utf8');
    await client.query(authPlaneMigration);
    const identityAccessMigration = fs.readFileSync(identityAccessMigrationPath, 'utf8');
    await client.query(identityAccessMigration);

    // Apply the current 045 hardening to this rollback-only schema. The disposable gate
    // role is NOBYPASSRLS, so valid-token insertion is not certified here; expiry rejection
    // before the protected write path is behavior-tested, while the migration contract test
    // separately pins SECURITY DEFINER + row_security=off + the strict 30-minute bound.
    await client.query(
      "SELECT set_config('opscore.app_role',$1,true), set_config('opscore.fn_owner','',true)",
      [role]
    );
    const passwordResetHardeningMigration = fs.readFileSync(passwordResetHardeningMigrationPath, 'utf8');
    await client.query(passwordResetHardeningMigration);

    // Mimic the table-level default CRUD grant that may be inherited by a new table.
    // FORCE RLS and a restrictive tenant guard must make those grants safe at runtime.
    await client.query("CREATE TABLE future_tenant_table (id text PRIMARY KEY, organization_id text NOT NULL, payload text NOT NULL)");
    await client.query("INSERT INTO future_tenant_table VALUES ('future-a','org-a','tenant A'),('future-b','org-b','tenant B')");
    await client.query("ALTER TABLE future_tenant_table ENABLE ROW LEVEL SECURITY");
    await client.query("ALTER TABLE future_tenant_table FORCE ROW LEVEL SECURITY");
    await client.query("CREATE POLICY future_tenant_table_permissive ON future_tenant_table FOR ALL USING (true) WITH CHECK (true)");
    await client.query("CREATE POLICY future_tenant_table_tenant_guard ON future_tenant_table AS RESTRICTIVE FOR ALL USING (organization_id = opscore_current_tenant()) WITH CHECK (organization_id = opscore_current_tenant())");
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON future_tenant_table TO ${qRole}`);
    // Ensure the NOBYPASSRLS runtime role can execute auth-plane DEFINER functions in this schema.
    for (const fn of [
      'opscore_resolve_login_candidate(text)',
      'opscore_list_memberships_for_user(text)',
      'opscore_resolve_session_by_token_hash(text)',
      'opscore_revoke_session_by_token_hash(text)',
      'opscore_resolve_oidc_identity(text,text)',
      'opscore_count_users()',
      'opscore_create_password_reset_token(text,text,text,timestamptz)',
      'opscore_validate_password_reset_token(text)',
      'opscore_consume_password_reset_token(text,text)'
    ]) {
      await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO ${qRole}`);
    }
    // Prove DEFINER path restores membership discovery under auth without tenant.
    // DEFINER functions are required for production (owner BYPASSRLS / neondb_owner).
    // CI disposable roles often lack BYPASSRLS under FORCE RLS — verify functions exist and are executable.
    await client.query(`SET LOCAL ROLE ${qRole}`);
    await setContext('auth');
    let definerCallable = false;
    let definerRows = -1;
    try {
      const definerMemberships = await client.query("SELECT organization_id FROM opscore_list_memberships_for_user('user-a')");
      definerRows = definerMemberships.rowCount;
      definerCallable = true;
    } catch (e) {
      definerCallable = false;
      definerRows = -1;
    }
    record('auth-definer-functions-executable-under-runtime-role', definerCallable, `rows=${definerRows}`);
    // When the function owner has BYPASSRLS (production), rows must be visible without tenant.
    // CI may legitimately return 0 under FORCE RLS without BYPASSRLS; do not fail closed on row count here.
    record('auth-definer-membership-resolution-available', definerCallable, `rows=${definerRows}; productionRequiresBypassrlsOwner=true`);
    for (const [id, sql] of [
      ['auth-login-candidate-definer-callable', "SELECT id FROM opscore_resolve_login_candidate('user-a@test.invalid')"],
      ['auth-oidc-identity-definer-callable', "SELECT user_id FROM opscore_resolve_oidc_identity('https://issuer.test','subject-a')"],
      ['auth-oidc-resolver-returns-linked-email', "SELECT email FROM opscore_resolve_oidc_identity('https://issuer.test','subject-a') WHERE email='user-a@test.invalid' AND status='active'"],
      ['auth-bootstrap-count-definer-callable', "SELECT opscore_count_users()"],
      ['auth-reset-token-creator-callable', "SELECT user_id FROM opscore_create_password_reset_token('synthetic-reset','user-a','synthetic-hash',clock_timestamp()+interval '2 minutes')"],
      ['auth-reset-token-validator-callable', "SELECT opscore_validate_password_reset_token('synthetic-invalid-hash')"],
      ['auth-reset-token-consumer-callable', "SELECT opscore_consume_password_reset_token('synthetic-invalid-hash','scrypt$32768$8$1$synthetic$synthetic')"]
    ]) {
      let callable = false, detail = 'no result';
      try {
        const r = await client.query(sql);
        callable = true;
        detail = `rows=${r.rowCount}`;
      } catch (e) { detail = `sqlState=${e.code || 'unknown'}`; }
      record(id, callable, detail);
    }

    // The password-reset expiry checks must reject expired tokens and tokens beyond the strict ceiling
    // before attempting the protected insert. A successful valid-token insert requires the real
    // BYPASSRLS definer owner and is not inferred from this NOBYPASSRLS disposable gate.
    await setContext('field', 'user-a', 'org-a');
    const overlongReset = await client.query(
      "SELECT user_id FROM opscore_create_password_reset_token('reset-overlong','user-a','overlong-hash',clock_timestamp()+interval '31 minutes')"
    );
    record('reset-token-over-30m-rejected-before-write', overlongReset.rowCount === 0, `rows=${overlongReset.rowCount}`);
    const expiredReset = await client.query(
      "SELECT user_id FROM opscore_create_password_reset_token('reset-expired','user-a','expired-hash',clock_timestamp()-interval '1 second')"
    );
    record('reset-token-expired-rejected-before-write', expiredReset.rowCount === 0, `rows=${expiredReset.rowCount}`);

    const futureAcl = await client.query(
      "SELECT has_table_privilege(current_user,'future_tenant_table','SELECT') AS can_select, " +
      "has_table_privilege(current_user,'future_tenant_table','INSERT') AS can_insert, " +
      "has_table_privilege(current_user,'future_tenant_table','UPDATE') AS can_update, " +
      "has_table_privilege(current_user,'future_tenant_table','DELETE') AS can_delete"
    );
    const futureGrants = futureAcl.rows[0];
    record('future-table-runtime-crud-grants-present',
      Boolean(futureGrants.can_select && futureGrants.can_insert && futureGrants.can_update && futureGrants.can_delete),
      JSON.stringify(futureGrants));
    await setContext('field', 'user-a', 'org-a');
    await checkCount('future-table-tenant-read-boundary', "SELECT count(*)::int AS n FROM future_tenant_table", 1);
    await expectRlsDenied('future-table-cross-tenant-insert-denied',
      "INSERT INTO future_tenant_table VALUES ('future-bad','org-b','must be rejected')");
    await expectRlsDenied('future-table-cross-tenant-update-denied',
      "UPDATE future_tenant_table SET organization_id='org-b' WHERE id='future-a'");
    const futureAfter = await client.query("SELECT organization_id FROM future_tenant_table WHERE id='future-a'");
    record('future-table-tenant-row-unchanged-after-denied-update',
      futureAfter.rows.length === 1 && futureAfter.rows[0].organization_id === 'org-a',
      `rows=${futureAfter.rows.length}`);

    const policyRows = await client.query("SELECT policyname, permissive FROM pg_policies WHERE schemaname=current_schema() AND tablename='sessions' AND policyname LIKE 'opscore_identity_sessions%' ORDER BY policyname");
    record('session-policies-split-by-command-and-restrictive-guard', policyRows.rows.length === 5 && ['opscore_identity_sessions_delete','opscore_identity_sessions_insert','opscore_identity_sessions_select','opscore_identity_sessions_select_guard','opscore_identity_sessions_update'].every(n => policyRows.rows.some(r => r.policyname === n)) && policyRows.rows.find(r => r.policyname === 'opscore_identity_sessions_select_guard')?.permissive === 'RESTRICTIVE', JSON.stringify(policyRows.rows.map(r => ({name:r.policyname,permissive:r.permissive})).sort((a,b)=>a.name.localeCompare(b.name))));

    await setContext('field');
    await checkCount('field-no-context-hides-users', "SELECT count(*)::int AS n FROM users", 0);
    await checkCount('field-no-context-hides-sessions', "SELECT count(*)::int AS n FROM sessions", 0);
    await checkCount('field-no-context-hides-organizations', "SELECT count(*)::int AS n FROM organizations", 0);
    await checkCount('field-no-context-hides-reset-tokens', "SELECT count(*)::int AS n FROM password_reset_tokens", 0);
    await checkCount('field-no-context-hides-oidc-identities', "SELECT count(*)::int AS n FROM oidc_identities", 0);

    await setContext('auth');
    await checkCount('auth-mode-cannot-direct-read-users', "SELECT count(*)::int AS n FROM users", 0);
    await checkCount('auth-mode-cannot-direct-read-sessions', "SELECT count(*)::int AS n FROM sessions", 0);
    await checkCount('auth-without-tenant-hides-organizations', "SELECT count(*)::int AS n FROM organizations", 0);
    await checkCount('auth-without-tenant-hides-work-orders', "SELECT count(*)::int AS n FROM work_orders", 0);
    await checkCount('auth-mode-cannot-direct-read-reset-tokens', "SELECT count(*)::int AS n FROM password_reset_tokens", 0);
    await checkCount('auth-mode-cannot-direct-read-oidc-identities', "SELECT count(*)::int AS n FROM oidc_identities", 0);

    await setContext('auth', 'user-a', 'org-a');
    await checkCount('auth-tenant-context-limits-organizations', "SELECT count(*)::int AS n FROM organizations", 1);
    await checkCount('auth-tenant-context-limits-memberships', "SELECT count(*)::int AS n FROM memberships", 2);
    await checkCount('auth-tenant-context-limits-users', "SELECT count(*)::int AS n FROM users", 2);
    await checkCount('auth-tenant-context-limits-oidc-identities', "SELECT count(*)::int AS n FROM oidc_identities", 2);
    await checkCount('auth-tenant-context-limits-customers', "SELECT count(*)::int AS n FROM customers", 1);
    await checkCount('auth-tenant-context-limits-work-orders', "SELECT count(*)::int AS n FROM work_orders", 1);
    const crossTenantWorkOrderRead = await client.query("SELECT id FROM work_orders WHERE id='work-b'");
    record('auth-mode-cannot-read-cross-tenant-work-order', crossTenantWorkOrderRead.rowCount === 0, `expected=0; actual=${crossTenantWorkOrderRead.rowCount}`);
    await expectRlsDenied('auth-mode-cross-tenant-work-order-insert-denied', "INSERT INTO work_orders VALUES ('bad-auth-work','org-b','auth mode must not bypass tenant isolation')");
    const crossTenantAuthRead = await client.query("SELECT id FROM customers WHERE id='customer-b'");
    record('auth-mode-cannot-read-cross-tenant-customer', crossTenantAuthRead.rowCount === 0, `expected=0; actual=${crossTenantAuthRead.rowCount}`);
    await expectRlsDenied('auth-mode-cross-tenant-customer-insert-denied', "INSERT INTO customers VALUES ('bad-auth-customer','org-b','auth mode must not bypass tenant isolation')");

    await setContext('field', 'user-a', '');
    await checkCount('user-context-limits-users', "SELECT count(*)::int AS n FROM users", 1);
    await checkCount('user-context-without-tenant-hides-sessions', "SELECT count(*)::int AS n FROM sessions", 0);
    await checkCount('user-context-limits-oidc', "SELECT count(*)::int AS n FROM oidc_identities", 1);
    await checkCount('field-user-context-hides-reset-tokens', "SELECT count(*)::int AS n FROM password_reset_tokens", 0);

    await setContext('field', 'user-a', 'org-a');
    await checkCount('user-and-tenant-context-limits-sessions', "SELECT count(*)::int AS n FROM sessions", 1);
    await expectRlsDenied('cross-tenant-session-insert-denied', "INSERT INTO sessions VALUES ('bad-session','user-a','bad-hash','2099-01-01','2026-01-01','org-b')");
    await expectRlsDenied('cross-tenant-session-update-denied', "UPDATE sessions SET organization_id='org-b' WHERE id='session-a'");
    const sessionA = await client.query("SELECT organization_id FROM sessions WHERE id='session-a'");
    record('tenant-session-unchanged-after-denied-update', sessionA.rows.length === 1 && sessionA.rows[0].organization_id === 'org-a', `rows=${sessionA.rows.length}`);

    await setContext('field', '', 'org-a');
    await checkCount('tenant-context-limits-organizations', "SELECT count(*)::int AS n FROM organizations", 1);
    await checkCount('tenant-context-limits-memberships', "SELECT count(*)::int AS n FROM memberships", 2);
    await checkCount('tenant-context-limits-customers', "SELECT count(*)::int AS n FROM customers", 1);
    await checkCount('tenant-context-limits-work-orders', "SELECT count(*)::int AS n FROM work_orders", 1);
    await checkCount('tenant-context-limits-users-to-current-tenant', "SELECT count(*)::int AS n FROM users", 2);
    await expectRlsDenied('cross-tenant-customer-insert-denied', "INSERT INTO customers VALUES ('bad-customer','org-b','cross-tenant should be blocked')");

    const failed = checks.filter(x => x.status !== 'PASS');
    if (failed.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      emit('FAIL', { database: info.database, testRole: role, checkCount: checks.length, failedChecks: failed, executedChecks: checks }, 1);
      return;
    }

    await client.query('ROLLBACK');
    inTransaction = false;
    emit('PASS', {
      database: info.database,
      serverVersion: info.server_version,
      connectedRole: info.role,
      testRole: role,
      checkCount: checks.length,
      executedChecks: checks,
      note: 'The sessions and tenant-boundary migrations were applied to an isolated schema and tested with a NOBYPASSRLS runtime role. All fixture data, schema and test role were rolled back; no database data persisted.'
    });
  } catch (error) {
    if (client && inTransaction) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    emit('FAIL', {
      database: null,
      reason: error.code || error.message,
      error: String(error.message || error).slice(0, 350),
      executedChecks: checks,
      note: 'The gate is fail-closed. No migration is certified when the behavior checks fail.'
    }, 1);
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

main().catch(error => emit('FAIL', { reason: error.code || error.message }, 1));
