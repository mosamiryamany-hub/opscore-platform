'use strict';

/**
 * Dialect-safe table existence check.
 * Under PostgreSQL a failed statement aborts the open transaction; swallowing the
 * JS error alone is insufficient. SAVEPOINT isolates the probe.
 */
function tableExists(db, tableName) {
  const name = String(tableName || '');
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false;

  const engine = String(process.env.DATABASE_ENGINE || '').toLowerCase();
  const usingPostgres = engine === 'postgres'
    || Boolean(process.env.OPSC_DATABASE_URL || process.env.DATABASE_URL);

  if (usingPostgres) {
    const sp = 'opsc_table_exists';
    try {
      if (typeof db.exec === 'function') db.exec(`SAVEPOINT ${sp}`);
      const row = db.prepare(
        "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?"
      ).get(name);
      if (typeof db.exec === 'function') db.exec(`RELEASE SAVEPOINT ${sp}`);
      return Boolean(row && (row.ok === 1 || row.ok === true || row.ok === '1'));
    } catch (_) {
      try {
        if (typeof db.exec === 'function') db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
      } catch (__) { /* ignore */ }
      return false;
    }
  }

  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

module.exports = { tableExists };
