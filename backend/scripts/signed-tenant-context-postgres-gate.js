'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { hashToken } = require('../src/security');
const { createSignedTenantContext } = require('../src/signed-tenant-context');

function requireLocalAcceptanceUrl(value, expectedRole, label) {
  const url = new URL(String(value || ''));
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const role = decodeURIComponent(url.username);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)
      || database !== 'opscore_http_acceptance'
      || role !== expectedRole
      || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(label + '_TARGET_NOT_DISPOSABLE_LOCAL_ACCEPTANCE');
  }
  return url;
}

function queryHttp(port, route, token) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: route,
      method: 'GET',
      headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
      timeout: 2500
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) { /* rejected below */ }
        resolve({ status: response.statusCode, headers: response.headers, body: parsed });
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP_ACCEPTANCE_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

async function choosePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error('SIGNED_CONTEXT_TEST_SERVER_EXITED');
    try {
      const response = await queryHttp(port, '/api/health', 'health-probe');
      if (response.status === 200 && response.body && response.body.service === 'opscore') return;
    } catch (_) { /* retry during startup only */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('SIGNED_CONTEXT_TEST_SERVER_START_TIMEOUT');
}

function assertSingleTenantRow(rows, expectedTenant) {
  if (rows.length !== 1 || rows[0].probe_value !== 'proof:' + expectedTenant) {
    throw new Error('SIGNED_CONTEXT_RLS_EXPECTED_ONE_AUTHENTICATED_TENANT_ROW');
  }
}

async function readProbeRows(client, tenantId) {
  const result = await client.query(
    'SELECT probe_value FROM opscore_security.context_probe_rows WHERE organization_id=$1 ORDER BY id',
    [tenantId]
  );
  return result.rows;
}

async function beginReadOnly(client) {
  const result = await client.query(
    'SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id'
  );
  return {
    backendPid: Number(result.rows[0].backend_pid),
    transactionId: String(result.rows[0].transaction_id)
  };
}

async function bindAssertion(client, assertion) {
  await client.query(
    "SELECT set_config('app.signed_context_payload',$1,true), set_config('app.signed_context_signature',$2,true)",
    [assertion.payload, assertion.signature]
  );
}

async function tamperRawGucs(client, otherTenant) {
  await client.query(
    "SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id','attacker-user',true), set_config('app.access_mode','backoffice',true)",
    [otherTenant]
  );
}

