'use strict';

const readline = require('node:readline');
const sessions = new Map();
let sequence = 0;
let txSequence = 7000;
let chain = Promise.resolve();

function respond(message, exitAfter) {
  process.stdout.write(JSON.stringify(message) + '\n', () => {
    if (exitAfter) process.exit(0);
  });
}
function getSession(key) {
  let session = sessions.get(key);
  if (!session) {
    session = {
      requestId: key,
      token: 'session-' + (++sequence),
      inTransaction: false,
      backendPid: 8000 + sequence,
      transactionIdentity: null,
      signedContextBound: false,
      payloadClaims: null
    };
    sessions.set(key, session);
  }
  return session;
}
function updateTransaction(session, sql) {
  const normalized = String(sql || '').trim();
  if (/^(BEGIN|START\s+TRANSACTION)\b/i.test(normalized)) {
    session.inTransaction = true;
    session.transactionIdentity = null;
    session.signedContextBound = false;
    session.payloadClaims = null;
    txSequence += 1;
  } else if (/^(COMMIT|END)\b/i.test(normalized)
      || (/^ROLLBACK\b/i.test(normalized) && !/^ROLLBACK\s+TO\b/i.test(normalized))) {
    session.inTransaction = false;
    session.transactionIdentity = null;
    session.signedContextBound = false;
    session.payloadClaims = null;
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  chain = chain.then(() => {
    const message = JSON.parse(line);
    const id = message.id;
    const type = message.type;
    const key = String(message.requestId || '__opscore_background__');
    if (type === 'endRequest') {
      sessions.delete(key);
      respond({ id, ok: true });
      return;
    }
    if (type === 'shutdown') {
      sessions.clear();
      respond({ id, ok: true, shutdown: true }, true);
      return;
    }
    const session = getSession(key);
    const sql = String(message.sql || '').trim();
    if (type === 'transactionIdentity') {
      if (!session.inTransaction) {
        respond({ id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_REQUIRED', code: 'TENANT_CONTEXT_TRANSACTION_REQUIRED' });
        return;
      }
      const identity = { backendPid: session.backendPid, transactionId: String(txSequence) };
      if (session.transactionIdentity
          && (session.transactionIdentity.backendPid !== identity.backendPid
            || session.transactionIdentity.transactionId !== identity.transactionId)) {
        respond({ id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_IDENTITY_CHANGED' });
        return;
      }
      session.transactionIdentity = identity;
      respond({ id, ok: true, row: identity });
      return;
    }
    if (type === 'bindSignedContext') {
      if (!session.inTransaction || !session.transactionIdentity || session.signedContextBound) {
        respond({ id, ok: false, error: 'TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION', code: 'TENANT_CONTEXT_ALREADY_BOUND_FOR_TRANSACTION' });
        return;
      }
      const payload = String(message.signedContextPayload || '');
      const signature = String(message.signedContextSignature || '');
      const claims = JSON.parse(payload);
      if (!/^[0-9a-f]{64}$/.test(signature)
          || claims.backend_pid !== session.transactionIdentity.backendPid
          || String(claims.transaction_id) !== session.transactionIdentity.transactionId) {
        respond({ id, ok: false, error: 'TENANT_CONTEXT_TRANSACTION_BINDING_MISMATCH', code: 'TENANT_CONTEXT_TRANSACTION_BINDING_MISMATCH' });
        return;
      }
      session.signedContextBound = true;
      session.payloadClaims = claims;
      respond({ id, ok: true, bound: true });
      return;
    }
    updateTransaction(session, sql);
    if (type === 'exec') respond({ id, ok: true });
    else if (type === 'run') respond({ id, ok: true, changes: 1 });
    else if (type === 'get') respond({
      id, ok: true,
      row: {
        requestId: session.requestId,
        sessionToken: session.token,
        inTransaction: session.inTransaction,
        signedContextBound: session.signedContextBound,
        workerHasSigningKey: Boolean(process.env.OPSC_TENANT_CONTEXT_HMAC_KEY),
        payloadClaims: session.payloadClaims,
        messageKeys: Object.keys(message),
        sql,
        params: message.params || []
      }
    });
    else if (type === 'all') respond({
      id, ok: true,
      rows: [{ requestId: session.requestId, sessionToken: session.token, inTransaction: session.inTransaction, sql, params: message.params || [] }]
    });
    else if (type === 'ping') respond({ id, ok: true, row: { database: 'mock', server_version: 'test' } });
    else respond({ id, ok: false, error: 'UNKNOWN_TYPE', code: 'UNKNOWN_TYPE' });
  });
});
input.on('close', () => process.exit(0));
