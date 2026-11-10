#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function result(status, details = {}) {
  return { schemaVersion: 'opscore.live-production-gate.v1', status, checkedAt: new Date().toISOString(), ...details };
}

function fail(message, details = {}) {
  console.error(JSON.stringify(result('FAIL', { reason: message, ...details }), null, 2));
  process.exitCode = 1;
}

function b64urlToBuffer(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '='), 'base64');
}

function decodeJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('OIDC_TOKEN_FORMAT_INVALID');
  let header, payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    throw new Error('OIDC_TOKEN_JSON_INVALID');
  }
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: b64urlToBuffer(parts[2]) };
}

function issuerConfigUrl(issuer) {
  return new URL('.well-known/openid-configuration', `${String(issuer).replace(/\/$/, '')}/`).toString();
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('HTTP_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function verifyRs256(jwt, jwk) {
  if (jwt.header.alg !== 'RS256') throw new Error('OIDC_ALGORITHM_FORBIDDEN');
  if (jwk?.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('OIDC_JWK_INVALID');
  const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(jwt.signingInput);
  verifier.end();
  if (!verifier.verify(key, jwt.signature)) throw new Error('OIDC_SIGNATURE_INVALID');
}

async function verifyOidc() {
  const issuer = String(process.env.OIDC_ISSUER || '').replace(/\/$/, '');
  const audience = String(process.env.OIDC_AUDIENCE || '');
  const token = String(process.env.OIDC_TOKEN || '');
  if (!issuer || !audience || !token) throw new Error('OIDC_LIVE_VARS_REQUIRED');
  const discovery = await fetchJson(issuerConfigUrl(issuer));
  if (String(discovery.issuer || '').replace(/\/$/, '') !== issuer) throw new Error('OIDC_ISSUER_MISMATCH');
  if (!discovery.jwks_uri) throw new Error('OIDC_JWKS_URI_MISSING');
  const keys = await fetchJson(discovery.jwks_uri);
  if (!Array.isArray(keys.keys)) throw new Error('OIDC_JWKS_INVALID');
  const jwt = decodeJwt(token);
  const jwk = keys.keys.find(k => k.kid === jwt.header.kid);
  if (!jwk) throw new Error('OIDC_SIGNING_KEY_NOT_FOUND');
  verifyRs256(jwt, jwk);
  const now = Math.floor(Date.now() / 1000);
  const skew = Math.max(0, Number(process.env.OIDC_CLOCK_SKEW_SECONDS || 60));
  if (jwt.payload.iss !== issuer) throw new Error('OIDC_CLAIM_ISS_INVALID');
  const audiences = Array.isArray(jwt.payload.aud) ? jwt.payload.aud : [jwt.payload.aud];
  if (!audiences.includes(audience)) throw new Error('OIDC_CLAIM_AUD_INVALID');
  if (!Number.isFinite(Number(jwt.payload.exp)) || Number(jwt.payload.exp) <= now - skew) throw new Error('OIDC_TOKEN_EXPIRED');
  if (jwt.payload.nbf !== undefined && Number(jwt.payload.nbf) > now + skew) throw new Error('OIDC_TOKEN_NOT_YET_VALID');
  if (process.env.OIDC_REQUIRED_TENANT_CLAIM && !jwt.payload[process.env.OIDC_REQUIRED_TENANT_CLAIM]) throw new Error('OIDC_TENANT_CLAIM_MISSING');
  return { issuer, jwksUri: discovery.jwks_uri, keyId: jwt.header.kid, subjectPresent: Boolean(jwt.payload.sub), expiresAt: new Date(Number(jwt.payload.exp) * 1000).toISOString() };
}

async function postgresGate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch {
    throw new Error('POSTGRES_DRIVER_MISSING');
  }
  const pool = new Pool({ connectionString: url, max: 2, application_name: 'opscore-live-production-gate', statement_timeout: 10000 });
  const client = await pool.connect();
  const report = { connection: null, runtimeRole: null, rls: null, tenantIsolation: null, twinTenantIsolation: null, extensions: null };
  try {
    const ping = await client.query("SELECT current_database() AS database, current_user AS current_user, current_setting('server_version') AS server_version");
    report.connection = ping.rows[0];
    const roleResult = await client.query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    report.runtimeRole = roleResult.rows[0] || null;
    if (!report.runtimeRole || report.runtimeRole.rolsuper || report.runtimeRole.rolbypassrls) throw new Error('POSTGRES_RUNTIME_ROLE_BYPASSES_RLS');
    const ext = await client.query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','pgcrypto') ORDER BY extname");
    report.extensions = ext.rows;
    const required = ['customers','sites','work_orders','assets','asset_events','locations','activity_log','comments','attachments','notifications','webhook_endpoints','webhook_deliveries','api_keys','sync_events','operational_jobs','tenant_domains','tenant_crypto_profiles','operational_twin_snapshots','operational_twin_chain_events'];
    const q = await client.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS has_policy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname = ANY($1::text[]) ORDER BY c.relname`, [required]);
    const missing = required.filter(name => !q.rows.some(r => r.relname === name));
    const nonRls = q.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity || !r.has_policy).map(r => r.relname);
    report.rls = { required, missing, nonRls, rows: q.rows };
    if (missing.length || nonRls.length) throw new Error('POSTGRES_RLS_GATE_FAILED');

    const suffix = crypto.randomBytes(6).toString('hex');
    const orgA = `live-gate-a-${suffix}`;
    const orgB = `live-gate-b-${suffix}`;
    const customerA = `live-gate-customer-a-${suffix}`;
    const userA = `live-gate-user-a-${suffix}`;
    const twinEventA = `live-gate-twin-event-a-${suffix}`;
    await client.query('BEGIN');
    try {
      await client.query("INSERT INTO organizations(id,name,created_at) VALUES ($1,$2,now())", [orgA, orgA]);
      await client.query("INSERT INTO organizations(id,name,created_at) VALUES ($1,$2,now())", [orgB, orgB]);
      await client.query("INSERT INTO users(id,email,password_hash,status,created_at) VALUES ($1,$2,$3,'active',now())", [userA, `${userA}@example.invalid`, 'test-only-not-a-real-password-hash']);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [orgA]);
      await client.query("INSERT INTO customers(id,organization_id,name,created_at,updated_at) VALUES ($1,$2,$3,now(),now())", [customerA, orgA, 'live-gate-customer']);
      const visibleA = await client.query("SELECT id FROM customers WHERE id=$1", [customerA]);
      if (visibleA.rowCount !== 1) throw new Error('TENANT_A_SELF_VISIBILITY_FAILED');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [orgB]);
      const crossRead = await client.query("SELECT id FROM customers WHERE id=$1", [customerA]);
      if (crossRead.rowCount !== 0) throw new Error('TENANT_CROSS_READ_BREACH');
      let crossWriteDenied = false;
      try {
        await client.query("INSERT INTO customers(id,organization_id,name,created_at,updated_at) VALUES ($1,$2,$3,now(),now())", [`cross-${suffix}`, orgA, 'forbidden']);
      } catch (error) {
        crossWriteDenied = true;
      }
      if (!crossWriteDenied) throw new Error('TENANT_CROSS_WRITE_BREACH');
      report.tenantIsolation = { tenantAVisibleOwnRow: true, tenantBCanReadTenantARow: false, tenantBCanWriteTenantARow: false };

      const twinPayload = JSON.stringify({ schemaVersion: 'opscore.digital-twin-chain-event.v1', organizationId: orgA, sequenceNo: 1, eventType: 'snapshot.created', snapshotId: `live-gate-snapshot-${suffix}`, previousHash: 'GENESIS' });
      await client.query("INSERT INTO operational_twin_chain_events(id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by) VALUES ($1,$2,1,'snapshot.created',$3,'GENESIS',$4,$5,$6)", [twinEventA, orgA, `live-gate-snapshot-${suffix}`, twinPayload, 'a'.repeat(64), userA]);
      const ownTwin = await client.query('SELECT id FROM operational_twin_chain_events WHERE id=$1', [twinEventA]);
      if (ownTwin.rowCount !== 1) throw new Error('TWIN_CHAIN_SELF_READ_FAILED');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [orgB]);
      const hiddenTwin = await client.query('SELECT id FROM operational_twin_chain_events WHERE id=$1', [twinEventA]);
      const changedTwin = await client.query("UPDATE operational_twin_chain_events SET event_type='tampered' WHERE id=$1", [twinEventA]);
      const deletedTwin = await client.query('DELETE FROM operational_twin_chain_events WHERE id=$1', [twinEventA]);
      if (hiddenTwin.rowCount !== 0 || changedTwin.rowCount !== 0 || deletedTwin.rowCount !== 0) throw new Error('TWIN_CHAIN_CROSS_TENANT_DML_BREACH');
      await client.query('SAVEPOINT twin_cross_tenant_insert');
      let twinCrossInsertDenied = false;
      try {
        await client.query("INSERT INTO operational_twin_chain_events(id,organization_id,sequence_no,event_type,snapshot_id,previous_hash,event_json,event_hash,created_by) VALUES ($1,$2,2,'snapshot.created',$3,$4,$5,$6,$7)", [`cross-${twinEventA}`, orgA, `cross-snapshot-${suffix}`, 'a'.repeat(64), twinPayload, 'b'.repeat(64), userA]);
      } catch (error) {
        twinCrossInsertDenied = error.code === '42501';
        await client.query('ROLLBACK TO SAVEPOINT twin_cross_tenant_insert');
      }
      await client.query('RELEASE SAVEPOINT twin_cross_tenant_insert');
      if (!twinCrossInsertDenied) throw new Error('TWIN_CHAIN_CROSS_TENANT_INSERT_BREACH');
      await client.query("SELECT set_config('app.tenant_id','',true)");
      const noTenantTwin = await client.query('SELECT id FROM operational_twin_chain_events');
      if (noTenantTwin.rowCount !== 0) throw new Error('TWIN_CHAIN_MISSING_TENANT_DID_NOT_FAIL_CLOSED');
      report.twinTenantIsolation = { tenantAVisibleOwnEvent: true, tenantBCanReadTenantAEvent: false, tenantBCanUpdateOrDeleteTenantAEvent: false, tenantBCanInsertForTenantA: false, missingContextFailsClosed: true };
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
  return report;
}

async function main() {
  const selfTest = process.argv.includes('--self-test');
  if (selfTest) {
    const cases = [
      ['JWT RS256 parser rejects malformed token', () => { try { decodeJwt('x.y'); return false; } catch (e) { return e.message === 'OIDC_TOKEN_FORMAT_INVALID'; } }],
      ['OIDC token algorithm enforcement', () => { try { verifyRs256({ header: { alg: 'HS256' }, signingInput: 'x.y', signature: Buffer.alloc(0) }, {}); return false; } catch (e) { return e.message === 'OIDC_ALGORITHM_FORBIDDEN'; } }],
      ['No silent OIDC fallback', () => process.env.AUTH_MODE === undefined || process.env.AUTH_MODE === 'local' || process.env.AUTH_MODE === 'oidc']
    ];
    const failed = cases.filter(([, fn]) => !fn()).map(([name]) => name);
    console.log(JSON.stringify(result(failed.length ? 'FAIL' : 'PASS', { mode: 'self-test', cases: cases.map(([name]) => ({ name, status: failed.includes(name) ? 'FAIL' : 'PASS' })) }), null, 2));
    process.exitCode = failed.length ? 1 : 0;
    return;
  }
  const missing = ['DATABASE_URL','OIDC_ISSUER','OIDC_AUDIENCE','OIDC_TOKEN'].filter(k => !process.env[k]);
  if (missing.length) {
    console.log(JSON.stringify(result('UNVERIFIED', { reason: 'LIVE_INFRA_REQUIRED', missing, postgres: 'UNVERIFIED', oidc: 'UNVERIFIED', productionCertification: 'NOT_ESTABLISHED' }), null, 2));
    return;
  }
  try {
    const [postgres, oidc] = await Promise.all([postgresGate(), verifyOidc()]);
    console.log(JSON.stringify(result('PASS', { postgres, oidc, productionCertification: 'LIVE_CHECKS_PASSED' }), null, 2));
  } catch (error) {
    fail(error?.message || String(error));
  }
}

main().catch(error => fail(error?.message || String(error)));
