'use strict';
/**
 * Optional production adapter.
 * Install the buyer-approved compatible `pg` driver before using this module.
 * The adapter deliberately fails when `pg` is absent; there is no fake fallback.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createSignedRlsSessionContext } = require('../signed-tenant-context');
const DEFAULTS = Object.freeze({
  statementTimeoutMs: 5000,
  idleInTransactionSessionTimeoutMs: 3000,
  keepAliveInitialDelayMs: 10000
});
const CONNECTION_STRING_SSL_OPTIONS = Object.freeze({
  sslrootcert: 'ca',
  sslcert: 'cert',
  sslkey: 'key'
});
const CONNECTION_STRING_SSL_MODE = 'sslmode';

function normalizePostgresConnectionString(connectionString, env = process.env) {
  let url;
  try {
    url = new URL(String(connectionString));
  } catch {
    throw new Error('POSTGRES_CONNECTION_STRING_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('POSTGRES_CONNECTION_STRING_PROTOCOL_INVALID');
  }
  const tls = {};
  for (const [parameter, property] of Object.entries(CONNECTION_STRING_SSL_OPTIONS)) {
    const filePath = url.searchParams.get(parameter);
    // libpq accepts sslrootcert=system for the OS trust store. node-pg has no
    // file in that case; leave ca unset so rejectUnauthorized uses platform CAs.
    if (parameter === 'sslrootcert' && String(filePath || '').trim().toLowerCase() === 'system') {
      url.searchParams.delete(parameter);
      continue;
    }
    if (filePath && !(parameter === 'sslrootcert' && String(env.OPSC_PG_CA_CERT || '').trim())) {
      try {
        tls[property] = fs.readFileSync(filePath);
      } catch {
        throw new Error('POSTGRES_TLS_CERTIFICATE_FILE_UNREADABLE:' + parameter);
      }
    }
    url.searchParams.delete(parameter);
  }
  url.searchParams.delete(CONNECTION_STRING_SSL_MODE);
  if (Boolean(tls.cert) !== Boolean(tls.key)) {
    throw new Error('POSTGRES_TLS_CLIENT_CERTIFICATE_KEY_PAIR_REQUIRED');
  }
  // All TLS options are passed directly to pg. node-postgres documents that
  // sslmode/sslcert/sslkey/sslrootcert in a connection URL replace the ssl object.
  // Move file-backed settings to the explicit TLS object before removing them.
  return { connectionString: url.toString(), tls };
}

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
  const normalizedConnection = normalizePostgresConnectionString(connectionString);
  const normalizedSsl = ssl === false ? false : {
    ...ssl,
    ca: process.env.OPSC_PG_CA_CERT || normalizedConnection.tls.ca || undefined,
    cert: normalizedConnection.tls.cert || undefined,
    key: normalizedConnection.tls.key || undefined
  };
  return new Pool({
    connectionString: normalizedConnection.connectionString,
    ssl: normalizedSsl,
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
async function acquireTenantClient(pool, organizationId, { userId = '', sessionId = '' } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('POSTGRES_POOL_INVALID');
  const org = String(organizationId || '').trim();
  if (!org || org.length > 128) throw new Error('TENANT_CONTEXT_REQUIRED');
  const user = String(userId || '').trim();
  const session = String(sessionId || '').trim();
  if (!user || !session) throw new Error('SIGNED_FIELD_SESSION_PRINCIPAL_REQUIRED');
  const client = await pool.connect();
  try {
    // Match the sync bridge: an authenticated field session is signed and bound to
    // this exact PostgreSQL backend. Raw aliases are compatibility metadata only.
    const identity = await client.query('SELECT pg_backend_pid() AS backend_pid');
    const requestId = crypto.randomUUID();
    const assertion = createSignedRlsSessionContext({
      tenantId: org, userId: user, sessionId: session, accessMode: 'field',
      backendPid: Number(identity.rows[0].backend_pid), transactionId: null, requestId
    });
    await client.query(
      "SELECT set_config('app.signed_context_payload',$1,false), set_config('app.signed_context_signature',$2,false), set_config('app.signed_context_request_id',$3,false), set_config('app.tenant_id',$4,false), set_config('app.current_tenant_id',$4,false), set_config('app.organization_id',$4,false), set_config('app.user_id',$5,false), set_config('app.access_mode','field',false)",
      [assertion.payload, assertion.signature, requestId, org, user]
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
  try {
    await client.query('RESET ALL');
    client.release();
  } catch (_) {
    // A failed RESET ALL means the backend's session state is unknown. Destroy
    // it rather than returning a partially-cleared connection to the pool.
    try { client.release(true); } catch (__) { /* already released */ }
  }
}

/**
 * Run fn(client) with tenant session isolation and guaranteed RESET on exit.
 */
async function withTenantClient(pool, organizationId, fn, principal = {}) {
  const client = await acquireTenantClient(pool, organizationId, principal);
  try {
    return await fn(client);
  } finally {
    await releaseTenantClient(client);
  }
}

module.exports = {
  createPostgresPool,
  normalizePostgresConnectionString,
  pingPostgres,
  DEFAULTS,
  acquireTenantClient,
  releaseTenantClient,
  withTenantClient
};
