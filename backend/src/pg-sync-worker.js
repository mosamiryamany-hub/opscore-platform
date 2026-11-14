'use strict';

const readline = require('node:readline');
const { createPostgresPool } = require('./adapters/postgres');
const { prepareSql } = require('./pg-sql');

const DEFAULT_REQUEST_ID = '__opscore_background__';
const sessions = new Map();
let pool = null;
let shutdownStarted = false;
let queued = Promise.resolve();

function logError(message) {
  process.stderr.write('OPSC_PG_SYNC_WORKER ' + String(message).slice(0, 500) + '\n');
}

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL_REQUIRED'), { code: 'DATABASE_URL_REQUIRED' });
  pool = createPostgresPool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.OPSC_PG_POOL_MAX || 10)
  });
  pool.on('error', (error) => logError('pool_error=' + String(error.code || error.message || error)));
  return pool;
}

async function getSession(requestId) {
  const key = String(requestId || DEFAULT_REQUEST_ID);
  let session = sessions.get(key);
  if (session) return session;
  const client = await getPool().connect();
  session = { client, inTransaction: false, transactionIdentity: null, signedContextBound: false };
  sessions.set(key, session);
  return session;
}

function updateTransactionState(session, sql) {
  const normalized = String(sql || '').trim();
  if (/^(BEGIN|START\s+TRANSACTION)\b/i.test(normalized)) {
    session.inTransaction = true;
    session.transactionIdentity = null;
    session.signedContextBound = false;
  } else if (/^(COMMIT|END)\b/i.test(normalized)
      || (/^ROLLBACK\b/i.test(normalized) && !/^ROLLBACK\s+TO\b/i.test(normalized))) {
    session.inTransaction = false;
    session.transactionIdentity = null;
    session.signedContextBound = false;
  }
}

async function releaseSession(requestId) {
  const key = String(requestId || DEFAULT_REQUEST_ID);
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);

  let destroy = false;
  if (session.inTransaction) {
    try { await session.client.query('ROLLBACK'); }
    catch (_) { destroy = true; }
    session.inTransaction = false;
    session.transactionIdentity = null;
    session.signedContextBound = false;
  }
  if (!destroy) {
    try {
      // Belt-and-suspenders: clear tenant GUCs even if a caller skipped endRequest ordering.
      await session.client.query(
        "SELECT set_config('app.tenant_id', '', false), set_config('app.user_id', '', false), set_config('app.access_mode', '', false), set_config('app.signed_context_payload', '', false), set_config('app.signed_context_signature', '', false)"
      );
      await session.client.query('RESET ALL');
    } catch (_) { destroy = true; }
  }
  try { session.client.release(destroy); }
  catch (_) { /* client may already have been destroyed by pg */ }
}

async function closeEverything() {
  for (const requestId of [...sessions.keys()]) await releaseSession(requestId);
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}

function respond(message, onWritten) {
  process.stdout.write(JSON.stringify(message) + '\n', onWritten || (() => {}));
}

