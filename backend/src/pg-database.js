'use strict';
/**
 * PostgreSQL database handle for OpsCore.
 * Provides async run/get/all/exec with $n placeholders and tenant RLS session GUCs.
 * Also exposes a limited sync-compatible Statement API used during gradual Store migration
 * via request-scoped async context (AsyncLocalStorage) — callers must be async.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const { createPostgresPool, acquireTenantClient, releaseTenantClient } = require('./adapters/postgres');
const { prepareSql, rowsToObjects } = require('./pg-sql');

const tenantAls = new AsyncLocalStorage();

class PgStatement {
  constructor(db, sql) {
    this.db = db;
    this.originalSql = sql;
    this.sql = prepareSql(sql);
  }
  async runAsync(...params) {
    return this.db.run(this.originalSql, params);
  }
  async getAsync(...params) {
    return this.db.get(this.originalSql, params);
  }
  async allAsync(...params) {
    return this.db.all(this.originalSql, params);
  }
  // Sync-looking API: only valid inside runWithTenant / runWithClient async context
  // where the underlying client is already checked out. Throws if used outside.
  run(...params) {
    return this.db._runOnActiveClient(this.sql, params, 'run');
  }
  get(...params) {
    return this.db._runOnActiveClient(this.sql, params, 'get');
  }
  all(...params) {
    return this.db._runOnActiveClient(this.sql, params, 'all');
  }
}

class PgDatabase {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = config;
    this.engine = 'postgres';
    this._closed = false;
  }

  prepare(sql) {
    return new PgStatement(this, sql);
  }

  async exec(sql) {
    const client = this._activeClient();
    if (client) {
      await client.query(prepareSql(sql));
      return;
    }
    await this.pool.query(prepareSql(sql));
  }

  async run(sql, params = []) {
    const q = prepareSql(sql);
    const client = this._activeClient();
    const res = client ? await client.query(q, params) : await this.pool.query(q, params);
    return {
      changes: res.rowCount || 0,
      lastInsertRowid: null
    };
  }

  async get(sql, params = []) {
    const q = prepareSql(sql);
    const client = this._activeClient();
    const res = client ? await client.query(q, params) : await this.pool.query(q, params);
    return res.rows[0] || undefined;
  }

  async all(sql, params = []) {
    const q = prepareSql(sql);
    const client = this._activeClient();
    const res = client ? await client.query(q, params) : await this.pool.query(q, params);
    return rowsToObjects(res.rows);
  }

  _activeClient() {
    const ctx = tenantAls.getStore();
    return ctx && ctx.client ? ctx.client : null;
  }

  _runOnActiveClient(sql, params, mode) {
    const client = this._activeClient();
    if (!client) {
      throw new Error('PG_CLIENT_REQUIRED: use withTenant() or async run/get/all outside tenant scope');
    }
    // Mark pending promise on context for async store methods to await
    const p = client.query(sql, params).then((res) => {
      if (mode === 'run') return { changes: res.rowCount || 0, lastInsertRowid: null };
      if (mode === 'get') return res.rows[0] || undefined;
      return rowsToObjects(res.rows);
    });
    const ctx = tenantAls.getStore();
    ctx.pending = ctx.pending || [];
    ctx.pending.push(p);
    // Return a thenable so `await stmt.run()` works if caller is async
    return p;
  }

  /**
   * Run fn with RLS tenant GUC set. fn may be async.
   */
  async withTenant(organizationId, fn) {
    const client = await acquireTenantClient(this.pool, organizationId);
    try {
      return await tenantAls.run({ client, pending: [] }, async () => {
        try {
          return await fn(client);
        } finally {
          const ctx = tenantAls.getStore();
          if (ctx && Array.isArray(ctx.pending) && ctx.pending.length) {
            await Promise.allSettled(ctx.pending);
          }
        }
      });
    } finally {
      await releaseTenantClient(client);
    }
  }

  async withTransaction(fn) {
    const client = this._activeClient();
    if (client) {
      await client.query('BEGIN');
      try {
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    }
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await tenantAls.run({ client: c, pending: [] }, async () => fn(c));
      await c.query('COMMIT');
      return out;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      c.release();
    }
  }

  async ping() {
    const res = await this.pool.query('SELECT current_database() AS database, version() AS server_version');
    return res.rows[0];
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    await this.pool.end();
  }
}

function openPgDatabase(config) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const pool = createPostgresPool({
    connectionString: config.databaseUrl,
    max: Number(process.env.OPSC_PG_POOL_MAX || 5)
  });
  return new PgDatabase(pool, config);
}

module.exports = {
  PgDatabase,
  PgStatement,
  openPgDatabase,
  tenantAls
};
