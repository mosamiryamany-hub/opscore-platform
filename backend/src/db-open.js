'use strict';
const configModule = require('./config');
const { openPgDatabaseSync } = require('./pg-database-sync');

function resolveDatabaseUrl(cfg = configModule, env = process.env) {
  const production = String(env.NODE_ENV || cfg.nodeEnv || '').trim().toLowerCase() === 'production';
  if (production) {
    // Production must use the explicitly provisioned least-privilege runtime role.
    // DATABASE_URL may be injected by a platform integration with broader privileges;
    // it is never an acceptable fallback for a production runtime connection.
    const runtimeUrl = String(env.OPSC_DATABASE_URL || '').trim();
    if (!runtimeUrl) throw new Error('OPSC_DATABASE_URL_REQUIRED');
    return runtimeUrl;
  }

  const url = String(cfg.databaseUrl || env.OPSC_DATABASE_URL || env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  return url;
}

function resolveEngine(cfg = configModule, env = process.env) {
  const engine = String(cfg.databaseEngine || env.DATABASE_ENGINE || 'sqlite').toLowerCase();
  if (engine === 'postgres') {
    // Validate the selected connection URL at engine resolution so startup fails
    // closed before constructing a runtime pool with an unintended identity.
    resolveDatabaseUrl(cfg, env);
    return 'postgres';
  }
  return 'sqlite';
}

function openDatabase(cfg = configModule) {
  const engine = resolveEngine(cfg);
  if (engine === 'postgres') {
    const url = resolveDatabaseUrl(cfg);
    const db = openPgDatabaseSync(url, { max: Number(process.env.OPSC_PG_POOL_MAX || 4) });
    return { engine: 'postgres', db, postgresRuntimeWired: true };
  }
  // Load node:sqlite only when the SQLite engine is selected. Vercel's PostgreSQL
  // runtime must not import the experimental SQLite module at module initialization.
  const { openDb } = require('./db');
  return { engine: 'sqlite', db: openDb(cfg.sqlitePath), postgresRuntimeWired: false };
}

module.exports = { openDatabase, resolveEngine, resolveDatabaseUrl };
