import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import {
  decryptLocalEvidence,
  decryptLocalText,
  encryptLocalEvidence,
  encryptLocalText
} from './local-crypto';

const ENCRYPTED_PAYLOAD_MARKER = '__opscoreEncryptedPayloadV1';
let dbPromise;
let operationTail = Promise.resolve();
let activeScope = 'anonymous';

export function setLocalScope(scope) {
  activeScope = String(scope || 'anonymous');
}

export function getLocalScope() {
  return activeScope;
}

const DB_KEY_SERVICE = 'opscore-mobile-db-key.v1';
let dbKeyPromise = null;

async function ensureDatabaseKeyHex() {
  if (!dbKeyPromise) {
    dbKeyPromise = (async () => {
      let raw = await SecureStore.getItemAsync(DB_KEY_SERVICE, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      if (!raw) {
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        raw = Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
        await SecureStore.setItemAsync(DB_KEY_SERVICE, raw, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        });
      }
      if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error('LOCAL_DATABASE_KEY_FORMAT_INVALID');
      return raw;
    })().catch(error => { dbKeyPromise = null; throw error; });
  }
  return dbKeyPromise;
}

async function openKeyedDatabase() {
  const db = await SQLite.openDatabaseAsync('opscore-mobile.db');
  // SQLCipher (selected at native build time by the expo-sqlite useSQLCipher
  // plugin): the key MUST be applied before any other statement and its effect
  // is verified immediately. Fail closed when the native build lacks SQLCipher -
  // silently continuing would leave the local database plaintext.
  const keyHex = await ensureDatabaseKeyHex();
  await db.execAsync(`PRAGMA key = "x'${keyHex}'"`);
  const cipher = await db.getFirstAsync('PRAGMA cipher_version');
  if (!cipher || !cipher.cipher_version) {
    throw new Error('LOCAL_DATABASE_SQLCIPHER_UNAVAILABLE');
  }
  return db;
}

export function getDb() {
  if (!dbPromise) dbPromise = openKeyedDatabase();
  return dbPromise;
}

function withDb(operation) {
  const run = operationTail.then(async () => operation(await getDb()));
  operationTail = run.catch(() => {});
  return run;
}

function queueAad(scope, clientEventId) {
  return `${scope}|sync-payload|${clientEventId}`;
}

function missionAad(scope) {
  return `${scope}|mission-cache|v2`;
}

function errorMessage(error, fallback = 'LOCAL_OPERATION_FAILED') {
  return String(error || fallback)
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]')
    .slice(0, 256);
}

function encryptedEnvelope(record) {
  return JSON.stringify({ [ENCRYPTED_PAYLOAD_MARKER]: true, ...record });
}

function parseEncryptedEnvelope(value, expectedAad) {
  let record;
  try {
    record = JSON.parse(value);
  } catch {
    throw new Error('LOCAL_PAYLOAD_ENVELOPE_INVALID');
  }
  if (!record || record[ENCRYPTED_PAYLOAD_MARKER] !== true || record.aad !== expectedAad) {
    throw new Error('LOCAL_PAYLOAD_ENVELOPE_INVALID');
  }
  return record;
}

async function encryptPayloadText(value, aad) {
  return encryptedEnvelope(await encryptLocalText(value, aad));
}

async function decryptPayloadText(value, aad) {
  return decryptLocalText(parseEncryptedEnvelope(value, aad), aad);
}

