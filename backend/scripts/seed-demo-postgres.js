'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const config = require('../src/config');
const { openDatabase } = require('../src/db-open');
const { Store } = require('../src/store');
const { id, now, hashPassword } = require('../src/security');
const { resolveBootstrapConfig, assertBootstrapDatabaseRole } = require('../src/bootstrap-policy');
const { readMigrations } = require('./apply-postgres-migrations');

const EXPECTED = Object.freeze({
  projectId: 'delicate-lake-72003710',
  branchId: 'br-divine-pine-bci896ws',
  database: 'opscore_demo',
  host: 'ep-hidden-fog-bci5emef.c-16.us-east-1.aws.neon.tech',
  confirmation: 'opscore-customer-demo:br-divine-pine-bci896ws',
  organizationName: 'OpsCore Customer Demo — Synthetic Workspace'
});

const ACCOUNT_SPECS = Object.freeze([
  { key: 'ADMIN', email: 'admin@demo.opscore.invalid', role: 'owner', label: 'Workspace owner' },
  { key: 'DISPATCHER', email: 'dispatcher@demo.opscore.invalid', role: 'manager', label: 'Dispatcher' },
  { key: 'TECHNICIAN', email: 'technician@demo.opscore.invalid', role: 'member', label: 'Field technician' },
  { key: 'VIEWER', email: 'viewer@demo.opscore.invalid', role: 'viewer', label: 'Read-only viewer' }
]);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(name + '_REQUIRED');
  return value;
}

function count(db, table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('INVALID_TABLE_NAME');
  const row = db.prepare('SELECT COUNT(*) AS count FROM ' + table).get();
  return Number(row && row.count || 0);
}

