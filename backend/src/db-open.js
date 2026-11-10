'use strict';
const configModule = require('./config');
const { openPgDatabaseSync } = require('./pg-database-sync');

function resolveEngine(cfg = configModule) {
  const engine = String(cfg.databaseEngine || process.env.DATABASE_ENGINE || 'sqlite').toLowerCase();
  if (engine === 'postgres') {
    if (!cfg.databaseUrl && !process.env.OPSC_DATABASE_URL && !process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    return 'postgres';
  }
  return 'sqlite';
}

function openDatabase(cfg = configModule) {
  const engine = resolveEngine(cfg);
  if (engine === 'postgres') {
    const url = cfg.databaseUrl || process.env.OPSC_DATABASE_URL || process.env.DATABASE_URL;
    const db = openPgDatabaseSync(url, { max: Number(process.env.OPSC_PG_POOL_MAX || 4) });
    return { engine: 'postgres', db, postgresRuntimeWired: true };
  }
  // Load node:sqlite only when the SQLite engine is selected. Vercel's PostgreSQL
  // runtime must not import the experimental SQLite module at module initialization.
  const { openDb } = require('./db');
  return { engine: 'sqlite', db: openDb(cfg.sqlitePath), postgresRuntimeWired: false };
}

module.exports = { openDatabase, resolveEngine };