async function migrateLegacyAttachmentEvents(db) {
  for (const table of ['sync_queue', 'sync_failed']) {
    const rows = await db.getAllAsync(`SELECT client_event_id,operation,entity_id,payload_json,created_at,attempts,last_error,scope FROM ${table} WHERE operation='attachment'`);
    for (const row of rows) {
      let payload;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }
      if (!payload || typeof payload.contentBase64 !== 'string' || !payload.contentBase64.length) continue;
      const scope = String(row.scope || 'legacy');
      const workOrderId = String(row.entity_id || '');
      if (!workOrderId) continue;
      const fileName = String(payload.fileName || 'evidence-upload.bin').slice(0, 255);
      const mediaType = String(payload.mediaType || 'application/octet-stream').slice(0, 128);
      const failedSource = table === 'sync_failed';
      const candidates = await db.getAllAsync(
        `SELECT id,scope,work_order_id,file_name,media_type,content_ciphertext,content_iv,crypto_version,aad,status
         FROM evidence_local_v3 WHERE scope=? AND work_order_id=? AND file_name=? AND media_type=?`,
        scope, workOrderId, fileName, mediaType
      );
      let duplicate = null;
      for (const candidate of candidates) {
        try {
          const existingBase64 = await decryptLocalEvidence({
            cryptoVersion: candidate.crypto_version,
            ciphertext: candidate.content_ciphertext,
            iv: candidate.content_iv,
            aad: candidate.aad
          });
          if (existingBase64 === payload.contentBase64) {
            duplicate = candidate;
            break;
          }
        } catch {
          // A nonmatching/corrupt candidate must not cause an unverified deletion of the source event.
        }
      }
      if (duplicate) {
        if (failedSource && duplicate.status !== 'committed') {
          await db.runAsync(
            "UPDATE evidence_local_v3 SET status='failed',last_error=?,updated_at=? WHERE id=? AND scope=?",
            errorMessage(row.last_error, 'SYNC_EVENT_FAILED'), new Date().toISOString(), duplicate.id, scope
          );
        } else if (!failedSource && duplicate.status === 'failed') {
          await db.runAsync(
            "UPDATE evidence_local_v3 SET status='queued',last_error=NULL,updated_at=? WHERE id=? AND scope=?",
            new Date().toISOString(), duplicate.id, scope
          );
        }
      } else {
        const id = `legacy-${String(row.client_event_id).slice(0, 180)}`;
        const aad = `${scope}|${workOrderId}|${id}`;
        const encrypted = await encryptLocalEvidence(payload.contentBase64, aad);
        await db.runAsync(
          `INSERT INTO evidence_local_v3(id,scope,work_order_id,file_name,media_type,content_ciphertext,content_iv,crypto_version,aad,status,last_error,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          id, scope, workOrderId, fileName, mediaType, encrypted.ciphertext, encrypted.iv,
          encrypted.cryptoVersion, aad, failedSource ? 'failed' : 'queued',
          failedSource ? errorMessage(row.last_error, 'SYNC_EVENT_FAILED') : null,
          row.created_at || new Date().toISOString(), new Date().toISOString()
        );
      }
      await db.runAsync(`DELETE FROM ${table} WHERE client_event_id=? AND scope=?`, row.client_event_id, scope);
    }
  }
}

async function encryptExistingLocalPayloads(db) {
  for (const table of ['sync_queue', 'sync_failed']) {
    const rows = await db.getAllAsync(`SELECT client_event_id,payload_json,scope FROM ${table}`);
    for (const row of rows) {
      const scope = String(row.scope || 'legacy');
      const aad = queueAad(scope, String(row.client_event_id));
      let parsed;
      try {
        parsed = JSON.parse(row.payload_json);
      } catch {
        parsed = null;
      }
      if (parsed?.[ENCRYPTED_PAYLOAD_MARKER] === true) {
        if (parsed.aad !== aad) throw new Error('LOCAL_PAYLOAD_SCOPE_MISMATCH');
        continue;
      }
      const encrypted = await encryptPayloadText(String(row.payload_json || '{}'), aad);
      await db.runAsync(`UPDATE ${table} SET payload_json=? WHERE client_event_id=? AND scope=?`, encrypted, row.client_event_id, scope);
    }
  }

  const cached = await db.getAllAsync('SELECT scope,payload_json FROM mission_cache_v2');
  for (const row of cached) {
    const scope = String(row.scope || 'legacy');
    let parsed;
    try {
      parsed = JSON.parse(row.payload_json);
    } catch {
      parsed = null;
    }
    if (parsed?.[ENCRYPTED_PAYLOAD_MARKER] === true) {
      if (parsed.aad !== missionAad(scope)) throw new Error('LOCAL_CACHE_SCOPE_MISMATCH');
      continue;
    }
    const encrypted = await encryptPayloadText(String(row.payload_json || 'null'), missionAad(scope));
    await db.runAsync('UPDATE mission_cache_v2 SET payload_json=? WHERE scope=?', encrypted, scope);
  }
}

export async function initDb() {
  return withDb(async db => {
    await db.execAsync(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS local_scope (id INTEGER PRIMARY KEY CHECK(id=1), scope TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_queue (
        client_event_id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, next_attempt_at TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','failed')),
        scope TEXT NOT NULL DEFAULT 'legacy'
      );
      CREATE TABLE IF NOT EXISTS sync_failed (
        client_event_id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL, failed_at TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'legacy'
      );
      CREATE TABLE IF NOT EXISTS mission_cache_v2 (scope TEXT PRIMARY KEY NOT NULL, payload_json TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence_local_v3 (
        id TEXT NOT NULL, scope TEXT NOT NULL, work_order_id TEXT NOT NULL, file_name TEXT NOT NULL,
        media_type TEXT NOT NULL, content_ciphertext TEXT NOT NULL, content_iv TEXT NOT NULL,
        crypto_version TEXT NOT NULL, aad TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('local','queued','committed','failed')),
        last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(scope,id)
      );`);

    // Never reinterpret old, unscoped mutations as belonging to whichever user signs in next.
    for (const table of ['sync_queue', 'sync_failed']) {
      const columns = await db.getAllAsync(`PRAGMA table_info(${table})`);
      if (columns.length && !columns.some(column => column.name === 'scope')) {
        await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
      }
    }
    await db.execAsync(`CREATE TABLE IF NOT EXISTS sync_queue (
      client_event_id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, next_attempt_at TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','failed')),
      scope TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_failed (
      client_event_id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL, failed_at TEXT NOT NULL, scope TEXT NOT NULL
    );
    DROP TABLE IF EXISTS mission_cache;`);

    let legacyEvidence = [];
    try {
      legacyEvidence = await db.getAllAsync(`SELECT id,scope,work_order_id,file_name,media_type,content_base64,status,last_error,created_at,updated_at FROM evidence_local_v2`);
    } catch (error) {
      if (!/no such table|does not exist/i.test(String(error?.message || error))) throw error;
    }
    for (const row of legacyEvidence) {
      const scope = String(row.scope || 'legacy');
      const aad = `${scope}|${row.work_order_id}|${row.id}`;
      const encrypted = await encryptLocalEvidence(row.content_base64, aad);
      await db.runAsync(
        `INSERT OR REPLACE INTO evidence_local_v3(id,scope,work_order_id,file_name,media_type,content_ciphertext,content_iv,crypto_version,aad,status,last_error,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        row.id, scope, row.work_order_id, row.file_name, row.media_type, encrypted.ciphertext, encrypted.iv,
        encrypted.cryptoVersion, aad, row.status, row.last_error ?? null, row.created_at, row.updated_at
      );
    }
    await db.execAsync('DROP TABLE IF EXISTS evidence_local_v2; DROP TABLE IF EXISTS evidence_local;');

    // Move legacy attachment bodies into the encrypted evidence store before encrypting remaining queue rows.
    await migrateLegacyAttachmentEvents(db);
    await encryptExistingLocalPayloads(db);
  });
}

export async function clearLocalData() {
  return withDb(async db => db.execAsync('DELETE FROM sync_queue; DELETE FROM sync_failed; DELETE FROM mission_cache_v2; DELETE FROM evidence_local_v3;'));
}

export async function enqueue(event) {
  const scope = activeScope;
  const eventId = String(event.clientEventId || '');
  if (!eventId || !String(event.operation || '') || !String(event.entityId || '')) throw new Error('LOCAL_SYNC_EVENT_INVALID');
  const payload = JSON.stringify(event.payload || {});
  const encrypted = await encryptPayloadText(payload, queueAad(scope, eventId));
  return withDb(async db => db.runAsync(
    "INSERT OR IGNORE INTO sync_queue(client_event_id,operation,entity_id,payload_json,created_at,attempts,last_error,status,scope) VALUES(?,?,?,?,?,0,NULL,'pending',?)",
    eventId, String(event.operation), String(event.entityId), encrypted,
    String(event.createdAt || new Date().toISOString()), scope
  ));
}

async function readPendingRows(scope, includeBackoff) {
  return withDb(async db => {
    const rows = includeBackoff
      ? await db.getAllAsync("SELECT * FROM sync_queue WHERE status='pending' AND scope=? ORDER BY created_at LIMIT 100", scope)
      : await db.getAllAsync("SELECT * FROM sync_queue WHERE status='pending' AND scope=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 100", scope, new Date().toISOString());
    return Promise.all(rows.map(async row => ({
      ...row,
      payload_json: await decryptPayloadText(row.payload_json, queueAad(scope, row.client_event_id))
    })));
  });
}

export async function pending(scopeValue = activeScope) {
  return readPendingRows(String(scopeValue || 'anonymous'), false);
}

export async function pendingAll(scopeValue = activeScope) {
  return readPendingRows(String(scopeValue || 'anonymous'), true);
}

export async function pendingCount(scopeValue = activeScope) {
  const scope = String(scopeValue || 'anonymous');
  return withDb(async db => {
    const row = await db.getFirstAsync("SELECT COUNT(*) AS count FROM sync_queue WHERE status='pending' AND scope=?", scope);
    return Number(row?.count || 0);
  });
}

export async function remove(clientEventId, scopeValue = activeScope) {
  const scope = String(scopeValue || 'anonymous');
  return withDb(async db => db.runAsync('DELETE FROM sync_queue WHERE client_event_id=? AND scope=?', clientEventId, scope));
}

export async function markError(clientEventId, error, scopeValue = activeScope) {
  const scope = String(scopeValue || 'anonymous');
  return withDb(async db => {
    const row = await db.getFirstAsync(
      'SELECT attempts FROM sync_queue WHERE client_event_id=? AND scope=?', clientEventId, scope
    );
    if (!row) return null;
    const attempts = Number(row.attempts || 0) + 1;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, attempts - 1)));
    const nextAttempt = new Date(Date.now() + delay).toISOString();
    return db.runAsync(
      "UPDATE sync_queue SET attempts=?,last_error=?,next_attempt_at=?,status='pending' WHERE client_event_id=? AND scope=?",
      attempts, errorMessage(error, 'SYNC_EVENT_FAILED'), nextAttempt, clientEventId, scope
    );
  });
}

export async function markFailed(row, error) {
  const scope = String(row.scope || activeScope);
  return withDb(async db => {
    const stored = await db.getFirstAsync(
      'SELECT payload_json FROM sync_queue WHERE client_event_id=? AND scope=?', row.client_event_id, scope
    );
    if (!stored) return false;
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_failed(client_event_id,operation,entity_id,payload_json,created_at,attempts,last_error,failed_at,scope) VALUES(?,?,?,?,?,?,?,?,?)',
      row.client_event_id, row.operation, row.entity_id, stored.payload_json, row.created_at,
      Number(row.attempts || 0) + 1, errorMessage(error, 'SYNC_EVENT_FAILED'), new Date().toISOString(), scope
    );
    await db.runAsync('DELETE FROM sync_queue WHERE client_event_id=? AND scope=?', row.client_event_id, scope);
    return true;
  });
}

export async function failedEvents() {
  const scope = activeScope;
  return withDb(async db => db.getAllAsync('SELECT * FROM sync_failed WHERE scope=? ORDER BY failed_at DESC LIMIT 100', scope));
}

export async function retryFailed(clientEventId) {
  const scope = activeScope;
  return withDb(async db => {
    const row = await db.getFirstAsync(
      'SELECT * FROM sync_failed WHERE client_event_id=? AND scope=?', clientEventId, scope
    );
    if (!row) return false;
    // Reuse the authenticated ciphertext envelope; its AAD is stable across queue/quarantine tables.
    await db.runAsync(
      "INSERT OR REPLACE INTO sync_queue(client_event_id,operation,entity_id,payload_json,created_at,attempts,last_error,status,scope) VALUES(?,?,?,?,?,?,?,'pending',?)",
      row.client_event_id, row.operation, row.entity_id, row.payload_json, row.created_at,
      Number(row.attempts || 0), null, scope
    );
    await db.runAsync('DELETE FROM sync_failed WHERE client_event_id=? AND scope=?', clientEventId, scope);
    return true;
  });
}

export async function saveMissionCache(mission) {
  const scope = activeScope;
  const encrypted = await encryptPayloadText(JSON.stringify(mission), missionAad(scope));
  return withDb(async db => db.runAsync(
    'INSERT OR REPLACE INTO mission_cache_v2(scope,payload_json,saved_at) VALUES(?,?,?)',
    scope, encrypted, new Date().toISOString()
  ));
}

export async function getMissionCache() {
  const scope = activeScope;
  return withDb(async db => {
    const row = await db.getFirstAsync('SELECT payload_json FROM mission_cache_v2 WHERE scope=?', scope);
    if (!row) return null;
    const plaintext = await decryptPayloadText(row.payload_json, missionAad(scope));
    return JSON.parse(plaintext);
  });
}

export async function evidenceEnqueue({ id, workOrderId, fileName, mediaType, contentBase64 }) {
  const scope = activeScope;
  const itemId = String(id || '');
  const woId = String(workOrderId || '');
  if (!itemId || !woId || typeof contentBase64 !== 'string' || !contentBase64.length) {
    throw new Error('LOCAL_EVIDENCE_INPUT_INVALID');
  }
  const aad = `${scope}|${woId}|${itemId}`;
  const encrypted = await encryptLocalEvidence(contentBase64, aad);
  const timestamp = new Date().toISOString();
  return withDb(async db => db.runAsync(
    `INSERT INTO evidence_local_v3(id,scope,work_order_id,file_name,media_type,content_ciphertext,content_iv,crypto_version,aad,status,last_error,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,'local',NULL,?,?)`,
    itemId, scope, woId, String(fileName || 'evidence-upload.bin').slice(0, 255),
    String(mediaType || 'application/octet-stream').slice(0, 128), encrypted.ciphertext, encrypted.iv,
    encrypted.cryptoVersion, aad, timestamp, timestamp
  ));
}

export async function evidenceSetStatus(id, status, lastError = null, scopeValue = activeScope) {
  const scope = String(scopeValue || 'anonymous');
  if (!['local', 'queued', 'committed', 'failed'].includes(status)) throw new Error('LOCAL_EVIDENCE_STATUS_INVALID');
  return withDb(async db => db.runAsync(
    'UPDATE evidence_local_v3 SET status=?,last_error=?,updated_at=? WHERE id=? AND scope=?',
    status, lastError == null ? null : errorMessage(lastError), new Date().toISOString(), id, scope
  ));
}

export async function evidenceList(workOrderId) {
  const scope = activeScope;
  return withDb(async db => db.getAllAsync(
    'SELECT id,work_order_id,file_name,media_type,status,last_error,created_at,updated_at FROM evidence_local_v3 WHERE work_order_id=? AND scope=? ORDER BY created_at DESC LIMIT 50',
    workOrderId, scope
  ));
}

export async function evidencePending(scopeValue = activeScope) {
  const scope = String(scopeValue || 'anonymous');
  return withDb(async db => {
    const rows = await db.getAllAsync(
      "SELECT * FROM evidence_local_v3 WHERE scope=? AND status IN ('local','queued') ORDER BY created_at LIMIT 20",
      scope
    );
    return Promise.all(rows.map(async row => ({
      ...row,
      content_base64: await decryptLocalEvidence({
        cryptoVersion: row.crypto_version,
        ciphertext: row.content_ciphertext,
        iv: row.content_iv,
        aad: row.aad
      })
    })));
  });
}
