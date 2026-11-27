'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');
const { openPgDatabaseSync, runWithRequest } = require('../src/pg-database-sync');

function requiredUrl() {
  const raw = String(process.env.OPSC_PG_TEST_URL || '').trim();
  if (!raw) throw new Error('OPSC_PG_TEST_URL_REQUIRED');
  const url = new URL(raw);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) throw new Error('OPSC_PG_TEST_URL_INVALID');
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!/test|testing|ci|disposable|scratch|acceptance/i.test(database)) {
    throw new Error('DATABASE_NAME_NOT_MARKED_AS_DISPOSABLE');
  }
  return raw;
}

async function main() {
  const pool = new Pool({ connectionString: requiredUrl(), max: 4, connectionTimeoutMillis: 5000,
    statement_timeout: 30000, idle_in_transaction_session_timeout: 15000,
    application_name: 'opscore-twin-concurrency-postgis-gate' });
  const schema = 'opscore_twin_geo_' + crypto.randomBytes(6).toString('hex');
  const qSchema = '"' + schema + '"';
  let created = false;
  const evidence = { schemaVersion: 'opscore.twin-concurrency-postgis-gate.v1',
    productionCertification: false, database: null, checks: [] };
  try {
    const client = await pool.connect();
    try {
      const info = (await client.query("SELECT current_database() AS database, current_setting('server_version') AS server_version")).rows[0];
      evidence.database = info.database;
      evidence.serverVersion = info.server_version;
      const extension = await client.query("SELECT extversion FROM pg_extension WHERE extname='postgis'");
      if (!extension.rowCount) throw new Error('POSTGIS_EXTENSION_NOT_INSTALLED');
      evidence.postgisVersion = extension.rows[0].extversion;
      await client.query('CREATE SCHEMA ' + qSchema);
      created = true;
      await client.query('CREATE TABLE ' + qSchema + '.chain_events (id text PRIMARY KEY, organization_id text NOT NULL, sequence_no bigint NOT NULL, event_hash text NOT NULL, UNIQUE (organization_id, sequence_no))');
      await client.query('CREATE TABLE ' + qSchema + '.spatial_points (id bigint PRIMARY KEY, organization_id text NOT NULL, geom geometry(Point,4326) NOT NULL)');
      evidence.checks.push({ id: 'postgis-extension', status: 'PASS', version: evidence.postgisVersion });
    } finally { client.release(); }

    // Two independent PostgreSQL sessions race for the same tenant sequence.
    // The unique constraint must serialize the conflict: exactly one commit wins.
    const gate = { ready: 0, release: null };
    gate.promise = new Promise(resolve => { gate.release = resolve; });
    const contenders = ['writer-a', 'writer-b'].map(async id => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        gate.ready += 1;
        if (gate.ready === 2) gate.release();
        await gate.promise;
        await c.query('INSERT INTO ' + qSchema + '.chain_events(id,organization_id,sequence_no,event_hash) VALUES($1,$2,$3,$4)',
          [id, 'tenant-concurrency-fixture', 1, crypto.createHash('sha256').update(id).digest('hex')]);
        await c.query('COMMIT');
        return { id, status: 'COMMITTED' };
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return { id, status: 'UNIQUE_CONFLICT' };
        throw error;
      } finally { c.release(); }
    });
    const results = await Promise.all(contenders);
    const committed = results.filter(x => x.status === 'COMMITTED').length;
    const conflicts = results.filter(x => x.status === 'UNIQUE_CONFLICT').length;
    if (committed !== 1 || conflicts !== 1) throw new Error('TWIN_SEQUENCE_CONCURRENCY_INVARIANT_FAILED');
    const persisted = await pool.query('SELECT count(*)::int AS count, min(sequence_no)::int AS sequence FROM ' + qSchema + '.chain_events');
    if (persisted.rows[0].count !== 1 || persisted.rows[0].sequence !== 1) throw new Error('TWIN_SEQUENCE_PERSISTENCE_INVARIANT_FAILED');
    evidence.checks.push({ id: 'concurrent-sequence-uniqueness', status: 'PASS', writers: 2, committed, uniqueConflicts: conflicts });

    // Exercise the exact synchronous PostgreSQL adapter used by Store and
    // platform-intelligence-layer.js. This remains isolated in session-local
    // TEMP tables on the disposable CI database; no application or customer rows.
    const appDb = openPgDatabaseSync(requiredUrl(), { max: 1 });
    try {
      runWithRequest(() => {
        appDb.exec('CREATE TEMP TABLE twin_gate_app_snapshots (id text PRIMARY KEY, tenant_id text NOT NULL, state_hash text NOT NULL) ON COMMIT PRESERVE ROWS');
        appDb.exec('CREATE TEMP TABLE twin_gate_app_events (id text PRIMARY KEY, tenant_id text NOT NULL, sequence_no bigint NOT NULL, snapshot_id text NOT NULL, previous_hash text NOT NULL, event_hash text NOT NULL, UNIQUE (tenant_id, sequence_no), UNIQUE (tenant_id, snapshot_id)) ON COMMIT PRESERVE ROWS');
        const tenant = 'tenant-app-adapter-fixture';
        const firstHash = crypto.createHash('sha256').update('snapshot-one').digest('hex');
        appDb.exec('BEGIN IMMEDIATE');
        appDb.prepare('INSERT INTO twin_gate_app_snapshots(id,tenant_id,state_hash) VALUES(?,?,?)').run('snapshot-one', tenant, firstHash);
        appDb.prepare('INSERT INTO twin_gate_app_events(id,tenant_id,sequence_no,snapshot_id,previous_hash,event_hash) VALUES(?,?,?,?,?,?)').run('event-one', tenant, 1, 'snapshot-one', 'GENESIS', firstHash);
        appDb.exec('COMMIT');
        const committed = appDb.prepare('SELECT count(*)::int AS count FROM twin_gate_app_snapshots WHERE tenant_id=?').get(tenant);
        if (Number(committed.count) !== 1) throw new Error('APP_PG_ADAPTER_COMMIT_NOT_VISIBLE');
        let conflict = false;
        try {
          appDb.exec('BEGIN IMMEDIATE');
          appDb.prepare('INSERT INTO twin_gate_app_snapshots(id,tenant_id,state_hash) VALUES(?,?,?)').run('snapshot-orphan-probe', tenant, firstHash);
          appDb.prepare('INSERT INTO twin_gate_app_events(id,tenant_id,sequence_no,snapshot_id,previous_hash,event_hash) VALUES(?,?,?,?,?,?)').run('event-conflict-probe', tenant, 1, 'snapshot-orphan-probe', firstHash, firstHash);
          appDb.exec('COMMIT');
        } catch (error) {
          conflict = error.code === '23505';
          appDb.exec('ROLLBACK');
          if (!conflict) throw error;
        }
        const afterRollback = appDb.prepare('SELECT count(*)::int AS count FROM twin_gate_app_snapshots WHERE id=?').get('snapshot-orphan-probe');
        const eventCount = appDb.prepare('SELECT count(*)::int AS count FROM twin_gate_app_events WHERE tenant_id=?').get(tenant);
        if (!conflict || Number(afterRollback.count) !== 0 || Number(eventCount.count) !== 1) {
          throw new Error('APP_PG_ADAPTER_SNAPSHOT_CHAIN_ATOMICITY_FAILED');
        }
        evidence.checks.push({ id: 'application-postgres-sync-adapter-atomicity', status: 'PASS',
          adapter: 'pg-database-sync', committedSnapshots: Number(committed.count),
          chainEventsAfterConflict: Number(eventCount.count), conflictingWriteRolledBackSnapshot: Number(afterRollback.count) === 0 });
      });
    } finally { appDb.close(); }

    // Build deterministic, disposable spatial data and prove the GiST index is
    // usable for a selective bounding-box query. No production rows are touched.
    await pool.query('INSERT INTO ' + qSchema + '.spatial_points(id,organization_id,geom) SELECT n,\'tenant-spatial-fixture\',ST_SetSRID(ST_MakePoint(-179.1 + ((n - 1) % 200) * 1.8, -89.55 + (((n - 1) / 200)::int) * 0.9),4326) FROM generate_series(1,40000) AS series(n)');
    await pool.query('CREATE INDEX spatial_points_geom_gix ON ' + qSchema + '.spatial_points USING GIST(geom)');
    await pool.query('CREATE INDEX spatial_points_org_idx ON ' + qSchema + '.spatial_points(organization_id)');
    await pool.query('ANALYZE ' + qSchema + '.spatial_points');
    const check = await pool.connect();
    let plan;
    let count;
    try {
      const explained = await check.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM ' + qSchema + '.spatial_points WHERE organization_id=$1 AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)',
        ['tenant-spatial-fixture', -10, -10, 10, 10]);
      plan = explained.rows[0]['QUERY PLAN'][0].Plan;
      const counted = await check.query('SELECT count(*)::int AS count FROM ' + qSchema + '.spatial_points WHERE organization_id=$1 AND ST_Intersects(geom,ST_MakeEnvelope($2,$3,$4,$5,4326))',
        ['tenant-spatial-fixture', -10, -10, 10, 10]);
      count = counted.rows[0].count;
    } finally { check.release(); }
    const planNodes = [];
    const visitPlan = node => { if (!node || typeof node !== 'object') return; planNodes.push(node); for (const child of node.Plans || []) visitPlan(child); };
    visitPlan(plan);
    const gistUsed = planNodes.some(node => String(node['Index Name'] || '') === 'spatial_points_geom_gix');
    if (!gistUsed || count < 1) throw new Error('POSTGIS_GIST_QUERY_PLAN_OR_RESULT_INVALID');
    evidence.checks.push({ id: 'postgis-gist-bbox-query', status: 'PASS', fixtureRows: 40000,
      matchedRows: count, index: 'spatial_points_geom_gix', executionTimeMs: plan['Actual Total Time'] });
    evidence.status = 'PASS';
    process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.failureCode = error.code || error.message || 'UNKNOWN';
    process.stderr.write(JSON.stringify(evidence, null, 2) + '\n');
    process.exitCode = 1;
  } finally {
    if (created) await pool.query('DROP SCHEMA IF EXISTS ' + qSchema + ' CASCADE').catch(() => { process.exitCode = 1; });
    await pool.end();
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
