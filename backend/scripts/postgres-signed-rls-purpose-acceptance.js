'use strict';

const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { openPgDatabaseSync } = require('../src/pg-database-sync');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(name + '_REQUIRED');
  return value;
}
function quoteProbe(value) {
  if (!/^opscore_rls_purpose_[a-f0-9]{12}$/.test(value)) throw new Error('PROBE_TABLE_NAME_INVALID');
  return '"' + value + '"';
}

async function main() {
  const ownerUrl = required('OPSC_TENANT_CONTEXT_OWNER_URL');
  const runtimeUrl = required('OPSC_PG_ACCEPTANCE_URL');
  const tableName = 'opscore_rls_purpose_' + crypto.randomBytes(6).toString('hex');
  const table = quoteProbe(tableName);
  const tenantA = 'rls-purpose-tenant-a-' + crypto.randomUUID();
  const tenantB = 'rls-purpose-tenant-b-' + crypto.randomUUID();
  const userA = 'rls-purpose-user-a-' + crypto.randomUUID();
  const sessionA = 'rls-purpose-session-a-' + crypto.randomUUID();
  const apiKeyId = 'rls-purpose-key-' + crypto.randomUUID();
  const created = new Date().toISOString();
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const owner = new Client({ connectionString: ownerUrl });
  const rawRuntime = new Client({ connectionString: runtimeUrl });
  let db = null;
  let createdTable = false;
  let fixtureStarted = false;
  const result = {
    schemaVersion: 'opscore.signed-rls-purpose-acceptance.v1',
    status: 'FAIL',
    rawGucForgery: 'NOT_RUN',
    rawGucWrite: 'NOT_RUN',
    validPurposes: [],
    liveFieldSession: 'NOT_RUN',
    immutableSignedIdentity: 'NOT_RUN',
    crossTenantWrite: 'NOT_RUN',
    cleanup: 'NOT_RUN'
  };

  try {
    await owner.connect();
    await rawRuntime.connect();

    const role = await rawRuntime.query(
      "SELECT current_user AS role, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user"
    );
    assert.equal(role.rows[0].role, 'opscore_runtime');
    assert.equal(role.rows[0].rolsuper, false);
    assert.equal(role.rows[0].rolbypassrls, false);

    await owner.query('CREATE TABLE public.' + table + ' (id text PRIMARY KEY, organization_id text NOT NULL)');
    createdTable = true;
    await owner.query('ALTER TABLE public.' + table + ' ENABLE ROW LEVEL SECURITY');
    await owner.query('ALTER TABLE public.' + table + ' FORCE ROW LEVEL SECURITY');
    await owner.query(
      'CREATE POLICY signed_purpose_tenant_boundary ON public.' + table +
      ' FOR ALL TO opscore_runtime USING (organization_id = public.opscore_current_tenant())' +
      ' WITH CHECK (organization_id = public.opscore_current_tenant())'
    );
    await owner.query('GRANT SELECT, INSERT ON TABLE public.' + table + ' TO opscore_runtime');
    await owner.query(
      'INSERT INTO public.' + table + '(id,organization_id) VALUES($1,$2),($3,$4)',
      ['seed-a', tenantA, 'seed-b', tenantB]
    );

    // A direct runtime connection can set all three legacy GUCs, but no valid
    // signed assertion exists on this backend. RLS must therefore see no identity.
    await rawRuntime.query('BEGIN');
    fixtureStarted = true;
    await rawRuntime.query(
      "SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true), set_config('app.access_mode','backoffice',true)",
      [tenantA, userA]
    );
    const rawProbe = await rawRuntime.query(
      'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode, (SELECT count(*)::int FROM public.' + table + ') AS visible_rows'
    );
    assert.equal(rawProbe.rows[0].tenant, null);
    assert.equal(rawProbe.rows[0].user_id, null);
    assert.equal(rawProbe.rows[0].mode, '');
    assert.equal(rawProbe.rows[0].visible_rows, 0);
    let rawInsertDenied = false;
    try {
      await rawRuntime.query(
        'INSERT INTO public.' + table + '(id,organization_id) VALUES($1,$2)',
        ['raw-guc-forged-insert', tenantA]
      );
    } catch (error) {
      rawInsertDenied = error && error.code === '42501';
    }
    assert.equal(rawInsertDenied, true);
    await rawRuntime.query('ROLLBACK');
    fixtureStarted = false;
    result.rawGucForgery = 'PASS';
    result.rawGucWrite = 'PASS';

    // Create a real, short-lived server session fixture for the field-purpose gate.
    await owner.query(
      'INSERT INTO public.organizations(id,name,created_at) VALUES($1,$2,$3)',
      [tenantA, 'RLS purpose acceptance tenant', created]
    );
    await owner.query(
      'INSERT INTO public.users(id,email,password_hash,status,created_at) VALUES($1,$2,$3,$4,$5)',
      [userA, 'rls-purpose-' + crypto.randomUUID() + '@acceptance.invalid', 'acceptance-only-not-a-login-hash', 'active', created]
    );
    await owner.query(
      'INSERT INTO public.memberships(user_id,organization_id,role,created_at) VALUES($1,$2,$3,$4)',
      [userA, tenantA, 'owner', created]
    );
    await owner.query(
      "INSERT INTO public.organization_governance(organization_id,status,reason,changed_by,changed_at,version) VALUES($1,'active','rls purpose acceptance',$2,$3,1)",
      [tenantA, userA, created]
    );
    await owner.query(
      'INSERT INTO public.sessions(id,user_id,organization_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [sessionA, userA, tenantA, crypto.createHash('sha256').update(sessionA).digest('hex'), expiry, created]
    );
    await owner.query(
      'INSERT INTO public.api_keys(id,organization_id,name,key_prefix,key_hash,scopes_json,expires_at,revoked_at,created_by,created_at,last_used_at) VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,NULL)',
      [apiKeyId, tenantA, 'RLS purpose acceptance key', 'rlspurpose', crypto.createHash('sha256').update(apiKeyId).digest('hex'), '["read"]', expiry, userA, created]
    );

    db = openPgDatabaseSync(runtimeUrl);
    db.setSession({ tenantId: tenantA, userId: userA, sessionId: sessionA, accessMode: 'field' });
    const identity = db.prepare(
      'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode, (SELECT count(*)::int FROM public.' + table + ') AS visible_rows'
    ).get();
    assert.equal(identity.tenant, tenantA);
    assert.equal(identity.user_id, userA);
    assert.equal(identity.mode, 'field');
    assert.equal(identity.visible_rows, 1);
    result.liveFieldSession = 'PASS';

    // Raw GUC tampering cannot replace the signed field tenant/user/purpose on
    // the same PostgreSQL backend.
    db.exec('BEGIN');
    try {
      db.prepare(
        "SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true), set_config('app.access_mode','backoffice',true)"
      ).get(tenantB, 'attacker-controlled-user');
      const stable = db.prepare(
        'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode, (SELECT count(*)::int FROM public.' + table + ') AS visible_rows'
      ).get();
      assert.equal(stable.tenant, tenantA);
      assert.equal(stable.user_id, userA);
      assert.equal(stable.mode, 'field');
      assert.equal(stable.visible_rows, 1);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
    result.immutableSignedIdentity = 'PASS';

    db.prepare('INSERT INTO public.' + table + '(id,organization_id) VALUES(?,?)').run('signed-own-write', tenantA);
    let crossTenantDenied = false;
    try {
      db.prepare('INSERT INTO public.' + table + '(id,organization_id) VALUES(?,?)').run('signed-cross-tenant-write', tenantB);
    } catch (error) {
      crossTenantDenied = error && error.code === '42501';
    }
    assert.equal(crossTenantDenied, true);
    result.crossTenantWrite = 'PASS';

    // Purpose-specific assertions are distinct and the access mode is returned
    // only from the verified signed purpose, never from the raw GUC.
    for (const mode of ['auth', 'system', 'backoffice']) {
      db.setSession({ tenantId: tenantA, userId: userA, accessMode: mode });
      const row = db.prepare(
        'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode'
      ).get();
      assert.equal(row.tenant, tenantA, mode + '_tenant');
      assert.equal(row.user_id, userA, mode + '_user');
      assert.equal(row.mode, mode, mode + '_mode');
      result.validPurposes.push(mode);
    }
    db.setSession({ tenantId: tenantA, userId: userA, apiKeyId, accessMode: 'field' });
    const apiKeyIdentity = db.prepare(
      'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode'
    ).get();
    assert.equal(apiKeyIdentity.tenant, tenantA);
    assert.equal(apiKeyIdentity.user_id, userA);
    assert.equal(apiKeyIdentity.mode, 'field');
    result.validPurposes.push('api_key');

    result.validPurposes.push('field');

    await owner.query('DELETE FROM public.sessions WHERE id=$1', [sessionA]);
    db.setSession({ tenantId: tenantA, userId: userA, sessionId: sessionA, accessMode: 'field' });
    const revoked = db.prepare(
      'SELECT public.opscore_current_tenant() AS tenant, public.opscore_current_user() AS user_id, public.opscore_access_mode() AS mode, (SELECT count(*)::int FROM public.' + table + ') AS visible_rows'
    ).get();
    assert.equal(revoked.tenant, null);
    assert.equal(revoked.user_id, null);
    assert.equal(revoked.mode, '');
    assert.equal(revoked.visible_rows, 0);
    result.revokedFieldSession = 'PASS';
    result.status = 'PASS';
  } finally {
    if (fixtureStarted) { try { await rawRuntime.query('ROLLBACK'); } catch (_) {} }
    if (db) { try { db.close(); } catch (_) { result.cleanup = 'FAIL_WORKER_CLOSE'; } }
    try {
      await owner.query('DELETE FROM public.sessions WHERE id=$1', [sessionA]);
      await owner.query('DELETE FROM public.api_keys WHERE id=$1', [apiKeyId]);
      await owner.query('DELETE FROM public.memberships WHERE user_id=$1 AND organization_id=$2', [userA, tenantA]);
      await owner.query('DELETE FROM public.users WHERE id=$1', [userA]);
      await owner.query('DELETE FROM public.organization_governance WHERE organization_id=$1', [tenantA]);
      await owner.query('DELETE FROM public.organizations WHERE id=$1', [tenantA]);
      if (createdTable) await owner.query('DROP TABLE IF EXISTS public.' + table);
      result.cleanup = 'PASS';
    } catch (error) {
      result.cleanup = 'FAIL:' + String(error && (error.code || error.message) || error).slice(0,120);
    }
    try { await owner.end(); } catch (_) {}
    try { await rawRuntime.end(); } catch (_) {}
  }

  if (result.status !== 'PASS' || result.cleanup !== 'PASS') {
    process.stderr.write('SIGNED_RLS_PURPOSE_ACCEPTANCE ' + JSON.stringify(result) + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('SIGNED_RLS_PURPOSE_ACCEPTANCE ' + JSON.stringify(result) + '\n');
  }
}

main().catch(error => {
  process.stderr.write('SIGNED_RLS_PURPOSE_ACCEPTANCE_FAILED ' + String(error && (error.stack || error.message) || error) + '\n');
  process.exitCode = 1;
});