async function main() {
  if (process.env.CI !== 'true') throw new Error('SIGNED_CONTEXT_POSTGRES_GATE_CI_ONLY');
  const ownerUrl = process.env.OPSC_TENANT_CONTEXT_OWNER_URL;
  const runtimeUrl = process.env.OPSC_PG_ACCEPTANCE_URL;
  requireLocalAcceptanceUrl(ownerUrl, 'neondb_owner', 'OWNER');
  requireLocalAcceptanceUrl(runtimeUrl, 'opscore_runtime', 'RUNTIME');

  const owner = new Client({ connectionString: ownerUrl });
  const runtimeProbe = new Client({ connectionString: runtimeUrl });
  let serverProcess = null;
  let serverOutput = '';
  let clientA = null;
  let clientB = null;
  let activeVerifierRole = false;

  const keyId = 'ci-' + crypto.randomUUID();
  const key = crypto.randomBytes(32);
  const keyHex = key.toString('hex');
  const tenantA = 'tc_org_a_' + crypto.randomUUID().replace(/-/g, '');
  const tenantB = 'tc_org_b_' + crypto.randomUUID().replace(/-/g, '');
  const userA = 'tc_user_a_' + crypto.randomUUID().replace(/-/g, '');
  const userB = 'tc_user_b_' + crypto.randomUUID().replace(/-/g, '');
  const sessionA = 'tc_session_a_' + crypto.randomUUID().replace(/-/g, '');
  const sessionB = 'tc_session_b_' + crypto.randomUUID().replace(/-/g, '');
  const tokenA = crypto.randomBytes(32).toString('hex');
  const tokenB = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const synthetic = {
    tenantIds: [tenantA, tenantB],
    userIds: [userA, userB],
    sessionIds: [sessionA, sessionB],
    workOrderIds: ['tc_wo_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_wo_b_' + crypto.randomUUID().replace(/-/g, '')],
    keyId
  };

  try {
    await owner.connect();
    await runtimeProbe.connect();

    const ownerIdentity = await owner.query('SELECT current_user AS role_name, current_database() AS database_name');
    const runtimeIdentity = await runtimeProbe.query(
      "SELECT current_user AS role_name, current_database() AS database_name, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls"
    );
    if (ownerIdentity.rows[0].role_name !== 'neondb_owner'
        || ownerIdentity.rows[0].database_name !== 'opscore_http_acceptance'
        || runtimeIdentity.rows[0].role_name !== 'opscore_runtime'
        || runtimeIdentity.rows[0].database_name !== 'opscore_http_acceptance'
        || runtimeIdentity.rows[0].bypass_rls !== false) {
      throw new Error('SIGNED_CONTEXT_DATABASE_IDENTITY_INVALID');
    }

    const definer = await owner.query("SELECT 1 FROM pg_roles WHERE rolname='opscore_auth_definer'");
    if (definer.rowCount === 1) {
      await owner.query('SET ROLE opscore_auth_definer');
      activeVerifierRole = true;
    }
    await owner.query(
      'INSERT INTO opscore_security.context_hmac_keys(key_id,secret,enabled,not_before,not_after) VALUES($1,$2,true,now()-interval \'1 minute\',now()+interval \'1 hour\')',
      [keyId, key]
    );
    if (activeVerifierRole) {
      await owner.query('RESET ROLE');
      activeVerifierRole = false;
    }

    await owner.query(
      'CREATE TABLE IF NOT EXISTS opscore_security.context_probe_rows (id text PRIMARY KEY, organization_id text NOT NULL, probe_value text NOT NULL)'
    );
    await owner.query('ALTER TABLE opscore_security.context_probe_rows ENABLE ROW LEVEL SECURITY');
    await owner.query('ALTER TABLE opscore_security.context_probe_rows FORCE ROW LEVEL SECURITY');
    await owner.query('DROP POLICY IF EXISTS context_probe_rows_signed_tenant ON opscore_security.context_probe_rows');
    await owner.query(
      'CREATE POLICY context_probe_rows_signed_tenant ON opscore_security.context_probe_rows FOR SELECT TO opscore_runtime USING (organization_id = (opscore_security.verified_tenant_context()->>\'tenant_id\'))'
    );
    await owner.query('GRANT SELECT ON TABLE opscore_security.context_probe_rows TO opscore_runtime');

    await owner.query(
      'INSERT INTO public.organizations(id,name,created_at) VALUES($1,$2,now()::text),($3,$4,now()::text)',
      [tenantA, 'Signed Context CI Tenant A', tenantB, 'Signed Context CI Tenant B']
    );
    await owner.query(
      'INSERT INTO public.users(id,email,password_hash,status,created_at) VALUES($1,$2,$3,\'active\',now()::text),($4,$5,$6,\'active\',now()::text)',
      [userA, userA + '@tenant-context.invalid', 'not-a-password-hash', userB, userB + '@tenant-context.invalid', 'not-a-password-hash']
    );
    await owner.query(
      'INSERT INTO public.memberships(user_id,organization_id,role,created_at) VALUES($1,$2,\'member\',now()::text),($3,$4,\'member\',now()::text)',
      [userA, tenantA, userB, tenantB]
    );
    await owner.query(
      'INSERT INTO public.organization_governance(organization_id,status,reason,changed_by,changed_at,version) VALUES($1,\'active\',\'signed-context-ci\',$2,now()::text,1),($3,\'active\',\'signed-context-ci\',$4,now()::text,1)',
      [tenantA, userA, tenantB, userB]
    );
    await owner.query(
      'INSERT INTO public.sessions(id,user_id,organization_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,now()::text),($6,$7,$8,$9,$10,now()::text)',
      [sessionA, userA, tenantA, hashToken(tokenA), expiresAt, sessionB, userB, tenantB, hashToken(tokenB), expiresAt]
    );
    await owner.query(
      'INSERT INTO public.work_orders(id,organization_id,number,title,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,now()::text,now()::text),($6,$7,$8,$9,$10,now()::text,now()::text)',
      [synthetic.workOrderIds[0], tenantA, 'TC-A-' + keyId, 'Signed context tenant A work order', userA,
       synthetic.workOrderIds[1], tenantB, 'TC-B-' + keyId, 'Signed context tenant B work order', userB]
    );
    await owner.query(
      'INSERT INTO opscore_security.context_probe_rows(id,organization_id,probe_value) VALUES($1,$2,$3),($4,$5,$6)',
      ['row-' + sessionA, tenantA, 'proof:' + tenantA, 'row-' + sessionB, tenantB, 'proof:' + tenantB]
    );

    const port = await choosePort();
    const serverEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_ENGINE: 'postgres',
      DATABASE_URL: runtimeUrl,
      OPSC_DATABASE_URL: runtimeUrl,
      HOST: '127.0.0.1',
      PORT: String(port),
      PUBLIC_ORIGIN: 'http://127.0.0.1:' + port,
      AUTH_MODE: 'local',
      VERCEL_ENV: 'preview',
      OPSC_TENANT_CONTEXT_PROOF_ENABLED: 'true',
      OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true',
      OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_TAMPER_TEST: 'true',
      OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex,
      OPSC_TENANT_CONTEXT_KEY_ID: keyId,
      OPSC_PG_SSL_MODE: 'disable'
    };
    delete serverEnv.OPSC_TENANT_CONTEXT_OWNER_URL;
    delete serverEnv.OPSC_PG_ACCEPTANCE_URL;
    delete serverEnv.OPSC_MIGRATION_DATABASE_URL;
    delete serverEnv.OPSC_CI_MIGRATION_OWNER_PASSWORD;
    delete serverEnv.OPSC_PG_TEST_URL;

    serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
      cwd: path.join(__dirname, '..'),
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    for (const stream of [serverProcess.stdout, serverProcess.stderr]) {
      stream.on('data', (chunk) => {
        serverOutput = (serverOutput + chunk.toString('utf8')).slice(-6000);
      });
    }
    await waitForServer(port, serverProcess);

    const httpA = await queryHttp(port, '/api/v1/_internal/tenant-context-proof', tokenA);
    const httpB = await queryHttp(port, '/api/v1/_internal/tenant-context-proof', tokenB);
    for (const [label, response] of [['tenantA', httpA], ['tenantB', httpB]]) {
      if (response.status !== 200 || response.body?.status !== 'PASS'
          || response.body?.signedContextBoundToBackendAndTransaction !== true
          || response.body?.rawGucTamperingIgnored !== true
          || response.body?.visibleProbeRows !== 1) {
        throw new Error('SIGNED_CONTEXT_HTTP_TENANT_PROOF_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          body: response.body,
          serverOutput: serverOutput.slice(-2000)
        }));
      }
    }

    // A real authenticated product route now runs with the transaction-bound
    // assertion. Its own preview-only test switch overwrites every legacy GUC
    // with an attacker-selected Tenant B/backoffice identity before Store runs.
    const signedWorkOrdersA = await queryHttp(port, '/api/v1/work-orders', tokenA);
    const signedWorkOrdersB = await queryHttp(port, '/api/v1/work-orders', tokenB);
    const assertSignedWorkOrders = (label, response, expectedId, expectedTenant) => {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 1
          || rows[0].id !== expectedId
          || rows[0].organization_id !== expectedTenant) {
        throw new Error('SIGNED_CONTEXT_REAL_WORK_ORDER_ROUTE_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          rowCount: Array.isArray(rows) ? rows.length : null,
          returnedIds: Array.isArray(rows) ? rows.map(row => row.id).slice(0, 3) : null,
          serverOutput: serverOutput.slice(-2500)
        }));
      }
    };
    assertSignedWorkOrders('tenantA', signedWorkOrdersA, synthetic.workOrderIds[0], tenantA);
    assertSignedWorkOrders('tenantB', signedWorkOrdersB, synthetic.workOrderIds[1], tenantB);

    // Exercise the distinct item-read route through the same signed transaction
    // contract; the response must remain tenant-scoped after the CI GUC-tamper probe.
    const signedWorkOrderDetailA = await queryHttp(
      port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]), tokenA
    );
    const signedWorkOrderDetailB = await queryHttp(
      port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB
    );
    for (const [label, response, expectedId, expectedTenant] of [
      ['tenantA', signedWorkOrderDetailA, synthetic.workOrderIds[0], tenantA],
      ['tenantB', signedWorkOrderDetailB, synthetic.workOrderIds[1], tenantB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant) {
        throw new Error('SIGNED_CONTEXT_WORK_ORDER_DETAIL_ROUTE_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          returnedId: response.body?.id || null,
          returnedTenant: response.body?.organization_id || null,
          serverOutput: serverOutput.slice(-2500)
        }));
      }
    }

    clientA = new Client({ connectionString: runtimeUrl });
    clientB = new Client({ connectionString: runtimeUrl });
    await clientA.connect();
    await clientB.connect();

    // Without an assertion, raw GUCs alone must expose no rows.
    await clientA.query('BEGIN READ ONLY');
    await tamperRawGucs(clientA, tenantA);
    const unsignedRows = await readProbeRows(clientA, tenantA);
    await clientA.query('COMMIT');
    if (unsignedRows.length !== 0) throw new Error('SIGNED_CONTEXT_UNSIGNED_GUC_EXPOSED_ROWS');

    // A valid READ ONLY assertion remains Tenant A despite raw GUC tampering to Tenant B.
    await clientA.query('BEGIN READ ONLY');
    const identityA = await beginReadOnly(clientA);
    const validA = createSignedTenantContext({
      principal: { sessionId: sessionA, userId: userA, tenantId: tenantA },
      backendPid: identityA.backendPid,
      transactionId: identityA.transactionId,
      env: { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: keyId }
    });
    await bindAssertion(clientA, validA);
    await tamperRawGucs(clientA, tenantB);
    assertSingleTenantRow(await readProbeRows(clientA, tenantA), tenantA);
    await clientA.query('COMMIT');

    // Altering the signature must fail closed.
    await clientA.query('BEGIN READ ONLY');
    const invalidIdentity = await beginReadOnly(clientA);
    const invalid = createSignedTenantContext({
      principal: { sessionId: sessionA, userId: userA, tenantId: tenantA },
      backendPid: invalidIdentity.backendPid,
      transactionId: invalidIdentity.transactionId,
      env: { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: keyId }
    });
    const badSignature = (invalid.signature[0] === '0' ? '1' : '0') + invalid.signature.slice(1);
    await clientA.query(
      "SELECT set_config('app.signed_context_payload',$1,true), set_config('app.signed_context_signature',$2,true)",
      [invalid.payload, badSignature]
    );
    const invalidRows = await readProbeRows(clientA, tenantA);
    await clientA.query('COMMIT');
    if (invalidRows.length !== 0) throw new Error('SIGNED_CONTEXT_INVALID_SIGNATURE_EXPOSED_ROWS');

    // Same-backend replay in a later transaction must be rejected.
    await clientA.query('BEGIN READ ONLY');
    const replayIdentity = await beginReadOnly(clientA);
    const replay = createSignedTenantContext({
      principal: { sessionId: sessionA, userId: userA, tenantId: tenantA },
      backendPid: replayIdentity.backendPid,
      transactionId: replayIdentity.transactionId,
      env: { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: keyId }
    });
    await bindAssertion(clientA, replay);
    assertSingleTenantRow(await readProbeRows(clientA, tenantA), tenantA);
    await clientA.query('COMMIT');
    await clientA.query('BEGIN READ ONLY');
    await bindAssertion(clientA, replay);
    const sameBackendReplayRows = await readProbeRows(clientA, tenantA);
    await clientA.query('COMMIT');
    if (sameBackendReplayRows.length !== 0) throw new Error('SIGNED_CONTEXT_SAME_BACKEND_REPLAY_EXPOSED_ROWS');

    // An assertion created for one backend cannot be replayed on another backend.
    await clientA.query('BEGIN READ ONLY');
    const otherBackendIdentity = await beginReadOnly(clientA);
    const crossBackend = createSignedTenantContext({
      principal: { sessionId: sessionA, userId: userA, tenantId: tenantA },
      backendPid: otherBackendIdentity.backendPid,
      transactionId: otherBackendIdentity.transactionId,
      env: { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: keyId }
    });
    await clientA.query('COMMIT');
    await clientB.query('BEGIN READ ONLY');
    await bindAssertion(clientB, crossBackend);
    const differentBackendRows = await readProbeRows(clientB, tenantA);
    await clientB.query('COMMIT');
    if (differentBackendRows.length !== 0) throw new Error('SIGNED_CONTEXT_DIFFERENT_BACKEND_REPLAY_EXPOSED_ROWS');

    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.signed-tenant-context-ci-proof.v1',
      status: 'PASS',
      checks: {
        tenantAHttpSession: 'PASS',
        tenantBHttpSession: 'PASS',
        signedWorkOrdersTenantA: 'PASS',
        signedWorkOrdersTenantB: 'PASS',
        signedWorkOrderDetailTenantA: 'PASS',
        signedWorkOrderDetailTenantB: 'PASS',
        workOrdersRawGucTamperingIgnored: 'PASS',
        readOnlyBoundTransaction: 'PASS',
        rawGucTampering: 'PASS',
        unsignedGucDenied: 'PASS',
        invalidSignatureDenied: 'PASS',
        sameBackendNextTransactionReplayDenied: 'PASS',
        differentBackendReplayDenied: 'PASS'
      },
      environment: {
        database: 'opscore_http_acceptance',
        ownerRole: 'neondb_owner',
        runtimeRole: 'opscore_runtime',
        runtimeBypassesRls: false
      }
    }) + '\\n');
  } finally {
    if (activeVerifierRole) {
      try { await owner.query('RESET ROLE'); } catch (_) {}
      activeVerifierRole = false;
    }
    if (clientA) { try { await clientA.end(); } catch (_) {} }
    if (clientB) { try { await clientB.end(); } catch (_) {} }
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
    }
    try { await owner.query('DELETE FROM opscore_security.context_probe_rows WHERE organization_id = ANY($1::text[])', [synthetic.tenantIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.work_orders WHERE id = ANY($1::text[])', [synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.sessions WHERE id = ANY($1::text[])', [synthetic.sessionIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.memberships WHERE user_id = ANY($1::text[])', [synthetic.userIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.organization_governance WHERE organization_id = ANY($1::text[])', [synthetic.tenantIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.users WHERE id = ANY($1::text[])', [synthetic.userIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.organizations WHERE id = ANY($1::text[])', [synthetic.tenantIds]); } catch (_) {}
    try { await owner.query('DELETE FROM opscore_security.context_hmac_keys WHERE key_id=$1', [synthetic.keyId]); } catch (_) {}
    try { await owner.query('DROP TABLE IF EXISTS opscore_security.context_probe_rows'); } catch (_) {}
    try { await owner.end(); } catch (_) {}
    try { await runtimeProbe.end(); } catch (_) {}
  }
}

main().catch((error) => {
  process.stderr.write('SIGNED_CONTEXT_POSTGRES_GATE_FAILED:' + String(error && (error.code || error.message) || error).slice(0, 1200) + '\\n');
  process.exitCode = 1;
});
