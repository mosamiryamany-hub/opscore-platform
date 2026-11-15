'use strict';
const { createPostgresPool, pingPostgres } = require('./adapters/postgres');
const { createSignedTenantContext } = require('./signed-tenant-context');

let pool = null;
/** Per-tenant lightweight counters for statement budgeting (process-local). */
const tenantBudget = new Map();

function enabled(config) {
  return String(config.databaseEngine || '').toLowerCase() === 'postgres' && Boolean(config.databaseUrl);
}

function getLimits(config = {}) {
  const statementTimeoutMs = Math.max(
    1000,
    Number(process.env.OPSC_PG_STATEMENT_TIMEOUT_MS || config.statementTimeoutMs || 15000)
  );
  const tenantMaxConcurrent = Math.max(
    1,
    Number(process.env.OPSC_TENANT_MAX_CONCURRENT_QUERIES || config.tenantMaxConcurrentQueries || 20)
  );
  const tenantWindowMs = Math.max(
    1000,
    Number(process.env.OPSC_TENANT_QUERY_WINDOW_MS || config.tenantQueryWindowMs || 60000)
  );
  return { statementTimeoutMs, tenantMaxConcurrent, tenantWindowMs };
}

function getPool(config) {
  if (!enabled(config)) throw new Error('POSTGRES_RUNTIME_NOT_CONFIGURED');
  if (pool) return pool;
  const limits = getLimits(config);
  pool = createPostgresPool({
    connectionString: config.databaseUrl,
    // node-pg: statement_timeout applied via connection options when supported by adapter
    max: Number(process.env.OPSC_PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.OPSC_PG_IDLE_MS || 10000),
    connectionTimeoutMillis: Number(process.env.OPSC_PG_CONNECT_TIMEOUT_MS || 5000)
  });
  // Best-effort session GUCs on connect
  pool.on && pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${Math.floor(limits.statementTimeoutMs)}`).catch(() => {});
    client.query('SET idle_in_transaction_session_timeout = 15000').catch(() => {});
  });
  return pool;
}


/**
 * Execute tenant data work on a dedicated pg Pool client with a transaction-bound
 * HMAC assertion. This is for secondary Pool consumers; the signing key never
 * leaves the application process and the client is destroyed if transaction
 * cleanup cannot be proven.
 */
async function withSignedTenantClient(pool, principal, fn) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('POSTGRES_POOL_INVALID');
  if (typeof fn !== 'function') throw new Error('POSTGRES_SIGNED_CONTEXT_CALLBACK_REQUIRED');
  const client = await pool.connect();
  let transactionOpen = false;
  let commitAttempted = false;
  let destroy = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const identityResult = await client.query(
      'SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id'
    );
    const identity = identityResult.rows && identityResult.rows[0] || {};
    const backendPid = Number(identity.backend_pid);
    const transactionId = String(identity.transaction_id || '');
    if (!Number.isSafeInteger(backendPid) || backendPid < 1 || !/^[0-9]{1,20}$/.test(transactionId)) {
      throw Object.assign(new Error('TENANT_CONTEXT_TRANSACTION_IDENTITY_INVALID'), {
        code: 'TENANT_CONTEXT_TRANSACTION_IDENTITY_INVALID'
      });
    }
    const assertion = createSignedTenantContext({ principal, backendPid, transactionId });
    await client.query(
      "SELECT set_config('app.signed_context_payload',$1,true), set_config('app.signed_context_signature',$2,true)",
      [assertion.payload, assertion.signature]
    );
    const result = await fn(client);
    commitAttempted = true;
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        destroy = true;
        error.rollbackCode = String(rollbackError && (rollbackError.code || rollbackError.message) || 'ROLLBACK_FAILED');
      }
    } else if (commitAttempted) {
      // Commit outcome is ambiguous. Never return this connection to the pool.
      destroy = true;
    }
    throw error;
  } finally {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); }
      catch (_) { destroy = true; }
    }
    try { client.release(destroy || transactionOpen); }
    catch (_) { /* the pg client may already have destroyed itself */ }
  }
}

function _budgetKey(organizationId) {
  return String(organizationId || '__global__');
}

/**
 * Tenant query throttle — process-local sliding window.
 * Throws TENANT_QUERY_BUDGET_EXCEEDED when concurrent/window limits breached.
 */
function acquireTenantQuerySlot(organizationId, config = {}) {
  const limits = getLimits(config);
  const key = _budgetKey(organizationId);
  const now = Date.now();
  let slot = tenantBudget.get(key);
  if (!slot || now - slot.windowStart > limits.tenantWindowMs) {
    slot = { windowStart: now, count: 0, inFlight: 0 };
  }
  if (slot.inFlight >= limits.tenantMaxConcurrent || slot.count >= limits.tenantMaxConcurrent * 5) {
    const err = new Error('TENANT_QUERY_BUDGET_EXCEEDED');
    err.status = 429;
    err.details = { organizationId, ...limits, inFlight: slot.inFlight, count: slot.count };
    throw err;
  }
  slot.count += 1;
  slot.inFlight += 1;
  tenantBudget.set(key, slot);
  return () => {
    const s = tenantBudget.get(key);
    if (s) {
      s.inFlight = Math.max(0, s.inFlight - 1);
      tenantBudget.set(key, s);
    }
  };
}

async function withTenantQuery(organizationId, config, fn) {
  const release = acquireTenantQuerySlot(organizationId, config);
  try {
    return await fn(getPool(config));
  } finally {
    release();
  }
}

async function status(config) {
  if (!enabled(config)) {
    return {
      configured: false,
      connected: false,
      engine: String(config.databaseEngine || 'sqlite'),
      note: 'PostgreSQL runtime is available only when DATABASE_ENGINE=postgres and DATABASE_URL is configured.',
      limits: getLimits(config)
    };
  }
  try {
    const p = getPool(config);
    const row = await pingPostgres(p);
    return {
      configured: true,
      connected: true,
      engine: 'postgres',
      database: row.database,
      serverVersion: row.server_version,
      limits: getLimits(config)
    };
  } catch (e) {
    return { configured: true, connected: false, engine: 'postgres', errorCode: e.code || e.message, limits: getLimits(config) };
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  tenantBudget.clear();
}

/**
 * Jittered exponential backoff for concurrent-update retries (OCC).
 * attempt: 0-based; returns delay ms.
 */
function jitteredBackoff(attempt, { baseMs = 25, maxMs = 2000, factor = 2 } = {}) {
  const a = Math.max(0, Number(attempt) || 0);
  const exp = Math.min(maxMs, baseMs * Math.pow(factor, a));
  const jitter = Math.floor(Math.random() * exp * 0.4);
  return Math.min(maxMs, Math.floor(exp * 0.8) + jitter);
}

async function withOptimisticRetry(fn, { maxAttempts = 4, isConflict = (e) => /CONCURRENT|DEADLOCK|40P01|40001/i.test(String(e && (e.code || e.message || e))) } = {}) {
  let last;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      if (!isConflict(e) || attempt === maxAttempts - 1) throw e;
      const delay = jitteredBackoff(attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw last;
}

module.exports = {
  enabled,
  getPool,
  status,
  close,
  getLimits,
  acquireTenantQuerySlot,
  withTenantQuery,
  withSignedTenantClient,
  jitteredBackoff,
  withOptimisticRetry
};
