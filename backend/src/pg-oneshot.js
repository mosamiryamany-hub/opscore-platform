'use strict';
/** One-shot query runner: argv JSON in, JSON out. Used by sync spawnSync bridge. */
const { createPostgresPool } = require('./adapters/postgres');
const { prepareSql } = require('./pg-sql');
(async () => {
  const input = JSON.parse(process.argv[2] || '{}');
  const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const { type, sql, params } = input;
    if (type === 'ping') {
      const r = await pool.query('SELECT current_database() AS database, version() AS server_version');
      process.stdout.write(JSON.stringify({ ok: true, row: r.rows[0] }));
    } else if (type === 'exec') {
      await pool.query(prepareSql(sql || ''));
      process.stdout.write(JSON.stringify({ ok: true }));
    } else {
      const r = await pool.query(prepareSql(sql || ''), params || []);
      if (type === 'run') process.stdout.write(JSON.stringify({ ok: true, changes: r.rowCount || 0 }));
      else if (type === 'get') process.stdout.write(JSON.stringify({ ok: true, row: r.rows[0] || null }));
      else if (type === 'all') process.stdout.write(JSON.stringify({ ok: true, rows: r.rows }));
      else process.stdout.write(JSON.stringify({ ok: false, error: 'UNKNOWN_TYPE' }));
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