async function handle(message) {
  const id = message && message.id;
  const type = String(message && message.type || '');
  const requestId = String(message && message.requestId || DEFAULT_REQUEST_ID);

  if (type === 'endRequest') {
    await releaseSession(requestId);
    return { id, ok: true };
  }

  if (type === 'shutdown') {
    if (!shutdownStarted) {
      shutdownStarted = true;
      await closeEverything();
    }
    return { id, ok: true, shutdown: true };
  }

  const session = await getSession(requestId);
  if (type === 'batch') {
    const statements = Array.isArray(message.statements) ? message.statements : [];
    if (!statements.length) return { id, ok: true, results: [] };
    const results = [];
    for (const step of statements) {
      const sqlRaw = String(step && step.sql || '');
      const params = Array.isArray(step && step.params) ? step.params : [];
      const sql = prepareSql(sqlRaw);
      if (/^\s*BEGIN\b/i.test(sqlRaw)) session.inTransaction = true;
      const result = await session.client.query(sql, params);
      updateTransactionState(session, sqlRaw);
      results.push({ rowCount: result.rowCount || 0, row: result.rows && result.rows[0] ? result.rows[0] : null, rows: result.rows || [] });
    }
    return { id, ok: true, results };
  }

  if (type === 'ping') {
    const result = await session.client.query("SELECT current_database() AS database, version() AS server_version, current_user AS role_name");
    return { id, ok: true, row: result.rows[0] };
  }

  if (type === 'transactionIdentity') {
    if (!session.inTransaction) {
      return { id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_REQUIRED', code: 'TENANT_CONTEXT_TRANSACTION_REQUIRED' };
    }
    const result = await session.client.query(
      'SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id'
    );
    const identity = {
      backendPid: Number(result.rows[0].backend_pid),
      transactionId: String(result.rows[0].transaction_id)
    };
    if (session.transactionIdentity
        && (session.transactionIdentity.backendPid !== identity.backendPid
          || session.transactionIdentity.transactionId !== identity.transactionId)) {
      return { id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_IDENTITY_CHANGED', code: 'TENANT_CONTEXT_TRANSACTION_IDENTITY_CHANGED' };
    }
    session.transactionIdentity = identity;
    return { id, ok: true, row: identity };
  }

  if (type === 'bindSignedContext') {
    const payload = String(message.signedContextPayload || '');
    const signature = String(message.signedContextSignature || '');
    if (!session.inTransaction || !session.transactionIdentity) {
      return { id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_REQUIRED', code: 'TENANT_CONTEXT_TRANSACTION_REQUIRED' };
    }
    if (session.signedContextBound) {
      return { id, ok: false, error: 'TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION', code: 'TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION' };
    }
    if (!payload || Buffer.byteLength(payload, 'utf8') > 4096 || !/^[0-9a-f]{64}$/.test(signature)) {
      return { id, ok: false, error: 'TENANT_CONTEXT_ASSERTION_INVALID', code: 'TENANT_CONTEXT_ASSERTION_INVALID' };
    }
    let claims;
    try { claims = JSON.parse(payload); }
    catch { return { id, ok: false, error: 'TENANT_CONTEXT_ASSERTION_INVALID', code: 'TENANT_CONTEXT_ASSERTION_INVALID' }; }
    if (!claims || claims.backend_pid !== session.transactionIdentity.backendPid
        || String(claims.transaction_id || '') !== session.transactionIdentity.transactionId
        || claims.purpose !== 'field_request' || claims.aud !== 'opscore-database'
        || claims.iss !== 'opscore-api') {
      return { id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_BINDING_MISMATCH', code: 'TENANT_CONTEXT_TRANSACTION_BINDING_MISMATCH' };
    }
    await session.client.query(
      "SELECT set_config('app.signed_context_payload', $1, true), set_config('app.signed_context_signature', $2, true)",
      [payload, signature]
    );
    session.signedContextBound = true;
    return { id, ok: true, bound: true };
  }

  // Bind all row-security context settings together to avoid partially applied identity context.
  if (type === 'setSession') {
    const tenantId = message.tenantId == null ? '' : String(message.tenantId);
    const userId = message.userId == null ? '' : String(message.userId);
    const accessMode = message.accessMode == null ? 'field' : String(message.accessMode);
    if (!['field', 'system', 'auth', 'backoffice'].includes(accessMode)) {
      return { id, ok: false, error: 'INVALID_ACCESS_MODE', code: 'INVALID_ACCESS_MODE' };
    }
    // Optional hard cutover: Preview/prod can require signed context for field mode.
    if (accessMode === 'field' && String(process.env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').trim().toLowerCase() === 'true') {
      return { id, ok: false, error: 'SIGNED_TENANT_CONTEXT_REQUIRED', code: 'SIGNED_TENANT_CONTEXT_REQUIRED' };
    }
    // Inside an explicit transaction: SET LOCAL (is_local=true) so context cannot outlive COMMIT/ROLLBACK.
    // Outside a transaction: session-level bind is required for multi-statement request handlers that
    // do not open a SQL transaction; releaseSession()/endRequest MUST RESET ALL (enforced below).
    const isLocal = session.inTransaction === true;
    await session.client.query(
      "SELECT set_config('app.tenant_id', $1, $4), set_config('app.user_id', $2, $4), set_config('app.access_mode', $3, $4)",
      [tenantId, userId, accessMode, isLocal]
    );
    return { id, ok: true, tenantId: tenantId || null, userId: userId || null, accessMode, isLocal };
  }

  const sql = prepareSql(message.sql || '');
  const result = await session.client.query(sql, message.params || []);
  updateTransactionState(session, message.sql || '');

  if (type === 'exec') return { id, ok: true };
  if (type === 'run') return { id, ok: true, changes: result.rowCount || 0 };
  if (type === 'get') return { id, ok: true, row: result.rows[0] || null };
  if (type === 'all') return { id, ok: true, rows: result.rows || [] };
  return { id, ok: false, error: 'UNKNOWN_TYPE', code: 'UNKNOWN_TYPE' };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  queued = queued.then(async () => {
    let message;
    try { message = JSON.parse(line); }
    catch {
      respond({ id: null, ok: false, error: 'INVALID_IPC_JSON', code: 'INVALID_IPC_JSON' });
      return;
    }
    let response;
    try { response = await handle(message); }
    catch (error) {
      response = {
        id: message && message.id,
        ok: false,
        error: String(error && error.message || error).slice(0, 1000),
        code: error && error.code ? String(error.code) : null,
        detail: error && error.detail ? String(error.detail).slice(0, 500) : null,
        constraint: error && error.constraint ? String(error.constraint).slice(0, 200) : null
      };
    }
    if (response.shutdown) {
      respond(response, () => process.exit(0));
      return;
    }
    respond(response);
  }).catch(async (error) => {
    logError(error && (error.stack || error.message) || error);
  });
});
input.on('close', () => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  queued = queued.then(async () => {
    await closeEverything();
    process.exit(0);
  }).catch(() => process.exit(1));
});
