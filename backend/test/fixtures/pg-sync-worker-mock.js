'use strict';

const readline = require('node:readline');
const sessions = new Map();
let sequence = 0;
let chain = Promise.resolve();

function respond(message, exitAfter) {
  process.stdout.write(JSON.stringify(message) + '\n', () => {
    if (exitAfter) process.exit(0);
  });
}
function getSession(key) {
  let session = sessions.get(key);
  if (!session) {
    session = { requestId: key, token: 'session-' + (++sequence), inTransaction: false };
    sessions.set(key, session);
  }
  return session;
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
    if (/^BEGIN\b/i.test(sql)) session.inTransaction = true;
    else if (/^(COMMIT|END)\b/i.test(sql)) session.inTransaction = false;
    else if (/^ROLLBACK\b/i.test(sql) && !/^ROLLBACK\s+TO\b/i.test(sql)) session.inTransaction = false;
    if (type === 'exec') respond({ id, ok: true });
    else if (type === 'run') respond({ id, ok: true, changes: 1 });
    else if (type === 'get') respond({
      id, ok: true,
      row: { requestId: session.requestId, sessionToken: session.token, inTransaction: session.inTransaction, sql, params: message.params || [] }
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
