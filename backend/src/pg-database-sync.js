'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createSignedTenantContext } = require('./signed-tenant-context');

const requestStorage = new AsyncLocalStorage();
const fallbackRequestId = '__opscore_background__';
const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const MAX_PROTOCOL_LINE_BYTES = 8 * 1024 * 1024;

let transport = null;
let transportFailure = null;
let configuredConnectionString = null;
let configuredPoolMax = null;
let nextMessageId = 0;

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
    NODE_ENV: process.env.NODE_ENV || 'production',
    DATABASE_URL: connectionString,
    NODE_PATH: nodePath,
    OPSC_PG_POOL_MAX: String(poolMax),
    OPSC_PG_SSL_MODE: process.env.OPSC_PG_SSL_MODE || 'require',
    OPSC_PG_SSL_REJECT_UNAUTHORIZED: process.env.OPSC_PG_SSL_REJECT_UNAUTHORIZED || 'true',
    ...(process.env.OPSC_PG_CA_CERT ? { OPSC_PG_CA_CERT: process.env.OPSC_PG_CA_CERT } : {}),
    ...(process.env.OPSC_PG_STATEMENT_TIMEOUT_MS ? { OPSC_PG_STATEMENT_TIMEOUT_MS: process.env.OPSC_PG_STATEMENT_TIMEOUT_MS } : {}),
    ...(process.env.OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS ? { OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: process.env.OPSC_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS } : {}),
    ...(process.env.OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS ? { OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS: process.env.OPSC_PG_KEEPALIVE_INITIAL_DELAY_MS } : {})
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
      lastVerifiedTransactionId: null
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

  function call(type, sql, params) {
    const requestId = currentRequestId();
    const response = sendCommand(type, sql, params, requestId, {
      state: getTransport(connectionString, poolMax)
    });
    if (type === 'run') return { changes: response.changes || 0, lastInsertRowid: null };
    if (type === 'get') return response.row == null ? undefined : response.row;
    if (type === 'all') return response.rows || [];
    if (type === 'ping') return response.row;
    return undefined;
  }

  function batch(statements) {
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


  return {
    engine: 'postgres',
    batch,
    setTenant(organizationId) {
      const response = sendCommand('setSession', '', [], currentRequestId(), {
        state: getTransport(connectionString, poolMax),
        tenantId: organizationId == null ? '' : String(organizationId),
        accessMode: organizationId ? 'field' : 'field'
      });
      return response;
    },
    setAccessMode(mode) {
      return sendCommand('setSession', '', [], currentRequestId(), {
        state: getTransport(connectionString, poolMax),
        tenantId: '',
        accessMode: mode || 'field'
      });
    },
    setSession({ tenantId = '', userId = '', accessMode = 'field' } = {}) {
      return sendCommand('setSession', '', [], currentRequestId(), {
        state: getTransport(connectionString, poolMax),
        tenantId: tenantId == null ? '' : String(tenantId),
        userId: userId == null ? '' : String(userId),
        accessMode: accessMode || 'field'
      });
    },
    setVerifiedPrincipal,
    activateVerifiedTenantContext() {
      const context = requestStorage.getStore();
      if (!context || !context.verifiedPrincipal) {
        throw makeError('TENANT_CONTEXT_PRINCIPAL_REQUIRED', 'An authenticated session principal must be attached first');
      }
      const state = getTransport(connectionString, poolMax);
      const requestId = currentRequestId();
      const identityResponse = sendCommand('transactionIdentity', '', [], requestId, { state });
      const identity = identityResponse.row || {};
      const transactionId = String(identity.transactionId || '');
      if (!Number.isSafeInteger(Number(identity.backendPid)) || Number(identity.backendPid) < 1 || !/^[0-9]{1,20}$/.test(transactionId)) {
        throw makeError('TENANT_CONTEXT_TRANSACTION_IDENTITY_INVALID');
      }
      if (context.lastVerifiedTransactionId === transactionId) {
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
      return Object.freeze({
        backendPid: Number(identity.backendPid),
        transactionId,
        expiresAt: assertion.expiresAt
      });
    },

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
  setVerifiedPrincipal
};
