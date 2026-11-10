'use strict';
/**
 * SQL dialect helpers for SQLite → PostgreSQL statement bridging.
 * Converts positional `?` placeholders to $1..$n and normalizes a few SQLite-isms.
 */

function convertPlaceholders(sql) {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
}

function normalizeSqliteSql(sql) {
  let s = String(sql);
  // Transaction forms used by Store
  s = s.replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN');
  s = s.replace(/\bBEGIN\s+EXCLUSIVE\b/gi, 'BEGIN');
  // SQLite INSERT OR IGNORE → ON CONFLICT DO NOTHING (best-effort simple form)
  s = s.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
  // datetime('now') → now()
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'now()');
  // If INSERT OR IGNORE was used, append DO NOTHING when no ON CONFLICT present
  // (handled only when caller passes options.ignoreDuplicates)
  return s;
}

function prepareSql(sql, { ignoreDuplicates = false } = {}) {
  let s = normalizeSqliteSql(sql);
  s = convertPlaceholders(s);
  if (ignoreDuplicates && !/\bON\s+CONFLICT\b/i.test(s)) {
    s = s.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  }
  return s;
}

function rowToObject(row) {
  if (!row || typeof row !== 'object') return row;
  return row;
}

function rowsToObjects(rows) {
  return Array.isArray(rows) ? rows.map(rowToObject) : [];
}

module.exports = {
  convertPlaceholders,
  normalizeSqliteSql,
  prepareSql,
  rowToObject,
  rowsToObjects
};
