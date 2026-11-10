'use strict';
const { warn } = require('./observability');
const fs = require('node:fs');
const path = require('node:path');

const sensitiveBuffers = new Set();

function registerSensitiveBuffer(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('PURGE_BUFFER_INVALID');
  sensitiveBuffers.add(buf);
  return buf;
}
function unregisterSensitiveBuffer(buf) {
  if (Buffer.isBuffer(buf)) sensitiveBuffers.delete(buf);
}
function withSensitiveBuffer(buf, fn) {
  registerSensitiveBuffer(buf);
  try {
    return fn(buf);
  } finally {
    try { buf.fill(0); } catch (zeroizeError) { warn('sensitive_buffer_zeroize_failed', { error: zeroizeError }); }
    unregisterSensitiveBuffer(buf);
  }
}
function purgeSensitiveMemory() {
  let buffers = 0;
  for (const b of sensitiveBuffers) {
    try { b.fill(0); buffers++; }
    catch (zeroizeError) { warn('sensitive_buffer_purge_failed', { error: zeroizeError }); }
  }
  sensitiveBuffers.clear();
  return buffers;
}

/**
 * Strict hard purge of expired sessions, ephemeral memories, and temp/cache files.
 * Records privacy_purge_runs when available (real table).
 */
function purgeExpired(db, {
  now = new Date().toISOString(),
  repositoryPath = process.env.OPSC_REPOSITORY_PATH || './data/files',
  sessionRetentionOnly = true,
  tempMaxAgeMs = 24 * 60 * 60 * 1000,
  purgeIdempotencyKeys = false,
  idempotencyMaxAgeMs = 7 * 24 * 60 * 60 * 1000
} = {}) {
  const result = {
    schemaVersion: 'opscore.privacy-purge.v3',
    at: now,
    sessions: 0,
    ephemeralMemories: 0,
    tempFiles: 0,
    idempotencyKeys: 0,
    zeroizedBuffers: purgeSensitiveMemory()
  };
  const has = t => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
  if (has('sessions')) {
    result.sessions = db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now).changes;
  }
  if (!sessionRetentionOnly && has('agent_memories')) {
    result.ephemeralMemories = db.prepare(
      "DELETE FROM agent_memories WHERE memory_type='ephemeral' AND updated_at<=?"
    ).run(new Date(Date.now() - tempMaxAgeMs).toISOString()).changes;
  }
  if (purgeIdempotencyKeys && has('idempotency_keys')) {
    const cutoff = new Date(Date.now() - idempotencyMaxAgeMs).toISOString();
    try {
      result.idempotencyKeys = db.prepare('DELETE FROM idempotency_keys WHERE created_at<=?').run(cutoff).changes;
    } catch (_) { /* optional column shapes */ }
  }
  const root = path.resolve(repositoryPath);
  for (const sub of ['.tmp', 'tmp', 'cache', 'purgeable']) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name);
      let st;
      try { st = fs.statSync(fp); }
      catch (statError) { warn('purge_stat_failed', { path: fp, error: statError }); continue; }
      if (st.isFile() && st.mtimeMs < Date.now() - tempMaxAgeMs) {
        try { fs.unlinkSync(fp); result.tempFiles++; }
        catch (cleanupError) { warn('purge_file_failed', { path: fp, error: cleanupError }); }
      }
    }
  }
  return result;
}

function purgeExpiredForTenant(db, organizationId, opts = {}) {
  const result = purgeExpired(db, opts);
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='privacy_purge_runs'").get()) {
    try {
      const { id } = require('./security');
      db.prepare(
        'INSERT INTO privacy_purge_runs(id,organization_id,summary_json,created_at) VALUES (?,?,?,?)'
      ).run(id('purge'), organizationId, JSON.stringify(result), result.at);
    } catch (persistError) {
      warn('privacy_purge_audit_persist_failed', { organizationId, error: persistError });
    }
  }
  return { ...result, organizationId };
}

module.exports = {
  purgeExpired,
  purgeExpiredForTenant,
  registerSensitiveBuffer,
  unregisterSensitiveBuffer,
  withSensitiveBuffer,
  purgeSensitiveMemory
};
