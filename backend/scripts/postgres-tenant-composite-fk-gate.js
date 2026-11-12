'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(backendRoot, 'sql', 'postgres', '054_tenant_composite_foreign_keys.sql');

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

async function main() {
  const raw = String(process.env.OPSC_MIGRATION_DATABASE_URL || process.env.OPSC_PG_TEST_URL || '').trim();
  if (!raw) throw new Error('TENANT_FK_TEST_DATABASE_URL_REQUIRED');

  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('TENANT_FK_TEST_DATABASE_PROTOCOL_INVALID');
  if (url.hostname.toLowerCase().includes('-pooler')) throw new Error('TENANT_FK_TEST_REQUIRES_DIRECT_CONNECTION');
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!/(?:test|testing|ci|acceptance|scratch|disposable)/i.test(databaseName)) {
    throw new Error('TENANT_FK_TEST_DATABASE_NOT_DISPOSABLE');
  }

  const pool = new Pool({
    connectionString: raw,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    application_name: 'opscore-tenant-composite-fk-gate'
  });

  const client = await pool.connect();
  const schema = 'opscore_tenant_fk_' + crypto.randomBytes(6).toString('hex');
  const qSchema = quoteIdentifier(schema);
  let transactionOpen = false;
  const checks = [];

  try {
    const info = (await client.query(
      "SELECT current_database() AS database, current_user AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls, current_setting('server_version') AS server_version FROM pg_roles r WHERE r.rolname = current_user"
    )).rows[0];

    if (!info || (!info.superuser && !info.bypass_rls)) {
      throw new Error('TENANT_FK_MIGRATION_TEST_REQUIRES_DISPOSABLE_SCHEMA_OWNER');
    }

    const runtime = (await client.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname='opscore_runtime'"
    )).rows[0];
    assert.ok(runtime, 'opscore_runtime role must exist in the isolated PostgreSQL service');
    assert.equal(runtime.rolsuper, false, 'runtime role must not be superuser');
    assert.equal(runtime.rolbypassrls, false, 'runtime role must not bypass RLS');
    assert.equal(runtime.rolcreaterole, false, 'runtime role must not create roles');
    assert.equal(runtime.rolcreatedb, false, 'runtime role must not create databases');

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('CREATE SCHEMA ' + qSchema);
    await client.query('SET LOCAL search_path TO ' + qSchema + ', public');

    await client.query('CREATE TABLE organizations (id text PRIMARY KEY)');
    await client.query('CREATE TABLE tenant_parents (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id))');
    await client.query("CREATE TABLE tenant_nullable_children (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), parent_id text, CONSTRAINT fk_nullable_parent FOREIGN KEY (parent_id) REFERENCES tenant_parents(id) ON DELETE SET NULL)");
    await client.query("CREATE TABLE tenant_cascade_children (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), parent_id text NOT NULL, CONSTRAINT fk_cascade_parent FOREIGN KEY (parent_id) REFERENCES tenant_parents(id) ON DELETE CASCADE)");
    await client.query("CREATE TABLE tenant_restrict_children (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), parent_id text NOT NULL, CONSTRAINT fk_restrict_parent FOREIGN KEY (parent_id) REFERENCES tenant_parents(id) ON DELETE RESTRICT)");
    await client.query("CREATE TABLE tenant_nodes (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), parent_id text, CONSTRAINT fk_node_parent FOREIGN KEY (parent_id) REFERENCES tenant_nodes(id) ON DELETE RESTRICT)");

    const migration = fs.readFileSync(migrationPath, 'utf8');
    await client.query(migration);

    const catalog = (await client.query(
      `SELECT c.conname,
              c.convalidated,
              c.confdeltype,
              pg_get_constraintdef(c.oid) AS definition,
              array_length(c.conkey, 1) AS source_key_count,
              array_length(c.confkey, 1) AS target_key_count,
              EXISTS (
                SELECT 1 FROM pg_attribute a
                WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[2]
                  AND a.attname='organization_id' AND NOT a.attisdropped
              ) AS source_org_pair,
              EXISTS (
                SELECT 1 FROM pg_attribute a
                WHERE a.attrelid=c.confrelid AND a.attnum=c.confkey[2]
                  AND a.attname='organization_id' AND NOT a.attisdropped
              ) AS target_org_pair
         FROM pg_constraint c
         WHERE c.contype='f'
           AND c.conrelid IN (
             to_regclass($1||'.tenant_nullable_children'),
             to_regclass($1||'.tenant_cascade_children'),
             to_regclass($1||'.tenant_restrict_children'),
             to_regclass($1||'.tenant_nodes')
           )
         ORDER BY c.conname`,
      [schema]
    )).rows;

    const tenantFks = catalog.filter(x => ['fk_nullable_parent','fk_cascade_parent','fk_restrict_parent','fk_node_parent'].includes(x.conname));
    assert.equal(tenantFks.length, 4, 'all fixture tenant references must exist');
    for (const fk of tenantFks) {
      assert.equal(fk.convalidated, true, fk.conname + ' must be validated');
      assert.equal(fk.source_key_count, 2, fk.conname + ' must use a two-column source key');
      assert.equal(fk.target_key_count, 2, fk.conname + ' must use a two-column target key');
      assert.equal(fk.source_org_pair, true, fk.conname + ' must pair source organization_id');
      assert.equal(fk.target_org_pair, true, fk.conname + ' must pair target organization_id');
    }
    assert.match(tenantFks.find(x => x.conname === 'fk_nullable_parent').definition, /ON DELETE SET NULL \(parent_id\)/i);
    assert.match(tenantFks.find(x => x.conname === 'fk_cascade_parent').definition, /ON DELETE CASCADE/i);
    assert.match(tenantFks.find(x => x.conname === 'fk_restrict_parent').definition, /ON DELETE RESTRICT/i);

    await client.query(
      `DO $rls$
       DECLARE table_name text;
       BEGIN
         FOREACH table_name IN ARRAY ARRAY[
           'tenant_parents','tenant_nullable_children','tenant_cascade_children','tenant_restrict_children','tenant_nodes'
         ] LOOP
           EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', current_schema(), table_name);
           EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', current_schema(), table_name);
           EXECUTE format(
             'CREATE POLICY tenant_scope ON %I.%I FOR ALL USING (organization_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (organization_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
             current_schema(), table_name
           );
         END LOOP;
       END
       $rls$`
    );

    await client.query('GRANT USAGE ON SCHEMA ' + qSchema + ' TO opscore_runtime');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ' + qSchema + ' TO opscore_runtime');

    const orgA = 'org_a_' + crypto.randomBytes(4).toString('hex');
    const orgB = 'org_b_' + crypto.randomBytes(4).toString('hex');
    const parentA = 'parent_a_' + crypto.randomBytes(4).toString('hex');
    const parentB = 'parent_b_' + crypto.randomBytes(4).toString('hex');
    await client.query('INSERT INTO organizations(id) VALUES ($1),($2)', [orgA, orgB]);
    await client.query(
      'INSERT INTO tenant_parents(id, organization_id) VALUES ($1,$2),($3,$4)',
      [parentA, orgA, parentB, orgB]
    );

    async function runtimeTenant(tenantId, action) {
      await client.query('SAVEPOINT runtime_tenant_action');
      try {
        await client.query('SET LOCAL ROLE opscore_runtime');
        await client.query('SET LOCAL search_path TO ' + qSchema + ', public');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const result = await action();
        await client.query('RESET ROLE');
        await client.query('RELEASE SAVEPOINT runtime_tenant_action');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK TO SAVEPOINT runtime_tenant_action');
          await client.query('RELEASE SAVEPOINT runtime_tenant_action');
        } catch (_) {}
        throw error;
      }
    }

    async function expectTenantSqlState(tenantId, action, expectedCode, checkName) {
      let observed = null;
      try {
        await runtimeTenant(tenantId, action);
      } catch (error) {
        observed = error;
      }
      assert.ok(observed, checkName + ' must reject the statement');
      assert.equal(observed.code, expectedCode, checkName + ' must fail for the expected PostgreSQL reason');
      return observed;
    }

    await runtimeTenant(orgA, async () => {
      await client.query(
        'INSERT INTO tenant_nullable_children(id, organization_id, parent_id) VALUES ($1,$2,$3)',
        ['child_same_tenant', orgA, parentA]
      );
    });
    checks.push({ id: 'same-tenant-reference-allowed', status: 'PASS' });

    // This attempt is performed as the schema owner (RLS bypassed) to prove the
    // composite FK itself rejects a cross-tenant pair independently of RLS.
    await client.query('SAVEPOINT before_cross_tenant_insert');
    let ownerCrossInsert = null;
    try {
      await client.query(
        'INSERT INTO tenant_nullable_children(id, organization_id, parent_id) VALUES ($1,$2,$3)',
        ['child_cross_tenant_owner', orgA, parentB]
      );
    } catch (error) {
      ownerCrossInsert = error;
      await client.query('ROLLBACK TO SAVEPOINT before_cross_tenant_insert');
    }
    await client.query('RELEASE SAVEPOINT before_cross_tenant_insert');
    assert.ok(ownerCrossInsert, 'owner cross-tenant insert must be rejected by the composite FK');
    assert.equal(ownerCrossInsert.code, '23503');
    checks.push({ id: 'cross-tenant-reference-denied-with-rls-bypassed', status: 'PASS' });

    const runtimeCrossInsert = await expectTenantSqlState(
      orgA,
      () => client.query(
        'INSERT INTO tenant_nullable_children(id, organization_id, parent_id) VALUES ($1,$2,$3)',
        ['child_cross_tenant_runtime', orgA, parentB]
      ),
      '23503',
      'runtime-cross-tenant-insert'
    );
    assert.equal(runtimeCrossInsert.constraint, 'fk_nullable_parent');
    assert.equal(runtimeCrossInsert.table, 'tenant_nullable_children');
    checks.push({ id: 'runtime-cross-tenant-insert-denied', status: 'PASS' });

    await runtimeTenant(orgA, async () => {
      await client.query(
        'INSERT INTO tenant_nullable_children(id, organization_id, parent_id) VALUES ($1,$2,$3)',
        ['child_update_cross_tenant', orgA, parentA]
      );
    });
    await expectTenantSqlState(
      orgA,
      () => client.query(
        'UPDATE tenant_nullable_children SET parent_id=$1 WHERE id=$2',
        [parentB, 'child_update_cross_tenant']
      ),
      '23503',
      'runtime-cross-tenant-update'
    );
    checks.push({ id: 'runtime-cross-tenant-update-denied', status: 'PASS' });

    const parentNull = 'parent_null_' + crypto.randomBytes(4).toString('hex');
    const childNull = 'child_null_' + crypto.randomBytes(4).toString('hex');
    await runtimeTenant(orgA, async () => {
      await client.query('INSERT INTO tenant_parents(id,organization_id) VALUES ($1,$2)', [parentNull, orgA]);
      await client.query('INSERT INTO tenant_nullable_children(id,organization_id,parent_id) VALUES ($1,$2,$3)', [childNull, orgA, parentNull]);
      await client.query('DELETE FROM tenant_parents WHERE id=$1', [parentNull]);
    });
    const nullResult = (await client.query(
      'SELECT organization_id, parent_id FROM tenant_nullable_children WHERE id=$1',
      [childNull]
    )).rows[0];
    assert.equal(nullResult.organization_id, orgA, 'SET NULL must retain organization_id');
    assert.equal(nullResult.parent_id, null, 'SET NULL must clear only the optional parent key');
    checks.push({ id: 'on-delete-set-null-preserves-tenant-key', status: 'PASS' });

    const parentCascade = 'parent_cascade_' + crypto.randomBytes(4).toString('hex');
    const childCascade = 'child_cascade_' + crypto.randomBytes(4).toString('hex');
    await runtimeTenant(orgA, async () => {
      await client.query('INSERT INTO tenant_parents(id,organization_id) VALUES ($1,$2)', [parentCascade, orgA]);
      await client.query('INSERT INTO tenant_cascade_children(id,organization_id,parent_id) VALUES ($1,$2,$3)', [childCascade, orgA, parentCascade]);
      await client.query('DELETE FROM tenant_parents WHERE id=$1', [parentCascade]);
    });
    const cascadeRows = Number((await client.query('SELECT count(*) AS n FROM tenant_cascade_children WHERE id=$1', [childCascade])).rows[0].n);
    assert.equal(cascadeRows, 0, 'ON DELETE CASCADE must preserve original behavior');
    checks.push({ id: 'on-delete-cascade-preserved', status: 'PASS' });

    const parentRestrict = 'parent_restrict_' + crypto.randomBytes(4).toString('hex');
    const childRestrict = 'child_restrict_' + crypto.randomBytes(4).toString('hex');
    await runtimeTenant(orgA, async () => {
      await client.query('INSERT INTO tenant_parents(id,organization_id) VALUES ($1,$2)', [parentRestrict, orgA]);
      await client.query('INSERT INTO tenant_restrict_children(id,organization_id,parent_id) VALUES ($1,$2,$3)', [childRestrict, orgA, parentRestrict]);
    });
    await expectTenantSqlState(
      orgA,
      () => client.query('DELETE FROM tenant_parents WHERE id=$1', [parentRestrict]),
      '23001',
      'on-delete-restrict'
    );
    await runtimeTenant(orgA, async () => {
      await client.query('DELETE FROM tenant_restrict_children WHERE id=$1', [childRestrict]);
      await client.query('DELETE FROM tenant_parents WHERE id=$1', [parentRestrict]);
    });
    checks.push({ id: 'on-delete-restrict-preserved', status: 'PASS' });

    const nodeA = 'node_a_' + crypto.randomBytes(4).toString('hex');
    const nodeB = 'node_b_' + crypto.randomBytes(4).toString('hex');
    await client.query(
      'INSERT INTO tenant_nodes(id,organization_id,parent_id) VALUES ($1,$2,NULL),($3,$4,NULL)',
      [nodeA, orgA, nodeB, orgB]
    );
    await runtimeTenant(orgA, async () => {
      await client.query(
        'INSERT INTO tenant_nodes(id,organization_id,parent_id) VALUES ($1,$2,$3)',
        ['node_same_parent', orgA, nodeA]
      );
    });
    await expectTenantSqlState(
      orgA,
      () => client.query(
        'INSERT INTO tenant_nodes(id,organization_id,parent_id) VALUES ($1,$2,$3)',
        ['node_cross_parent', orgA, nodeB]
      ),
      '23503',
      'self-reference-cross-tenant'
    );
    checks.push({ id: 'self-reference-cross-tenant-denied', status: 'PASS' });

    const remaining = (await client.query(
      `SELECT count(*) AS n
       FROM pg_constraint c
       JOIN pg_class s ON s.oid=c.conrelid
       JOIN pg_namespace sn ON sn.oid=s.relnamespace
       JOIN pg_class t ON t.oid=c.confrelid
       JOIN pg_namespace tn ON tn.oid=t.relnamespace
       WHERE c.contype='f'
         AND sn.nspname=$1 AND tn.nspname=$1
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='organization_id' AND NOT a.attisdropped)
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='organization_id' AND NOT a.attisdropped)
         AND NOT (
           array_length(c.conkey,1)=2 AND array_length(c.confkey,1)=2
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[2] AND a.attname='organization_id')
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attnum=c.confkey[2] AND a.attname='organization_id')
         )`,
      [schema]
    )).rows[0];
    assert.equal(Number(remaining.n), 0, 'no unpaired tenant-to-tenant FK may remain');
    checks.push({ id: 'no-unpaired-tenant-foreign-keys-remain', status: 'PASS' });

    await client.query('ROLLBACK');
    transactionOpen = false;

    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.postgres-tenant-composite-fk-gate.v1',
      status: 'PASS',
      database: databaseName,
      serverVersion: info.server_version,
      runtimeRole: 'opscore_runtime',
      productionCertification: false,
      checks,
      totalChecks: checks.length,
      note: 'Disposable transaction-only schema. No production or Neon persistent database was changed.'
    }, null, 2) + '\n');
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      transactionOpen = false;
    }
    process.stderr.write(JSON.stringify({
      schemaVersion: 'opscore.postgres-tenant-composite-fk-gate.v1',
      status: 'FAIL',
      database: databaseName,
      reason: String(error?.message || 'TENANT_FK_GATE_FAILED').slice(0, 200),
      errorCode: error?.code || null,
      productionCertification: false
    }, null, 2) + '\n');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({
    schemaVersion: 'opscore.postgres-tenant-composite-fk-gate.v1',
    status: 'FAIL',
    reason: String(error?.message || 'TENANT_FK_GATE_START_FAILED').slice(0, 200),
    productionCertification: false
  }, null, 2) + '\n');
  process.exitCode = 1;
});
