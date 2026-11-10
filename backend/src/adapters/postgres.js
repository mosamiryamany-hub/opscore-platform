'use strict';
/**
 * Optional production adapter.
 * Install the buyer-approved compatible `pg` driver before using this module.
 * The adapter deliberately fails when `pg` is absent; there is no fake fallback.
 */
const DEFAULTS = Object.freeze({
  statementTimeoutMs: 5000,
  idleInTransactionSessionTimeoutMs: 3000,
  keepAliveInitialDelayMs: 10000
});
function boundedInteger(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function createPostgresPool({
  connectionString = process.env.DATABASE_URL,
  max = 10,
  statementTimeoutMs = process.env.OPSC_PG_STATEMENT_TIMEOUT_MS,
  idleInTransactionSessionTimeoutMs = process.env.OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  keepAliveInitialDelayMs = process.env.OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS
} = {}) {
  if (!connectionString)
    throw new Error('DATABASE_URL_REQUIRED');
  let Pool;
  try {
    ({Pool} = require('pg'));
  } catch {
    throw new Error('POSTGRES_DRIVER_MISSING: install pg before using the PostgreSQL adapter');
  }
  const isProduction = String(process.env.NODE_ENV || 'development').trim().toLowerCase() === 'production';
  // Production must verify both the certificate chain and the database hostname.
  // Keep the less strict "require" mode available only for non-production development
  // and isolated test environments.
  const sslMode = String(process.env.OPSC_PG_SSL_MODE || (isProduction ? 'verify-full' : 'require')).trim().toLowerCase();
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) throw new Error('POSTGRES_SSL_MODE_INVALID');
  if (isProduction && sslMode === 'disable') throw new Error('POSTGRES_TLS_REQUIRED');
  if (isProduction && sslMode !== 'verify-full') throw new Error('POSTGRES_TLS_VERIFICATION_REQUIRED');
  if (isProduction && String(process.env.OPSC_PG_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'true') throw new Error('POSTGRES_TLS_VERIFICATION_REQUIRED');
  const ssl = sslMode === 'disable' ? false : sslMode === 'verify-full' ? { rejectUnauthorized: true, ca: process.env.OPSC_PG_CA_CERT || undefined } : { rejectUnauthorized: true };
  return new Pool({
    connectionString,
    ssl,
    max: boundedInteger(max, 10, 1, 200),
    application_name: 'opscore-starter',
    statement_timeout: boundedInteger(statementTimeoutMs, DEFAULTS.statementTimeoutMs, 100, 120000),
    idle_in_transaction_session_timeout: boundedInteger(
      idleInTransactionSessionTimeoutMs,
      DEFAULTS.idleInTransactionSessionTimeoutMs,
      100,
      120000
    ),
    keepAlive: true,
    keepAliveInitialDelayMillis: boundedInteger(
      keepAliveInitialDelayMs,
      DEFAULTS.keepAliveInitialDelayMs,
      1000,
      120000
    )
  });
}
async function pingPostgres(pool) {
  const result = await pool.query("SELECT current_database() AS database, current_setting('server_version') AS server_version");
  return result.rows[0];
}

/**
 * Multi-tenant connection session hardening.
 * Sets parameterized GUC for RLS context; RESET ALL before release to pool.
 * organizationId is bound as a parameter — never string-interpolated into SQL.
 */
async function acquireTenantClient(pool, organizationId) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('POSTGRES_POOL_INVALID');
  const org = String(organizationId || '').trim();
  if (!org || org.length > 128) throw new Error('TENANT_CONTEXT_REQUIRED');
  const client = await pool.connect();
  try {
    // The canonical RLS policy contract reads app.tenant_id. Keep the two
    // application aliases synchronized for compatibility with callers that
    // inspect them, using one statement so the context cannot be half-applied.
    await client.query(
      "SELECT set_config('app.tenant_id',$1,false), set_config('app.current_tenant_id',$1,false), set_config('app.organization_id',$1,false), set_config('app.access_mode','field',false)",
      [org]
    );
    return client;
  } catch (e) {
    // Fail closed: the session may already carry a partially-applied tenant context, so the
    // connection is destroyed (pg treats a truthy release argument as "do not return to pool").
    try { client.release(true); } catch (_) { /* already released */ }
    throw e;
  }
}

/**
 * Hard-reset session before returning client to the shared pool (prevents cross-tenant session leakage).
 * Fail closed: if the session cannot be proven clean, the connection is destroyed instead of pooled.
 */
async function releaseTenantClient(client) {
  if (!client) return;
  let clean = false;
  try {
    await client.query('RESET ALL');
    clean = true;
  } catch (_) {
    try {
      await client.query("SELECT set_config('app.tenant_id', '', false), set_config('app.current_tenant_id', '', false), set_config('app.organization_id', '', false), set_config('app.user_id', '', false), set_config('app.access_mode', '', false)");
      clean = true;
    } catch (__) {
      clean = false;
    }
  }
  try {
    client.release(clean ? undefined : true);
  } catch (_) { /* already released */ }
}

/**
 * Run fn(client) with tenant session isolation and guaranteed RESET on exit.
 */
async function withTenantClient(pool, organizationId, fn) {
  const client = await acquireTenantClient(pool, organizationId);
  try {
    return await fn(client);
  } finally {
    await releaseTenantClient(client);
  }
}

module.exports = {
  createPostgresPool,
  pingPostgres,
  DEFAULTS,
  acquireTenantClient,
  releaseTenantClient,
  withTenantClient
};