function writeJson(file, value) {
  if (!file) throw new Error('OUTPUT_FILE_REQUIRED');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function assertTarget(bootstrapConfig) {
  if (process.env.NODE_ENV !== 'development') throw new Error('DEMO_SEED_MUST_RUN_AS_ONE_TIME_PROVISIONING_TASK');
  if (process.env.OPSC_DEMO_SEED_ALLOW !== 'YES_I_CONFIRM_DEMO_ONLY') throw new Error('DEMO_SEED_EXPLICIT_CONFIRMATION_REQUIRED');
  if (required('OPSC_DEMO_SEED_PROJECT_ID') !== EXPECTED.projectId) throw new Error('DEMO_SEED_PROJECT_MISMATCH');
  if (required('OPSC_DEMO_SEED_BRANCH_ID') !== EXPECTED.branchId) throw new Error('DEMO_SEED_BRANCH_MISMATCH');
  if (required('OPSC_DEMO_SEED_DATABASE') !== EXPECTED.database) throw new Error('DEMO_SEED_DATABASE_MISMATCH');
  if (required('OPSC_DEMO_SEED_EXPECTED_HOST') !== EXPECTED.host) throw new Error('DEMO_SEED_HOST_MISMATCH');
  if (required('OPSC_DEMO_SEED_CONFIRM') !== EXPECTED.confirmation) throw new Error('DEMO_SEED_CONFIRMATION_MISMATCH');
  if (bootstrapConfig.databaseEngine !== 'postgres') throw new Error('DEMO_SEED_POSTGRES_REQUIRED');

  const parsed = new URL(bootstrapConfig.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DEMO_SEED_POSTGRES_URL_REQUIRED');
  if (parsed.hostname !== EXPECTED.host || parsed.pathname.replace(/^\//, '') !== EXPECTED.database) {
    throw new Error('DEMO_SEED_CONNECTION_IDENTITY_MISMATCH');
  }
  if (decodeURIComponent(parsed.username || '') !== 'neondb_owner') throw new Error('DEMO_SEED_OWNER_ROLE_REQUIRED');
  if (parsed.searchParams.get('sslmode') !== 'verify-full') throw new Error('DEMO_SEED_VERIFY_FULL_TLS_REQUIRED');
  if (parsed.searchParams.get('channel_binding') !== 'require') throw new Error('DEMO_SEED_CHANNEL_BINDING_REQUIRED');
}

function existingSeedState(db) {
  const counts = {
    organizations: count(db, 'organizations'),
    users: count(db, 'users'),
    memberships: count(db, 'memberships'),
    customers: count(db, 'customers'),
    sites: count(db, 'sites'),
    assets: count(db, 'assets'),
    workOrders: count(db, 'work_orders')
  };
  const fresh = Object.values(counts).every(value => value === 0);
  if (fresh) return { state: 'FRESH', counts };

  const organization = db.prepare('SELECT id,name FROM organizations WHERE name=?').get(EXPECTED.organizationName);
  const users = db.prepare('SELECT id,email FROM users WHERE email IN (?,?,?,?) ORDER BY email').all(...ACCOUNT_SPECS.map(x => x.email));
  const roleRows = organization ? db.prepare('SELECT u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.organization_id=?').all(organization.id) : [];
  const roleMap = new Map(roleRows.map(row => [row.email, row.role]));
  const rolesMatch = ACCOUNT_SPECS.every(spec => roleMap.get(spec.email) === spec.role);
  const customer = db.prepare("SELECT id,external_ref FROM customers WHERE external_ref='DEMO-CUST-001'").get();
  const site = db.prepare("SELECT id,external_ref FROM sites WHERE external_ref='DEMO-SITE-001'").get();
  const asset = db.prepare("SELECT id,external_ref FROM assets WHERE external_ref='DEMO-ASSET-001'").get();
  const workOrder = db.prepare("SELECT id,title FROM work_orders WHERE title='Inspect the synthetic demo network node'").get();

  const expectedComplete =
    counts.organizations === 1 &&
    counts.users === 4 &&
    counts.memberships === 4 &&
    counts.customers === 1 &&
    counts.sites === 1 &&
    counts.assets === 1 &&
    counts.workOrders === 1 &&
    Boolean(organization) &&
    users.length === 4 &&
    roleRows.length === 4 &&
    rolesMatch &&
    Boolean(customer) &&
    Boolean(site) &&
    Boolean(asset) &&
    Boolean(workOrder);

  if (!expectedComplete) {
    throw new Error('DEMO_SEED_PARTIAL_OR_UNEXPECTED_DATABASE_STATE:' + JSON.stringify(counts));
  }
  return {
    state: 'ALREADY_SEEDED_VERIFIED',
    counts,
    organizationId: organization.id,
    userIds: users.map(x => x.id),
    customerId: customer.id,
    siteId: site.id,
    assetId: asset.id,
    workOrderId: workOrder.id
  };
}

async function main() {
  const ownerUrl = required('OPSC_BOOTSTRAP_DATABASE_URL');
  const bootstrapConfig = resolveBootstrapConfig(config, process.env);
  assertTarget(bootstrapConfig);
  if (!/^[a-f0-9]{64}$/.test(required('OPSC_TENANT_CONTEXT_HMAC_KEY'))) throw new Error('DEMO_SEED_HMAC_KEY_INVALID');
  if (required('OPSC_TENANT_CONTEXT_KEY_ID') !== 'demo-20261125-v1') throw new Error('DEMO_SEED_HMAC_KEY_ID_MISMATCH');

  const credentialsFile = required('OPSC_DEMO_SEED_CREDENTIALS_FILE');
  const resultFile = required('OPSC_DEMO_SEED_RESULT_FILE');
  const passwords = Object.fromEntries(ACCOUNT_SPECS.map(spec => {
    const value = required('OPSC_DEMO_PASSWORD_' + spec.key);
    if (!/^[a-f0-9]{48,}$/.test(value)) throw new Error('DEMO_PASSWORD_ENTROPY_FORMAT_INVALID:' + spec.key);
    return [spec.key, value];
  }));

  if (ownerUrl !== bootstrapConfig.databaseUrl) throw new Error('DEMO_BOOTSTRAP_URL_MISMATCH');

  const opened = openDatabase(bootstrapConfig);
  const db = opened.db;
  let seededIds = null;
  try {
    if (opened.engine !== 'postgres' || !opened.postgresRuntimeWired) throw new Error('DEMO_POSTGRES_ADAPTER_NOT_WIRED');
    assertBootstrapDatabaseRole(db, opened.engine);

    const identity = db.prepare(
      "SELECT current_user AS role, current_database() AS database, current_setting('server_version') AS server_version"
    ).get();
    if (identity.role !== 'neondb_owner' || identity.database !== EXPECTED.database) {
      throw new Error('DEMO_SEED_DATABASE_IDENTITY_MISMATCH');
    }

    const expectedMigrationCount = readMigrations().length;
    const migrations = count(db, 'schema_migrations');
    if (migrations !== expectedMigrationCount) {
      throw new Error('DEMO_SEED_MIGRATION_LEDGER_INCOMPLETE:' + migrations + '/' + expectedMigrationCount);
    }

    const hmac = db.prepare(
      "SELECT key_id FROM opscore_security.context_hmac_keys WHERE key_id=? AND enabled=true AND not_before<=now() AND not_after>now()"
    ).get(required('OPSC_TENANT_CONTEXT_KEY_ID'));
    if (!hmac) throw new Error('DEMO_SEED_ACTIVE_HMAC_KEY_REQUIRED');

    const runtime = db.prepare(
      "SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='opscore_runtime'"
    ).get();
    if (!runtime || runtime.rolcanlogin !== true || runtime.rolsuper !== false || runtime.rolcreatedb !== false ||
        runtime.rolcreaterole !== false || runtime.rolbypassrls !== false) {
      throw new Error('DEMO_SEED_RUNTIME_ROLE_BOUNDARY_FAILED');
    }

    const existing = existingSeedState(db);
    if (existing.state === 'ALREADY_SEEDED_VERIFIED') {
      if (process.env.OPSC_DEMO_SEED_ROTATE_CREDENTIALS === 'YES') {
        const adminUser = db.prepare('SELECT id FROM users WHERE email=?').get(ACCOUNT_SPECS[0].email);
        if (!adminUser) throw new Error('DEMO_SEED_ADMIN_IDENTITY_MISSING_FOR_ROTATION');
        const rotator = new Store(db, bootstrapConfig);
        rotator.pg = db;
        rotator.databaseEngineResolved = opened.engine;
        rotator.postgresRuntimeWired = opened.postgresRuntimeWired;
        const rotationContext = {
          organizationId: existing.organizationId,
          userId: adminUser.id,
          role: 'owner',
          email: ACCOUNT_SPECS[0].email
        };
        db.exec('BEGIN');
        try {
          const privilegedSession = rotator._createSessionForUser(
            { id: adminUser.id, email: adminUser.email, status: 'active' },
            existing.organizationId,
            { provider: 'demo-seed-credential-rotation' }
          );
          if (!privilegedSession || !privilegedSession.sessionId || !privilegedSession.token) {
            throw new Error('DEMO_SEED_PRIVILEGED_SESSION_CREATION_FAILED');
          }
          for (const spec of ACCOUNT_SPECS) {
            const user = db.prepare('SELECT id FROM users WHERE email=?').get(spec.email);
            if (!user) throw new Error('DEMO_SEED_ACCOUNT_MISSING_FOR_ROTATION:' + spec.email);
            const reset = rotator.createPasswordReset(rotationContext, user.id);
            if (!reset || !reset.resetToken) throw new Error('DEMO_SEED_PASSWORD_RESET_TOKEN_MISSING:' + spec.key);
            const result = rotator.resetPassword(reset.resetToken, passwords[spec.key]);
            if (result?.reset !== true) throw new Error('DEMO_SEED_PASSWORD_ROTATION_POSTCONDITION_FAILED:' + spec.key);
          }
          const revoked = rotator.logout(privilegedSession.token);
          if (!revoked) throw new Error('DEMO_SEED_PRIVILEGED_SESSION_REVOCATION_FAILED');
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch (_) {}
          throw error;
        }

        writeJson(credentialsFile, {
          classification: 'SYNTHETIC_DEMO_ONLY',
          warning: 'These accounts access an isolated non-production customer demo. Never use real customer data or reuse these passwords.',
          sourceSha: process.env.GITHUB_SHA || null,
          projectId: EXPECTED.projectId,
          branchId: EXPECTED.branchId,
          database: EXPECTED.database,
          accounts: ACCOUNT_SPECS.map(spec => ({
            role: spec.role,
            label: spec.label,
            email: spec.email,
            password: passwords[spec.key]
          }))
        });
        writeJson(resultFile, {
          status: 'ROTATED_AND_VERIFIED',
          sourceSha: process.env.GITHUB_SHA || null,
          projectId: EXPECTED.projectId,
          branchId: EXPECTED.branchId,
          database: EXPECTED.database,
          counts: existing.counts,
          organizationId: existing.organizationId,
          userIds: existing.userIds,
          customerId: existing.customerId,
          siteId: existing.siteId,
          assetId: existing.assetId,
          workOrderId: existing.workOrderId,
          credentialsFileCreated: true
        });
        console.log('DEMO_SEED_STATUS=ROTATED_AND_VERIFIED');
        return;
      }

      writeJson(resultFile, {
        status: existing.state,
        sourceSha: process.env.GITHUB_SHA || null,
        projectId: EXPECTED.projectId,
        branchId: EXPECTED.branchId,
        database: EXPECTED.database,
        counts: existing.counts,
        organizationId: existing.organizationId,
        userIds: existing.userIds,
        customerId: existing.customerId,
        siteId: existing.siteId,
        assetId: existing.assetId,
        workOrderId: existing.workOrderId,
        credentialsFileCreated: false
      });
      console.log('DEMO_SEED_STATUS=ALREADY_SEEDED_VERIFIED');
      return;
    }

    const admin = ACCOUNT_SPECS[0];
    const bootstrapped = new Store(db, bootstrapConfig);
    bootstrapped.pg = db;
    bootstrapped.databaseEngineResolved = opened.engine;
    bootstrapped.postgresRuntimeWired = opened.postgresRuntimeWired;

    const { orgId, userId: adminId } = bootstrapped.bootstrap({
      orgName: EXPECTED.organizationName,
      email: admin.email,
      password: passwords.ADMIN
    });
    if (!orgId || !adminId) throw new Error('DEMO_BOOTSTRAP_DID_NOT_RETURN_IDENTITIES');

    const store = new Store(db, bootstrapConfig);
    store.pg = db;
    store.databaseEngineResolved = opened.engine;
    store.postgresRuntimeWired = opened.postgresRuntimeWired;
    const ctx = { organizationId: orgId, userId: adminId, role: 'owner', email: admin.email };
    db.setSession({ tenantId: orgId, userId: adminId, sessionId: null, accessMode: 'backoffice' });

    const userIds = { ADMIN: adminId };
    db.exec('BEGIN');
    store._txDepth = 1;
    try {
      for (const spec of ACCOUNT_SPECS.slice(1)) {
        const userId = id('usr');
        db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(
          userId, spec.email, hashPassword(passwords[spec.key]), 'active', now()
        );
        db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(
          userId, orgId, spec.role, now()
        );
        userIds[spec.key] = userId;
      }

      const customer = store.createCustomer(ctx, {
        name: 'Demo Customer — Alpha',
        email: 'contact@demo.opscore.invalid',
        phone: '+200000000000',
        externalRef: 'DEMO-CUST-001'
      });
      const site = store.createSite(ctx, {
        customerId: customer.id,
        name: 'Demo Site — Alpha',
        address: 'Synthetic demo location; not a real customer premises',
        latitude: 0.0001,
        longitude: 0.0001,
        externalRef: 'DEMO-SITE-001'
      });
      const asset = store.createAsset(ctx, {
        name: 'Demo Site Asset 001',
        assetType: 'site',
        externalRef: 'DEMO-ASSET-001',
        status: 'active',
        customerId: customer.id,
        siteId: site.id,
        installedAt: now(),
        initialEventType: 'installed',
        initialDetails: { source: 'synthetic-customer-demo', verified: true }
      });
      const workOrder = store.createWorkOrder(ctx, {
        title: 'Inspect the synthetic demo network node',
        description: 'Synthetic customer-demo work order. No real customer, address, asset, or service data.',
        status: 'open',
        priority: 'high',
        customerId: customer.id,
        siteId: site.id,
        assetId: asset.id,
        assignedTo: userIds.TECHNICIAN,
        teamName: 'Field Operations',
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
      store._txDepth = 0;
      db.exec('COMMIT');

      seededIds = {
        organizationId: orgId,
        userIds,
        customerId: customer.id,
        siteId: site.id,
        assetId: asset.id,
        workOrderId: workOrder.id
      };
    } catch (error) {
      store._txDepth = 0;
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }

    const counts = {
      organizations: count(db, 'organizations'),
      users: count(db, 'users'),
      memberships: count(db, 'memberships'),
      customers: count(db, 'customers'),
      sites: count(db, 'sites'),
      assets: count(db, 'assets'),
      workOrders: count(db, 'work_orders')
    };
    if (counts.organizations !== 1 || counts.users !== 4 || counts.memberships !== 4 ||
        counts.customers !== 1 || counts.sites !== 1 || counts.assets !== 1 || counts.workOrders !== 1) {
      throw new Error('DEMO_SEED_POSTCONDITION_FAILED:' + JSON.stringify(counts));
    }

    const credentials = {
      classification: 'SYNTHETIC_DEMO_ONLY',
      warning: 'These accounts access an isolated non-production customer demo. Never use real customer data or reuse these passwords.',
      sourceSha: process.env.GITHUB_SHA || null,
      projectId: EXPECTED.projectId,
      branchId: EXPECTED.branchId,
      database: EXPECTED.database,
      accounts: ACCOUNT_SPECS.map(spec => ({
        role: spec.role,
        label: spec.label,
        email: spec.email,
        password: passwords[spec.key]
      }))
    };
    writeJson(credentialsFile, credentials);
    writeJson(resultFile, {
      status: 'SEEDED_AND_VERIFIED',
      sourceSha: process.env.GITHUB_SHA || null,
      projectId: EXPECTED.projectId,
      branchId: EXPECTED.branchId,
      database: EXPECTED.database,
      serverVersion: identity.server_version,
      migrations: expectedMigrationCount,
      counts,
      ...seededIds,
      credentialsFileCreated: true
    });
    console.log('DEMO_SEED_STATUS=SEEDED_AND_VERIFIED');
    console.log('DEMO_SEED_COUNTS=' + JSON.stringify(counts));
  } finally {
    try { db.close(); } catch (_) {}
  }
}

main().catch(error => {
  console.error('DEMO_POSTGRES_SEED_FAILED=' + String(error && error.message || error));
  process.exitCode = 1;
});
