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
        "SELECT set_config('app.tenant_id', '', false), set_config('app.user_id', '', false), set_config('app.access_mode', '', false), set_config('app.signed_context_payload', '', false), set_config('app.signed_context_signature', '', false), set_config('app.signed_context_request_id', '', false)"
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

function readApplicationConnectionTls(client) {
  const stream = client && client.connection && client.connection.stream;
  if (!stream || typeof stream.getProtocol !== 'function' || typeof stream.getCipher !== 'function') {
    return { negotiated: false, authorized: false, verified: false, protocol: null, cipher: null, bits: null };
  }
  const protocolValue = String(stream.getProtocol() || '');
  const cipherValue = stream.getCipher();
  const cipherName = cipherValue && /^[A-Za-z0-9_.-]{1,128}$/.test(String(cipherValue.name || ''))
    ? String(cipherValue.name) : null;
  const protocolAllowed = protocolValue === 'TLSv1.2' || protocolValue === 'TLSv1.3';
  const negotiated = Boolean(protocolValue);
  const authorized = stream.authorized === true;
  return {
    negotiated,
    authorized,
    verified: negotiated && authorized && protocolAllowed && Boolean(cipherName),
    protocol: /^[A-Za-z0-9.]{1,32}$/.test(protocolValue) ? protocolValue : null,
    cipher: cipherName,
    // TLSSocket.getCipher() does not expose a stable key-size field.
    bits: null
  };
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
  if (type === 'connectionTls') {
    if (session.inTransaction) {
      return { id, ok: false, code: 'APPLICATION_CONNECTION_TLS_PROBE_TRANSACTION_ACTIVE' };
    }
    const identity = await session.client.query(
      "SELECT current_database() AS database_name, current_user AS role_name, current_setting('server_version') AS server_version, pg_backend_pid() AS backend_pid"
    );
    const row = identity.rows && identity.rows[0] || {};
    const backendPid = Number(row.backend_pid);
    const tls = readApplicationConnectionTls(session.client);
    return {
      id,
      ok: true,
      report: {
        ...tls,
        backendPid: Number.isSafeInteger(backendPid) && backendPid > 0 ? backendPid : null,
        databaseName: /^[A-Za-z0-9_.-]{1,64}$/.test(String(row.database_name || '')) ? String(row.database_name) : null,
        roleName: /^[A-Za-z0-9_.-]{1,64}$/.test(String(row.role_name || '')) ? String(row.role_name) : null,
        serverVersion: /^\d{1,2}\.\d{1,2}(?:\.\d{1,3})?$/.test(String(row.server_version || '')) ? String(row.server_version) : null
      }
    };
  }
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

  if (type === 'sessionIdentity') {
    const identity = await session.client.query(
      session.inTransaction
        ? 'SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id'
        : 'SELECT pg_backend_pid() AS backend_pid'
    );
    return { id, ok: true, row: {
      backendPid: Number(identity.rows[0].backend_pid),
      transactionId: identity.rows[0].transaction_id == null ? null : String(identity.rows[0].transaction_id)
    } };
  }

  if (type === 'bindSignedSessionContext') {
    const payload = String(message.signedContextPayload || '');
    const signature = String(message.signedContextSignature || '');
    if (!payload || Buffer.byteLength(payload, 'utf8') > 4096 || !/^[0-9a-f]{64}$/.test(signature)) {
      return { id, ok: false, code: 'TENANT_CONTEXT_ASSERTION_INVALID' };
    }
    let claims;
    try { claims = JSON.parse(payload); }
    catch { return { id, ok: false, code: 'TENANT_CONTEXT_ASSERTION_INVALID' }; }
    const purposes = {
      field: claims && claims.identity_kind === 'api_key' ? 'api_key_operation' : 'field_operation',
      auth: 'auth_operation',
      system: 'system_operation',
      backoffice: 'backoffice_operation'
    };
    const requestId = String(message.requestId || '');
    const identity = await session.client.query(
      session.inTransaction
        ? 'SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id'
        : 'SELECT pg_backend_pid() AS backend_pid'
    );
    const backendPid = Number(identity.rows[0].backend_pid);
    const transactionId = identity.rows[0].transaction_id == null ? null : String(identity.rows[0].transaction_id);
    const expectedScope = transactionId === null ? 'backend_session' : 'transaction';
    if (!claims || claims.v !== '1' || claims.iss !== 'opscore-api' || claims.aud !== 'opscore-database'
        || purposes[claims.access_mode] !== claims.purpose
        || claims.request_id !== requestId || requestId !== String(message.requestId || '')
        || Number(claims.backend_pid) !== backendPid
        || claims.binding_scope !== expectedScope
        || (expectedScope === 'transaction'
          ? String(claims.transaction_id || '') !== transactionId
          : claims.transaction_id !== null)
        || (claims.access_mode === 'field'
          && (!claims.tenant_id || !claims.sub
            || (claims.identity_kind === 'session' && !claims.session_id)
            || (claims.identity_kind === 'api_key' && !claims.api_key_id)
            || !['session','api_key'].includes(claims.identity_kind)))) {
      return { id, ok: false, code: 'TENANT_CONTEXT_SESSION_BINDING_MISMATCH' };
    }
    const isLocal = session.inTransaction === true;
    await session.client.query(
      "SELECT set_config('app.signed_context_payload',$1,$4), set_config('app.signed_context_signature',$2,$4), set_config('app.signed_context_request_id',$3,$4), set_config('app.tenant_id',$5,$4), set_config('app.user_id',$6,$4), set_config('app.access_mode',$7,$4)",
      [payload, signature, requestId, isLocal, String(claims.tenant_id || ''), String(claims.sub || ''), String(claims.access_mode)]
    );
    session.signedSessionRequestId = requestId;
    return { id, ok: true, bound: true, accessMode: claims.access_mode, isLocal };
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
    // CI-only red-team probe: run after signing and before the application query,
    // within the exact same transaction. The verifier must ignore these raw GUCs.
    if (process.env.OPSC_PG_SIGNED_CONTEXT_TAMPER_TEST === 'true') {
      await session.client.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.access_mode', $3, true)",
        ['raw-guc-forged-tenant', 'raw-guc-forged-user', 'backoffice']
      );
    }
    session.signedContextBound = true;
    return { id, ok: true, bound: true };
  }

  // Bind all row-security context settings together to avoid partially applied identity context.
  if (type === 'setSession') {
    return { id, ok: false, error: 'UNSIGNED_SESSION_CONTEXT_REJECTED', code: 'UNSIGNED_SESSION_CONTEXT_REJECTED' };
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
