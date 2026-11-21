'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createSignedTenantContext, createSignedRlsSessionContext } = require('./signed-tenant-context');

const requestStorage = new AsyncLocalStorage();
const fallbackRequestId = '__opscore_background__';
const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const MAX_PROTOCOL_LINE_BYTES = 8 * 1024 * 1024;

let transport = null;
let transportFailure = null;
let configuredConnectionString = null;
let configuredPoolMax = null;
let nextMessageId = 0;

function resolveWorkerSslMode(env = process.env) {
  const configured = String(env.OPSC_PG_SSL_MODE || '').trim();
  if (configured) return configured;
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production' ? 'verify-full' : 'require';
}

function waitBriefly() {
  Atomics.wait(sleepCell, 0, 0, 2);
}

function makeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function transientPipeError(error) {
  return error && ['EAGAIN', 'EWOULDBLOCK', 'EINTR'].includes(error.code);
}

function failTransport(state, error) {
  if (!state.failure) state.failure = error;
  if (transport === state) transportFailure = state.failure;
  try { state.child.kill(); } catch (_) { /* already exited */ }
}

function readResponseLine(state, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const buffer = Buffer.alloc(16384);

  while (true) {
    const newline = state.readBuffer.indexOf('\n');
    if (newline >= 0) {
      const line = state.readBuffer.slice(0, newline);
      state.readBuffer = state.readBuffer.slice(newline + 1);
      return line;
    }

    if (Buffer.byteLength(state.readBuffer, 'utf8') > MAX_PROTOCOL_LINE_BYTES) {
      throw makeError('PG_SYNC_RESPONSE_TOO_LARGE', 'PostgreSQL bridge response exceeded the IPC safety limit');
    }

    if (Date.now() >= deadline) {
      throw makeError('PG_SYNC_WORKER_TIMEOUT', 'PostgreSQL worker did not respond before the configured timeout');
    }

    try {
      const count = fs.readSync(state.outputFd, buffer, 0, buffer.length, null);
      if (count === 0) throw makeError('PG_SYNC_WORKER_CLOSED', 'PostgreSQL worker closed its response channel');
      state.readBuffer += buffer.subarray(0, count).toString('utf8');
    } catch (error) {
      if (!transientPipeError(error)) throw error;
      waitBriefly();
    }
  }
}

function writeFully(fd, payload) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    try {
      const written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
      if (!written) throw makeError('PG_SYNC_PIPE_WRITE_FAILED', 'PostgreSQL bridge pipe accepted zero bytes');
      offset += written;
    } catch (error) {
      if (!transientPipeError(error)) throw error;
      waitBriefly();
    }
  }
}

function exchange(state, message) {
  if (state.failure) throw state.failure;
  if (state.child.exitCode !== null || state.child.signalCode !== null) {
    const error = makeError('PG_SYNC_WORKER_EXITED', 'PostgreSQL worker exited unexpectedly');
    failTransport(state, error);
    throw error;
  }

  const id = ++nextMessageId;
  const line = JSON.stringify({ ...message, id }) + '\n';
  const timeoutMs = Number(process.env.OPSC_PG_SYNC_TIMEOUT_MS || 30000);

  try {
    writeFully(state.inputFd, line);
    const responseLine = readResponseLine(state, timeoutMs);
    let response;
    try { response = JSON.parse(responseLine); }
    catch {
      throw makeError('PG_SYNC_WORKER_BAD_JSON', 'PostgreSQL worker returned an invalid IPC response');
    }
    if (!response || response.id !== id) {
      throw makeError('PG_SYNC_WORKER_PROTOCOL_MISMATCH', 'PostgreSQL worker response ID did not match the request');
    }
    return response;
  } catch (error) {
    failTransport(state, error);
    throw state.failure;
  }
}

