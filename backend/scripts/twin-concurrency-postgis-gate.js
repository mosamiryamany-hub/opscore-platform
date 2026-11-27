'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');
const { openPgDatabaseSync, runWithRequest } = require('../src/pg-database-sync');
const { Store } = require('../src/store');
const config = require('../src/config');

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

    // Verify the tenant boundary on the migrated application tables using
    // the least-privilege runtime identity, not the DDL owner connection.
    const rlsUrl = String(process.env.OPSC_PG_TWIN_RLS_URL || '').trim();
    if (!rlsUrl) throw new Error('OPSC_PG_TWIN_RLS_URL_REQUIRED');
    const rlsTarget = new URL(rlsUrl);
    if (!['127.0.0.1', 'localhost'].includes(rlsTarget.hostname)
        || decodeURIComponent(rlsTarget.pathname.replace(/^\//, '')) !== 'opscore_http_acceptance'
        || decodeURIComponent(rlsTarget.username) !== 'opscore_runtime') {
      throw new Error('TWIN_RLS_TARGET_NOT_RUNTIME_ACCEPTANCE_DATABASE');
    }
    const runtimePool = new Pool({ connectionString: rlsUrl, max: 1, connectionTimeoutMillis: 5000,
      statement_timeout: 15000, application_name: 'opscore-twin-rls-catalog-gate' });
    try {
      const catalog = await runtimePool.query(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                count(p.policyname) FILTER (WHERE p.policyname='opscore_tenant_isolation')::int AS tenant_policy_count,
                max(p.qual) FILTER (WHERE p.policyname='opscore_tenant_isolation') AS using_expression,
                max(p.with_check) FILTER (WHERE p.policyname='opscore_tenant_isolation') AS check_expression
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
          WHERE n.nspname='public' AND c.relname IN ('operational_twin_snapshots','operational_twin_chain_events')
          GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity ORDER BY c.relname`
      );
      const byName = new Map(catalog.rows.map(row => [row.relname, row]));
      for (const table of ['operational_twin_snapshots', 'operational_twin_chain_events']) {
        const row = byName.get(table);
        if (!row || row.relrowsecurity !== true || row.relforcerowsecurity !== true
            || Number(row.tenant_policy_count) !== 1
            || !String(row.using_expression || '').includes('opscore_current_tenant')
            || !String(row.check_expression || '').includes('opscore_current_tenant')) {
          throw new Error('TWIN_TENANT_RLS_POLICY_INVALID:' + table);
        }
      }
      evidence.checks.push({ id: 'digital-twin-snapshot-and-chain-rls-catalog', status: 'PASS',
        databaseRole: 'opscore_runtime', tables: [...byName.keys()],
        forcedRls: true, signedTenantAccessorPolicy: true });
    } finally { await runtimePool.end(); }

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

    // Exercise Store's installed Digital Twin methods themselves against PostgreSQL,
    // not a hand-written approximation of their SQL. Every table is TEMP and
    // confined to this adapter session on the disposable CI database.
    const storeDb = openPgDatabaseSync(requiredUrl(), { max: 1 });
    try {
      runWithRequest(() => {
        const tables = [
          'CREATE TEMP TABLE work_orders (id text, organization_id text, status text, priority text, due_at text, assigned_to text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE assets (id text, organization_id text, status text, asset_type text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE appointments (id text, organization_id text, status text, technician_id text, start_at text, end_at text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE operational_jobs (id text, organization_id text, status text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE invoices (id text, organization_id text, status text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE integration_outbox (id text, organization_id text, status text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE maintenance_plans (id text, organization_id text, active integer, next_due_at text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE asset_events (id text, organization_id text, event_type text, occurred_at text) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE technician_profiles (id text, organization_id text, active integer) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE operational_twin_snapshots (id text PRIMARY KEY, organization_id text NOT NULL, snapshot_kind text NOT NULL, state_json text NOT NULL, state_sha256 text NOT NULL, source_counts_json text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL) ON COMMIT PRESERVE ROWS',
          'CREATE TEMP TABLE operational_twin_chain_events (id text PRIMARY KEY, organization_id text NOT NULL, sequence_no bigint NOT NULL, event_type text NOT NULL, snapshot_id text NOT NULL, previous_hash text NOT NULL, event_json text NOT NULL, event_hash text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL, UNIQUE(organization_id, sequence_no), UNIQUE(organization_id, snapshot_id)) ON COMMIT PRESERVE ROWS'
        ];
        for (const ddl of tables) storeDb.exec(ddl);
        const tenant = 'tenant-store-method-fixture';
        storeDb.prepare("INSERT INTO work_orders(id,organization_id,status,priority,due_at,assigned_to) VALUES(?,?,?,?,?,?)")
          .run('wo-fixture', tenant, 'open', 'urgent', new Date(Date.now() - 60000).toISOString(), null);
        const store = new Store(storeDb, { ...config, storageProvider: 'local' });
        const ctx = { organizationId: tenant, userId: 'user-store-fixture', role: 'owner' };
        const snapshot = store.platformTwin(ctx, { persist: true });
        const verification = store.verifyPlatformTwinSnapshot(ctx, snapshot.snapshotId);
        const chain = store.verifyPlatformTwinChain(ctx);
        if (!snapshot.snapshotId || !verification.valid || !chain.valid
            || chain.eventCount !== 1 || Number(chain.snapshotCount) !== 1
            || snapshot.signals.overdueWorkOrders !== 1) {
          throw new Error('STORE_DIGITAL_TWIN_POSTGRES_PATH_INVALID:' + JSON.stringify({ snapshotId: snapshot.snapshotId || null, verification, chain, signals: snapshot.signals, openStatusCount: snapshot.openStatusCount }));
        }
        evidence.checks.push({ id: 'store-platform-twin-postgres-end-to-end', status: 'PASS',
          snapshotId: snapshot.snapshotId, chainEvents: chain.eventCount, chainValid: chain.valid,
          snapshotValid: verification.valid, overdueWorkOrderSignal: snapshot.signals.overdueWorkOrders });

        storeDb.exec("CREATE FUNCTION pg_temp.reject_twin_chain_append() RETURNS trigger LANGUAGE plpgsql AS $func$ BEGIN RAISE EXCEPTION 'CI_TWIN_CHAIN_APPEND_REJECTED' USING ERRCODE='23505'; END $func$");
        storeDb.exec('CREATE TRIGGER reject_twin_chain_append BEFORE INSERT ON operational_twin_chain_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_twin_chain_append()');
        let rejected = false;
        try { store.platformTwin(ctx, { persist: true }); }
        catch (error) { rejected = error.code === '23505'; if (!rejected) throw error; }
        const snapshotsAfterReject = storeDb.prepare('SELECT COUNT(*)::int AS count FROM operational_twin_snapshots WHERE organization_id=?').get(tenant);
        const eventsAfterReject = storeDb.prepare('SELECT COUNT(*)::int AS count FROM operational_twin_chain_events WHERE organization_id=?').get(tenant);
        if (!rejected || Number(snapshotsAfterReject.count) !== 1 || Number(eventsAfterReject.count) !== 1) {
          throw new Error('STORE_DIGITAL_TWIN_POSTGRES_ATOMIC_ROLLBACK_FAILED');
        }
        evidence.checks.push({ id: 'store-platform-twin-postgres-atomic-rollback', status: 'PASS',
          rejectedChainAppend: rejected, snapshotCountAfterRollback: Number(snapshotsAfterReject.count),
          chainEventCountAfterRollback: Number(eventsAfterReject.count) });
      });
    } finally { storeDb.close(); }

    // Build deterministic, disposable spatial data and prove the GiST index is
    // usable for a selective bounding-box query. No production rows are touched.
    // Scale tiers use a disposable two-tenant fixture. Each tenant owns exactly
    // half the rows; every query includes tenant scope and the same selective bbox.
    await pool.query('INSERT INTO ' + qSchema + '.spatial_points(id,organization_id,geom) SELECT n, CASE WHEN n % 2 = 0 THEN \'tenant-spatial-a\' ELSE \'tenant-spatial-b\' END, ST_SetSRID(ST_MakePoint(-179.1 + ((n - 1) % 200) * 1.8, -89.55 + (((n - 1) / 200)::int) * 0.9),4326) FROM generate_series(1,1000000) AS series(n)');
    await pool.query('CREATE INDEX spatial_points_geom_gix ON ' + qSchema + '.spatial_points USING GIST(geom)');
    await pool.query('CREATE INDEX spatial_points_org_idx ON ' + qSchema + '.spatial_points(organization_id)');
    await pool.query('ANALYZE ' + qSchema + '.spatial_points');
    const check = await pool.connect();
    const scaleEvidence = [];
    try {
      for (const tier of [40000, 250000, 1000000]) {
        const explained = await check.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM ' + qSchema + '.spatial_points WHERE id <= $6 AND organization_id=$1 AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)',
          ['tenant-spatial-a', -10, -10, 10, 10, tier]);
        const plan = explained.rows[0]['QUERY PLAN'][0].Plan;
        const counted = await check.query('SELECT count(*)::int AS count FROM ' + qSchema + '.spatial_points WHERE id <= $6 AND organization_id=$1 AND ST_Intersects(geom,ST_MakeEnvelope($2,$3,$4,$5,4326))',
          ['tenant-spatial-a', -10, -10, 10, 10, tier]);
        const foreign = await check.query('SELECT count(*)::int AS count FROM ' + qSchema + '.spatial_points WHERE id <= $6 AND organization_id=$1 AND ST_Intersects(geom,ST_MakeEnvelope($2,$3,$4,$5,4326))',
          ['tenant-spatial-b', -10, -10, 10, 10, tier]);
        const nodes = [];
        const visit = node => { if (!node || typeof node !== 'object') return; nodes.push(node); for (const child of node.Plans || []) visit(child); };
        visit(plan);
        const gistUsed = nodes.some(node => String(node['Index Name'] || '') === 'spatial_points_geom_gix');
        if (!gistUsed || counted.rows[0].count < 1 || foreign.rows[0].count < 1) {
          throw new Error('POSTGIS_GIST_SCALE_OR_TENANT_PREDICATE_INVALID:' + tier);
        }
        scaleEvidence.push({ fixtureRows: tier, totalFixtureRows: 1000000,
          matchedTenantA: counted.rows[0].count, matchedTenantB: foreign.rows[0].count,
          gistIndexUsed: gistUsed, executionTimeMs: plan['Actual Total Time'],
          sharedHitBlocks: plan['Shared Hit Blocks'] || 0, sharedReadBlocks: plan['Shared Read Blocks'] || 0 });
      }
    } finally { check.release(); }
    evidence.checks.push({ id: 'postgis-gist-multitenant-scale-tiers', status: 'PASS',
      fixtureRows: 1000000, tenants: 2, tiers: scaleEvidence,
      index: 'spatial_points_geom_gix',
      boundary: 'Disposable synthetic PostGIS fixture; not a test of a production GIS tenant table or production-scale capacity.' });
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
