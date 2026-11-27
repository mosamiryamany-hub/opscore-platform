'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const raw = String(process.env.OPSC_PG_TEST_URL || '').trim();
  assert.ok(raw, 'OPSC_PG_TEST_URL is required');
  const target = new URL(raw);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(target.hostname), 'test URL must be loopback only');
  assert.equal(decodeURIComponent(target.pathname.replace(/^\\/+/, '')), 'opscore_test', 'test database name must be opscore_test');

  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  const checks = [];
  try {
    const version = await client.query("SELECT current_setting('server_version_num')::integer AS version, current_database() AS database");
    assert.ok(version.rows[0].version >= 180000 && version.rows[0].version < 190000, 'PostgreSQL 18 is required');
    checks.push({ id: 'postgresql-version', status: 'PASS', major: 18 });

    await client.query(`
      DROP TABLE IF EXISTS public.ai_contact_conversations CASCADE;
      DROP TABLE IF EXISTS public.customers CASCADE;
      DROP ROLE IF EXISTS opscore_runtime;
      CREATE ROLE opscore_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE public.customers (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        name text NOT NULL
      );
      CREATE TABLE public.ai_contact_conversations (
        id text PRIMARY KEY,
        organization_id text NOT NULL,
        status text NOT NULL
      );
      ALTER TABLE public.ai_contact_conversations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.ai_contact_conversations FORCE ROW LEVEL SECURITY;
      CREATE POLICY ai_contact_conversations_tenant_test
        ON public.ai_contact_conversations
        USING (organization_id = current_setting('app.tenant_id', true))
        WITH CHECK (organization_id = current_setting('app.tenant_id', true));
      GRANT SELECT, UPDATE ON public.ai_contact_conversations TO opscore_runtime;
    `);

    const migration = fs.readFileSync(path.resolve(__dirname, '../sql/postgres/073_contact_center_crm_customer_link.sql'), 'utf8');
    await client.query(migration);

    const fk = await client.query(`
      SELECT c.conname, c.confdeltype, c.convalidated,
        (SELECT array_agg(a.attname ORDER BY x.ord)
           FROM unnest(c.conkey) WITH ORDINALITY x(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.attnum) AS source_columns,
        (SELECT array_agg(a.attname ORDER BY x.ord)
           FROM unnest(c.confkey) WITH ORDINALITY x(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=x.attnum) AS target_columns,
        (SELECT array_agg(a.attname ORDER BY x.ord)
           FROM unnest(c.confdelsetcols) WITH ORDINALITY x(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.attnum) AS set_null_columns
      FROM pg_constraint c
      WHERE c.conrelid='public.ai_contact_conversations'::regclass
        AND c.conname='ai_contact_conversations_customer_tenant_fk'
    `);
    assert.equal(fk.rowCount, 1, 'composite tenant FK must exist');
    assert.equal(fk.rows[0].confdeltype, 'n', 'delete action must be SET NULL');
    assert.equal(fk.rows[0].convalidated, true, 'composite tenant FK must be validated');
    assert.deepEqual(fk.rows[0].source_columns, ['customer_id', 'organization_id']);
    assert.deepEqual(fk.rows[0].target_columns, ['id', 'organization_id']);
    assert.deepEqual(fk.rows[0].set_null_columns, ['customer_id'], 'delete must null only customer_id, not organization_id');
    checks.push({ id: 'composite-tenant-foreign-key', status: 'PASS', source: fk.rows[0].source_columns, target: fk.rows[0].target_columns, onDeleteSetNullColumns: fk.rows[0].set_null_columns });

    const index = await client.query(`
      SELECT i.indisunique, pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i
      WHERE i.indexrelid='public.uq_customers_id_org_contact_center'::regclass
    `);
    assert.equal(index.rowCount, 1);
    assert.equal(index.rows[0].indisunique, true);
    assert.match(index.rows[0].definition, /\\(id, organization_id\\)/);
    checks.push({ id: 'composite-customer-unique-index', status: 'PASS' });

    const rls = await client.query(`
      SELECT c.relrowsecurity, c.relforcerowsecurity,
        (SELECT count(*)::integer FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename='ai_contact_conversations') AS policy_count
      FROM pg_class c WHERE c.oid='public.ai_contact_conversations'::regclass
    `);
    assert.equal(rls.rows[0].relrowsecurity, true);
    assert.equal(rls.rows[0].relforcerowsecurity, true);
    assert.ok(rls.rows[0].policy_count >= 1);
    checks.push({ id: 'rls-preserved', status: 'PASS', rowSecurity: true, forceRowSecurity: true, policies: rls.rows[0].policy_count });

    await client.query(`
      INSERT INTO public.customers(id,organization_id,name) VALUES
        ('cus_tenant_a','org_a','Tenant A'),
        ('cus_tenant_b','org_b','Tenant B');
      INSERT INTO public.ai_contact_conversations(id,organization_id,status) VALUES
        ('conv_a','org_a','active'),
        ('conv_b','org_b','active');
      UPDATE public.ai_contact_conversations SET customer_id='cus_tenant_a' WHERE id='conv_a';
    `);
    await assert.rejects(
      client.query("UPDATE public.ai_contact_conversations SET customer_id='cus_tenant_b' WHERE id='conv_a'"),
      error => error && error.code === '23503'
    );
    checks.push({ id: 'cross-tenant-link-rejected', status: 'PASS' });

    await client.query("DELETE FROM public.customers WHERE id='cus_tenant_a'");
    const afterDelete = await client.query("SELECT organization_id,customer_id FROM public.ai_contact_conversations WHERE id='conv_a'");
    assert.equal(afterDelete.rows[0].organization_id, 'org_a');
    assert.equal(afterDelete.rows[0].customer_id, null);
    checks.push({ id: 'customer-delete-preserves-conversation-tenant', status: 'PASS' });

    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE opscore_runtime');
    await client.query("SELECT set_config('app.tenant_id','org_a',true)");
    const tenantA = await client.query('SELECT id FROM public.ai_contact_conversations ORDER BY id');
    assert.deepEqual(tenantA.rows.map(row => row.id), ['conv_a']);
    await client.query("SELECT set_config('app.tenant_id','org_b',true)");
    const tenantB = await client.query('SELECT id FROM public.ai_contact_conversations ORDER BY id');
    assert.deepEqual(tenantB.rows.map(row => row.id), ['conv_b']);
    await client.query('ROLLBACK');
    checks.push({ id: 'tenant-rls-isolation', status: 'PASS' });

    console.log(JSON.stringify({
      schemaVersion: 'opscore.contact-center-crm-postgres-acceptance.v1',
      status: 'PASS',
      database: 'opscore_test',
      postgresMajor: 18,
      checks
    }, null, 2));
  } finally {
    await client.query('DROP TABLE IF EXISTS public.ai_contact_conversations CASCADE').catch(() => {});
    await client.query('DROP TABLE IF EXISTS public.customers CASCADE').catch(() => {});
    await client.query('DROP ROLE IF EXISTS opscore_runtime').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    schemaVersion: 'opscore.contact-center-crm-postgres-acceptance.v1',
    status: 'FAIL',
    errorCode: error.code || null,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