function getTransport(connectionString, poolMax) {
  if (transportFailure) throw transportFailure;
  if (transport) {
    if (configuredConnectionString !== connectionString) {
      throw makeError('PG_SYNC_CONNECTION_STRING_CHANGED', 'A process cannot switch PostgreSQL connection strings after the worker has started');
    }
    return transport;
  }

  const productionWorker = path.join(__dirname, 'pg-sync-worker.js');
  const workerPath = process.env.NODE_ENV === 'test' && process.env.OPSC_PG_SYNC_WORKER_SCRIPT
    ? path.resolve(process.env.OPSC_PG_SYNC_WORKER_SCRIPT)
    : productionWorker;
  const nodePath = [
    path.join(__dirname, '..', 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules'),
    process.env.NODE_PATH || ''
  ].filter(Boolean).join(path.delimiter);

  // The PostgreSQL worker is a database transport only. Do not copy the
  // application environment wholesale: signing material and unrelated service
  // credentials must remain in the trusted parent Node process.
  const workerEnv = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '',
    ...(process.env.NODE_ENV ? { NODE_ENV: process.env.NODE_ENV } : {}),
    ...(String(process.env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').trim().toLowerCase() === 'true'
      ? { OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true' }
      : {}),
    DATABASE_URL: connectionString,
    NODE_PATH: nodePath,
    OPSC_PG_POOL_MAX: String(poolMax),
    OPSC_PG_SSL_MODE: resolveWorkerSslMode(process.env),
    OPSC_PG_SSL_REJECT_UNAUTHORIZED: process.env.OPSC_PG_SSL_REJECT_UNAUTHORIZED || 'true',
    ...(process.env.OPSC_PG_CA_CERT ? { OPSC_PG_CA_CERT: process.env.OPSC_PG_CA_CERT } : {}),
    ...(process.env.OPSC_PG_STATEMENT_TIMEOUT_MS ? { OPSC_PG_STATEMENT_TIMEOUT_MS: process.env.OPSC_PG_STATEMENT_TIMEOUT_MS } : {}),
    ...(process.env.OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS ? { OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: process.env.OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS } : {}),
    ...(process.env.OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS ? { OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS: process.env.OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS } : {}),
    ...(process.env.CI === 'true'
        && process.env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_TAMPER_TEST === 'true'
      ? { OPSC_PG_SIGNED_CONTEXT_TAMPER_TEST: 'true' }
      : {})
  };
  const child = spawn(process.execPath, [workerPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: workerEnv
  });

  if (child.stdout && typeof child.stdout.pause === 'function') child.stdout.pause();
  const inputFd = child.stdin && child.stdin._handle && child.stdin._handle.fd;
  const outputFd = child.stdout && child.stdout._handle && child.stdout._handle.fd;
  if (!Number.isInteger(inputFd) || !Number.isInteger(outputFd)) {
    try { child.kill(); } catch (_) { /* already exited */ }
    const error = makeError('PG_SYNC_IPC_UNAVAILABLE', 'Synchronous worker pipes are unavailable in this Node runtime');
    transportFailure = error;
    throw error;
  }

  const state = {
    child,
    inputFd,
    outputFd,
    readBuffer: '',
    failure: null,
    closing: false
  };
  configuredConnectionString = connectionString;
  configuredPoolMax = poolMax;
  transport = state;

  child.on('error', (error) => {
    if (!state.closing) failTransport(state, makeError('PG_SYNC_WORKER_SPAWN_FAILED', String(error.message || error)));
  });
  child.on('exit', (code, signal) => {
    if (!state.closing && transport === state) {
      failTransport(state, makeError('PG_SYNC_WORKER_EXITED', 'PostgreSQL worker exited unexpectedly (' + String(code) + '/' + String(signal) + ')'));
    }
  });

  // The request handler itself keeps the server alive. Do not let an idle
  // background helper keep CLI/test processes alive after their work is done.
  child.unref();
  try { child.stdin._handle.unref(); } catch (_) { /* already exited */ }
  try { child.stdout._handle.unref(); } catch (_) { /* already exited */ }

  return state;
}

function sendCommand(type, sql, params, requestId, options = {}) {
  const state = options.state || transport;
  if (!state) {
    if (options.optional) return null;
    throw makeError('PG_SYNC_WORKER_NOT_STARTED', 'PostgreSQL worker is not running');
  }
  const response = exchange(state, {
    type,
    sql: sql || '',
    params: params || [],
    requestId: requestId || fallbackRequestId,
    tenantId: options.tenantId,
    userId: options.userId,
    accessMode: options.accessMode,
    signedContextPayload: options.signedContextPayload,
    signedContextSignature: options.signedContextSignature
  });
  if (!response.ok) {
    const error = new Error(String(response.error || 'PG_QUERY_FAILED'));
    if (response.code) error.code = response.code;
    if (response.detail) error.detail = response.detail;
    if (response.constraint) error.constraint = response.constraint;
    throw error;
  }
  return response;
}

function endRequest(requestId) {
  if (!transport || transportFailure || transport.closing) return;
  try {
    sendCommand('endRequest', '', [], requestId, { optional: true });
  } catch (error) {
    // Cleanup failure is fail-closed for later queries but must not throw from
    // a response "finish"/"close" event and crash the server process.
    process.stderr.write('OPSC_PG_REQUEST_CLEANUP_FAILED ' + String(error.code || error.message || error) + '\n');
  }
}

function runWithRequest(fn, req, res, options = {}) {
  const current = requestStorage.getStore();
  if (current && !options.forceNew) return fn();

  const requestId = crypto.randomUUID();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (req && typeof req.removeListener === 'function') req.removeListener('aborted', finish);
    if (res && typeof res.removeListener === 'function') {
      res.removeListener('finish', finish);
      res.removeListener('close', finish);
    }
    endRequest(requestId);
  };

  if (req && typeof req.once === 'function') req.once('aborted', finish);
  if (res && typeof res.once === 'function') {
    res.once('finish', finish);
    res.once('close', finish);
  }

  try {
    const result = requestStorage.run({
      requestId,
      verifiedPrincipal: null,
      lastVerifiedTransactionId: null,
      transactionOpen: false,
      signedTransactionCount: 0,
      signedStatementCount: 0
    }, fn);
    if (result && typeof result.then === 'function') {
      return result.catch((error) => {
        finish();
        throw error;
      });
    }
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

function currentRequestId() {
  const context = requestStorage.getStore();
  return context && context.requestId ? context.requestId : fallbackRequestId;
}

function setVerifiedPrincipal(principal) {
  const context = requestStorage.getStore();
  if (!context) throw makeError('TENANT_CONTEXT_REQUEST_REQUIRED', 'A request scope is required for signed tenant context');
  if (!principal || typeof principal !== 'object') throw makeError('TENANT_CONTEXT_PRINCIPAL_REQUIRED');
  const next = {
    sessionId: String(principal.sessionId || '').trim(),
    userId: String(principal.userId || '').trim(),
    tenantId: String(principal.tenantId || '').trim()
  };
  for (const value of Object.values(next)) {
    if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw makeError('TENANT_CONTEXT_PRINCIPAL_INVALID', 'Authenticated session principal is incomplete');
    }
  }
  if (context.verifiedPrincipal) {
    const prior = context.verifiedPrincipal;
    if (prior.sessionId !== next.sessionId || prior.userId !== next.userId || prior.tenantId !== next.tenantId) {
      throw makeError('TENANT_CONTEXT_PRINCIPAL_IMMUTABLE', 'A request cannot change its authenticated session principal');
    }
    return;
  }
  context.verifiedPrincipal = Object.freeze(next);
}

function openPgDatabaseSync(connectionString, { max = Number(process.env.OPSC_PG_POOL_MAX || 10) } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const poolMax = Number.isSafeInteger(Number(max)) && Number(max) >= 1 && Number(max) <= 200 ? Number(max) : 10;


  function classifyTransactionCommand(sql) {
    const normalized = String(sql || '').trim();
    return {
      begin: /^(?:BEGIN|START\s+TRANSACTION)\b/i.test(normalized),
      end: /^(?:COMMIT|END)\b/i.test(normalized)
        || (/^ROLLBACK\b/i.test(normalized) && !/^ROLLBACK\s+TO\b/i.test(normalized)),
      savepoint: /^(?:SAVEPOINT|RELEASE\s+SAVEPOINT|ROLLBACK\s+TO\s+SAVEPOINT)\b/i.test(normalized)
    };
  }

  function hasMultipleSqlStatements(sql) {
    const source = String(sql || '');
    let quote = null;
    let dollarTag = null;
    let blockDepth = 0;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const next = source[i + 1];
      if (quote === 'single') {
        if (ch === "'" && next === "'") { i++; continue; }
        if (ch === "'") quote = null;
        continue;
      }
      if (quote === 'double') {
        if (ch === '"' && next === '"') { i++; continue; }
        if (ch === '"') quote = null;
        continue;
      }
      if (dollarTag) {
        if (source.startsWith(dollarTag, i)) {
          i += dollarTag.length - 1;
          dollarTag = null;
        }
        continue;
      }
      if (blockDepth > 0) {
        if (source.startsWith('/*', i)) { blockDepth++; i++; }
        else if (source.startsWith('*/', i)) { blockDepth--; i++; }
        continue;
      }
      if (source.startsWith('--', i)) {
        const newline = source.indexOf('\n', i + 2);
        i = newline < 0 ? source.length : newline;
        continue;
      }
      if (source.startsWith('/*', i)) { blockDepth = 1; i++; continue; }
      if (ch === "'") { quote = 'single'; continue; }
      if (ch === '"') { quote = 'double'; continue; }
      if (ch === '$') {
        const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(source.slice(i));
        if (tag) {
          dollarTag = tag[0];
          i += dollarTag.length - 1;
          continue;
        }
      }
      if (ch === ';') {
        const tail = source.slice(i + 1).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim();
        if (tail) return true;
      }
    }
    return false;
  }

  function bindVerifiedTenantContext(context, requestId, state, allowAlreadyBound) {
    if (!context || !context.verifiedPrincipal) {
      throw makeError('TENANT_CONTEXT_PRINCIPAL_REQUIRED', 'An authenticated session principal must be attached first');
    }
    const identityResponse = sendCommand('transactionIdentity', '', [], requestId, { state });
    const identity = identityResponse.row || {};
    const transactionId = String(identity.transactionId || '');
    if (!Number.isSafeInteger(Number(identity.backendPid)) || Number(identity.backendPid) < 1
        || !/^[0-9]{1,20}$/.test(transactionId)) {
      throw makeError('TENANT_CONTEXT_TRANSACTION_IDENTITY_INVALID');
    }
    if (context.lastVerifiedTransactionId === transactionId) {
      if (allowAlreadyBound) return Object.freeze({
        backendPid: Number(identity.backendPid),
        transactionId,
        alreadyBound: true
      });
      throw makeError('TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION');
    }
    const assertion = createSignedTenantContext({
      principal: context.verifiedPrincipal,
      backendPid: Number(identity.backendPid),
      transactionId
    });
    sendCommand('bindSignedContext', '', [], requestId, {
      state,
      signedContextPayload: assertion.payload,
      signedContextSignature: assertion.signature
    });
    context.lastVerifiedTransactionId = transactionId;
    context.signedTransactionCount = Number(context.signedTransactionCount || 0) + 1;
    return Object.freeze({
      backendPid: Number(identity.backendPid),
      transactionId,
      expiresAt: assertion.expiresAt,
      alreadyBound: false
    });
  }

  function sendWithVerifiedContext(type, sql, params, options = {}, customExecutor = null) {
    const requestId = currentRequestId();
    const state = options.state || getTransport(connectionString, poolMax);
    const execute = customExecutor || (() => sendCommand(type, sql, params, requestId, { ...options, state }));
    const context = requestStorage.getStore();
    if (!context || !context.verifiedPrincipal || type === 'ping') return execute();

    const control = classifyTransactionCommand(sql);
    if (control.begin) {
      const response = execute();
      context.transactionOpen = true;
      return response;
    }
    if (control.end) {
      const response = execute();
      context.transactionOpen = false;
      return response;
    }
    // Savepoint control must remain usable after a statement has put the
    // transaction into the aborted state. It does not read or write tenant rows.
    if (control.savepoint) return execute();

    if (hasMultipleSqlStatements(sql)) {
      throw makeError(
        'SIGNED_CONTEXT_MULTI_STATEMENT_UNSUPPORTED',
        'A signed request must execute one SQL statement per bridge call'
      );
    }

    if (context.transactionOpen === true) {
      bindVerifiedTenantContext(context, requestId, state, true);
      context.signedStatementCount = Number(context.signedStatementCount || 0) + 1;
      return execute();
    }

    // PostgreSQL autocommit already gives each statement its own transaction.
    // Make that boundary explicit so the assertion is bound to the same backend
    // and xid before the application statement executes.
    sendCommand('exec', 'BEGIN', [], requestId, { state });
    context.transactionOpen = true;
    try {
      bindVerifiedTenantContext(context, requestId, state, true);
      const response = execute();
      sendCommand('exec', 'COMMIT', [], requestId, { state });
      context.transactionOpen = false;
      return response;
    } catch (error) {
      if (context.transactionOpen) {
        try { sendCommand('exec', 'ROLLBACK', [], requestId, { state }); }
        catch (rollbackError) {
          error.rollbackCode = String(rollbackError && (rollbackError.code || rollbackError.message) || 'ROLLBACK_FAILED');
        }
        context.transactionOpen = false;
      }
      throw error;
    }
  }

  function call(type, sql, params) {
    const response = sendWithVerifiedContext(type, sql, params, {});
    if (type === 'run') return { changes: response.changes || 0, lastInsertRowid: null };
    if (type === 'get') return response.row == null ? undefined : response.row;
    if (type === 'all') return response.rows || [];
    if (type === 'ping') return response.row;
    return undefined;
  }

  function batch(statements) {
    const context = requestStorage.getStore();
    if (context && context.verifiedPrincipal) {
      throw makeError(
        'SIGNED_CONTEXT_BATCH_UNSUPPORTED',
        'Signed session requests must use prepared single-statement calls or an explicit bound transaction'
      );
    }
    const requestId = currentRequestId();
    const state = getTransport(connectionString, poolMax);
    const response = exchange(state, {
      type: 'batch',
      statements: Array.isArray(statements) ? statements : [],
      requestId: requestId || fallbackRequestId
    });
    if (!response || response.ok === false) {
      const err = new Error(String((response && (response.error || response.message || response.code)) || 'PG_BATCH_FAILED'));
      if (response && response.code) err.code = response.code;
      throw err;
    }
    return response.results || [];
  }

  function setSessionContext({ tenantId = '', userId = '', sessionId = '', apiKeyId = '', accessMode = 'field' } = {}) {
    const context = requestStorage.getStore();
    const requestedMode = accessMode || 'field';
    const signedContextRequired = String(process.env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').trim().toLowerCase() === 'true';
    const hasFieldPrincipal = Boolean(
      context && context.verifiedPrincipal
      || tenantId && userId && (sessionId || apiKeyId)
    );
    if (signedContextRequired && requestedMode === 'field' && !hasFieldPrincipal) {
      throw makeError('SIGNED_TENANT_CONTEXT_REQUIRED',
        'A verified request principal or a concrete persisted field session/API key is required');
    }
    if (context && context.verifiedPrincipal) {
      const principal = context.verifiedPrincipal;
      if (requestedMode !== 'field') {
        throw makeError('SIGNED_CONTEXT_PURPOSE_MISMATCH',
          'A field request assertion cannot be repurposed as auth, system, or backoffice');
      }
      const requestedTenant = tenantId == null ? '' : String(tenantId).trim();
      const requestedUser = userId == null ? '' : String(userId).trim();
      if ((requestedTenant && requestedTenant !== principal.tenantId)
          || (requestedUser && requestedUser !== principal.userId)
          || (sessionId && String(sessionId) !== principal.sessionId) || apiKeyId) {
        throw makeError('TENANT_CONTEXT_PRINCIPAL_MISMATCH',
          'A signed field request cannot be rebound to another principal');
      }
      return Object.freeze({ ok: true, signedContext: true, tenantId: principal.tenantId,
        userId: principal.userId, sessionId: principal.sessionId, accessMode: 'field' });
    }

    const requestId = currentRequestId();
    const state = getTransport(connectionString, poolMax);
    const identityResponse = exchange(state, { type: 'sessionIdentity', requestId });
    if (!identityResponse || identityResponse.ok !== true || !identityResponse.row) {
      throw makeError(identityResponse && identityResponse.code || 'TENANT_CONTEXT_SESSION_IDENTITY_FAILED');
    }
    const assertion = createSignedRlsSessionContext({
      tenantId, userId, sessionId, apiKeyId, accessMode: requestedMode,
      backendPid: identityResponse.row.backendPid,
      transactionId: identityResponse.row.transactionId,
      requestId
    });
    const response = exchange(state, {
      type: 'bindSignedSessionContext',
      requestId,
      signedContextPayload: assertion.payload,
      signedContextSignature: assertion.signature
    });
    if (!response || response.ok !== true) {
      throw makeError(response && response.code || 'SIGNED_SESSION_CONTEXT_BIND_FAILED');
    }
    return Object.freeze({
      ok: true, signedContext: true, tenantId: tenantId || null, userId: userId || null,
      sessionId: sessionId || null, accessMode: requestedMode,
      purpose: assertion.purpose, expiresAt: assertion.expiresAt
    });
  }

  function activateVerifiedTenantContext() {
    const context = requestStorage.getStore();
    const requestId = currentRequestId();
    const state = getTransport(connectionString, poolMax);
    return bindVerifiedTenantContext(context, requestId, state, false);
  }


  return {
    engine: 'postgres',
    batch,
    setTenant(organizationId) {
      return setSessionContext({
        tenantId: organizationId == null ? '' : String(organizationId),
        userId: '',
        accessMode: 'field'
      });
    },
    setAccessMode(mode) {
      return setSessionContext({ tenantId: '', userId: '', accessMode: mode || 'field' });
    },
    setSession({ tenantId = '', userId = '', sessionId = '', apiKeyId = '', accessMode = 'field' } = {}) {
      return setSessionContext({ tenantId, userId, sessionId, apiKeyId, accessMode });
    },
    setVerifiedPrincipal,
    activateVerifiedTenantContext,

    prepare(sql) {
      return {
        run: (...params) => call('run', sql, params),
        get: (...params) => call('get', sql, params),
        all: (...params) => call('all', sql, params)
      };
    },
    exec(sql) {
      const normalized = String(sql)
        .replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN')
        .replace(/\bBEGIN\s+EXCLUSIVE\b/gi, 'BEGIN');
      return call('exec', normalized, []);
    },
    ping() { return call('ping', '', []); },
    inspectConnectionTls() {
      const requestId = currentRequestId();
      const state = getTransport(connectionString, poolMax);
      const response = sendCommand('connectionTls', '', [], requestId, { state });
      // A worker refusal (e.g. APPLICATION_CONNECTION_TLS_PROBE_TRANSACTION_ACTIVE)
      // must reach the diagnostic route as a coded error, not collapse into a
      // null report that reads as an unspecified TLS failure.
      if (!response || response.ok !== true) {
        const code = response && response.code ? String(response.code) : 'APPLICATION_CONNECTION_TLS_PROBE_FAILED';
        throw makeError(code, 'application PostgreSQL worker did not return a TLS report');
      }
      return response.report || null;
    },
    close() {
      const state = transport;
      if (!state) return;
      state.closing = true;
      try {
        // Worker rolls back open transactions, resets session state, releases
        // checked-out clients, and closes the pool before acknowledging.
        sendCommand('shutdown', '', [], fallbackRequestId, { state });
      } finally {
        try { state.child.kill(); } catch (_) { /* already exited */ }
        if (transport === state) transport = null;
        transportFailure = null;
        configuredConnectionString = null;
        configuredPoolMax = null;
      }
    }
  };
}

process.on('exit', () => {
  if (transport && !transport.closing) {
    try { transport.child.kill(); } catch (_) { /* already exited */ }
  }
});

module.exports = {
  openPgDatabaseSync,
  runWithRequest,
  currentRequestId,
  setVerifiedPrincipal,
  resolveWorkerSslMode
};
