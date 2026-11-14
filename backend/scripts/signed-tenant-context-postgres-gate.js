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

function queryHttp(port, route, token, options = {}) {
  return new Promise((resolve, reject) => {
    const method = String(options.method || 'GET').toUpperCase();
    const hasBody = options.body !== undefined;
    const requestBody = hasBody ? JSON.stringify(options.body) : '';
    const headers = {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      ...(hasBody ? {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(requestBody, 'utf8'))
      } : {}),
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {})
    };
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: route,
      method,
      headers,
      timeout: 5000
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(responseBody); } catch (_) { /* non-JSON is asserted by caller */ }
        resolve({ status: response.statusCode, headers: response.headers, body: parsed });
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP_ACCEPTANCE_TIMEOUT')));
    request.on('error', reject);
    request.end(requestBody || undefined);
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
    idempotencyKeys: [],
    bulkJobIds: [],
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
      OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true',
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

    const signedReadRouteCases = [
  {
    "key": "completionPackage",
    "suffix": "/completion-package"
  },
  {
    "key": "timeline",
    "suffix": "/timeline"
  },
  {
    "key": "handoff",
    "suffix": "/handoff"
  },
  {
    "key": "operationalRisk",
    "suffix": "/operational-risk"
  },
  {
    "key": "comments",
    "suffix": "/comments"
  },
  {
    "key": "attachments",
    "suffix": "/attachments"
  },
  {
    "key": "dispatchCandidates",
    "suffix": "/dispatch-candidates"
  },
  {
    "key": "parts",
    "suffix": "/parts"
  },
  {
    "key": "signoffs",
    "suffix": "/signoffs"
  },
  {
    "key": "whyBlocked",
    "suffix": "/why-blocked"
  },
  {
    "key": "changelog",
    "suffix": "/changelog"
  },
  {
    "key": "verifiedJobRecord",
    "suffix": "/verified-job-record"
  },
  {
    "key": "workPack",
    "suffix": "/work-pack"
  },
  {
    "key": "completionAssurance",
    "suffix": "/completion-assurance"
  },
  {
    "key": "timeSummary",
    "suffix": "/time-summary"
  },
  {
    "key": "firstTimeRight",
    "suffix": "/first-time-right"
  }
];
    const signedReadRouteProof = {};
    for (const routeCase of signedReadRouteCases) {
      const responseA = await queryHttp(
        port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + routeCase.suffix, tokenA
      );
      const responseB = await queryHttp(
        port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + routeCase.suffix, tokenB
      );
      for (const [tenantLabel, response, foreignWorkOrderId] of [
        ['TenantA', responseA, synthetic.workOrderIds[1]],
        ['TenantB', responseB, synthetic.workOrderIds[0]]
      ]) {
        if (response.status !== 200
            || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
            || response.body === undefined
            || JSON.stringify(response.body).includes(foreignWorkOrderId)) {
          throw new Error('SIGNED_CONTEXT_WORK_ORDER_READ_ROUTE_FAILED:' + JSON.stringify({
            route: routeCase.key,
            tenant: tenantLabel,
            status: response.status,
            signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
            serverOutput: serverOutput.slice(-2500)
          }));
        }
        signedReadRouteProof[routeCase.key + tenantLabel] = 'PASS';
      }

      // A session for one tenant must not retrieve the other tenant's work order.
      const foreignResponse = await queryHttp(
        port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + routeCase.suffix, tokenA
      );
      const foreignWasHidden = foreignResponse.status === 503
        || (foreignResponse.status === 200
          && Array.isArray(foreignResponse.body)
          && foreignResponse.body.length === 0
          && foreignResponse.headers?.['x-opscore-signed-tenant-context'] === 'verified');
      if (!foreignWasHidden
          || (foreignResponse.status === 503 && foreignResponse.headers?.['x-opscore-signed-tenant-context'] === 'verified')) {
        throw new Error('SIGNED_CONTEXT_WORK_ORDER_CROSS_TENANT_READ_EXPOSED:' + JSON.stringify({
          route: routeCase.key,
          status: foreignResponse.status,
          rowCount: Array.isArray(foreignResponse.body) ? foreignResponse.body.length : null,
          signedHeader: foreignResponse.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
      signedReadRouteProof[routeCase.key + 'ForeignTenantDenied'] = 'PASS';
    }

    const signedWriteRouteProof = {};
    const createA = await queryHttp(port, '/api/v1/work-orders', tokenA, {
      method: 'POST',
      body: {
        title: 'Signed write tenant A ' + keyId,
        priority: 'normal',
        organizationId: tenantB
      }
    });
    if (createA.status !== 201
        || createA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createA.body?.organization_id !== tenantA
        || createA.body?.created_by !== userA
        || !createA.body?.id) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createA.status,
        body: createA.body,
        signedHeader: createA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    synthetic.workOrderIds.push(createA.body.id);
    signedWriteRouteProof.createTenantA = 'PASS';
    signedWriteRouteProof.createIgnoresClientTenantClaim = 'PASS';

    const createB = await queryHttp(port, '/api/v1/work-orders', tokenB, {
      method: 'POST',
      body: {
        title: 'Signed write tenant B ' + keyId,
        priority: 'normal',
        organizationId: tenantA
      }
    });
    if (createB.status !== 201
        || createB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createB.body?.organization_id !== tenantB
        || createB.body?.created_by !== userB
        || !createB.body?.id) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createB.status,
        body: createB.body,
        signedHeader: createB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    synthetic.workOrderIds.push(createB.body.id);
    signedWriteRouteProof.createTenantB = 'PASS';

    const updateKeyA = 'signed-context-ci-update-a-' + keyId;
    const updateKeyB = 'signed-context-ci-update-b-' + keyId;
    const updateKeyForeign = 'signed-context-ci-update-foreign-' + keyId;
    synthetic.idempotencyKeys.push(updateKeyA, updateKeyB, updateKeyForeign);
    const updateBodyA = { title: 'Signed update tenant A ' + keyId };
    const updateA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]), tokenA, {
      method: 'PATCH',
      headers: { 'idempotency-key': updateKeyA },
      body: updateBodyA
    });
    if (updateA.status !== 200
        || updateA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || updateA.headers?.['x-idempotency-replayed'] !== 'false'
        || updateA.body?.title !== updateBodyA.title
        || updateA.body?.organization_id !== tenantA) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_PATCH_TENANT_A_FAILED:' + JSON.stringify({
        status: updateA.status,
        body: updateA.body,
        signedHeader: updateA.headers?.['x-opscore-signed-tenant-context'] || null,
        idempotentHeader: updateA.headers?.['x-idempotency-replayed'] || null
      }));
    }
    signedWriteRouteProof.patchTenantA = 'PASS';

    const replayA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]), tokenA, {
      method: 'PATCH',
      headers: { 'idempotency-key': updateKeyA },
      body: updateBodyA
    });
    if (replayA.status !== 200
        || replayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || replayA.headers?.['x-idempotency-replayed'] !== 'true'
        || replayA.body?.title !== updateBodyA.title) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_PATCH_IDEMPOTENCY_REPLAY_FAILED:' + JSON.stringify({
        status: replayA.status,
        body: replayA.body,
        signedHeader: replayA.headers?.['x-opscore-signed-tenant-context'] || null,
        idempotentHeader: replayA.headers?.['x-idempotency-replayed'] || null,
        requestIdempotencyKey: updateKeyA,
        originalStatus: updateA.status,
        originalBody: updateA.body
      }));
    }
    signedWriteRouteProof.patchIdempotencyReplay = 'PASS';

    const updateBodyB = { title: 'Signed update tenant B ' + keyId };
    const updateB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB, {
      method: 'PATCH',
      headers: { 'idempotency-key': updateKeyB },
      body: updateBodyB
    });
    if (updateB.status !== 200
        || updateB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || updateB.body?.title !== updateBodyB.title
        || updateB.body?.organization_id !== tenantB) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_PATCH_TENANT_B_FAILED:' + JSON.stringify({
        status: updateB.status,
        body: updateB.body,
        signedHeader: updateB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.patchTenantB = 'PASS';

    const foreignPatch = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenA, {
      method: 'PATCH',
      headers: { 'idempotency-key': updateKeyForeign },
      body: { title: 'FORGED TENANT A UPDATE ' + keyId }
    });
    if (foreignPatch.status !== 404
        || foreignPatch.body?.error?.code !== 'NOT_FOUND'
        || foreignPatch.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_PATCH_NOT_DENIED:' + JSON.stringify({
        status: foreignPatch.status,
        body: foreignPatch.body,
        signedHeader: foreignPatch.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const unchangedB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB);
    if (unchangedB.status !== 200
        || unchangedB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || unchangedB.body?.title !== updateBodyB.title
        || unchangedB.body?.organization_id !== tenantB) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_PATCH_CHANGED_FOREIGN_ROW');
    }
    signedWriteRouteProof.crossTenantPatchDenied = 'PASS';
    signedWriteRouteProof.crossTenantPatchLeftForeignRowUnchanged = 'PASS';

    const commentKeyA = 'signed-context-ci-comment-a-' + keyId;
    const commentKeyB = 'signed-context-ci-comment-b-' + keyId;
    const commentKeyForeign = 'signed-context-ci-comment-foreign-' + keyId;
    synthetic.idempotencyKeys.push(commentKeyA, commentKeyB, commentKeyForeign);
    const commentA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/comments', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': commentKeyA },
      body: { body: 'Signed-context tenant A comment ' + keyId }
    });
    if (commentA.status !== 201
        || commentA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || commentA.body?.organization_id !== tenantA
        || commentA.body?.work_order_id !== synthetic.workOrderIds[0]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_COMMENT_TENANT_A_FAILED:' + JSON.stringify({
        status: commentA.status,
        body: commentA.body,
        signedHeader: commentA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.commentTenantA = 'PASS';

    const commentB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/comments', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': commentKeyB },
      body: { body: 'Signed-context tenant B comment ' + keyId }
    });
    if (commentB.status !== 201
        || commentB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || commentB.body?.organization_id !== tenantB
        || commentB.body?.work_order_id !== synthetic.workOrderIds[1]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_COMMENT_TENANT_B_FAILED:' + JSON.stringify({
        status: commentB.status,
        body: commentB.body,
        signedHeader: commentB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.commentTenantB = 'PASS';

    const foreignCommentText = 'FORGED TENANT A COMMENT ' + keyId;
    const foreignComment = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/comments', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': commentKeyForeign },
      body: { body: foreignCommentText }
    });
    if (foreignComment.status !== 404
        || foreignComment.body?.error?.code !== 'NOT_FOUND'
        || foreignComment.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_COMMENT_NOT_DENIED:' + JSON.stringify({
        status: foreignComment.status,
        body: foreignComment.body,
        signedHeader: foreignComment.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const commentsB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/comments', tokenB);
    if (commentsB.status !== 200
        || commentsB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || !Array.isArray(commentsB.body)
        || commentsB.body.some(row => row.body === foreignCommentText)) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_COMMENT_PERSISTED');
    }
    signedWriteRouteProof.crossTenantCommentDenied = 'PASS';
    signedWriteRouteProof.crossTenantCommentNotPersisted = 'PASS';

    // Bulk writes must carry the same transaction-bound assertion as single-item writes.
    // This also proves that the endpoint retains its per-item NOT_FOUND semantics and
    // cannot mutate a different tenant's work order.
    const bulkKeyA = 'signed-context-ci-bulk-a-' + keyId;
    const bulkKeyB = 'signed-context-ci-bulk-b-' + keyId;
    const bulkKeyForeign = 'signed-context-ci-bulk-foreign-' + keyId;
    synthetic.idempotencyKeys.push(bulkKeyA, bulkKeyB, bulkKeyForeign);
    const bulkBodyA = {
      workOrderIds: [synthetic.workOrderIds[0]],
      operation: 'priority',
      value: 'urgent'
    };
    const bulkA = await queryHttp(port, '/api/v1/work-orders/bulk', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': bulkKeyA },
      body: bulkBodyA
    });
    if (bulkA.status !== 200
        || bulkA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || bulkA.body?.schemaVersion !== 'opscore.bulk-work-order.v1'
        || bulkA.body?.operation !== 'priority'
        || bulkA.body?.requestedCount !== 1
        || bulkA.body?.affectedCount !== 1
        || bulkA.body?.failedCount !== 0
        || !bulkA.body?.jobId) {
      throw new Error('SIGNED_CONTEXT_BULK_WORK_ORDER_TENANT_A_FAILED:' + JSON.stringify({
        status: bulkA.status, body: bulkA.body,
        signedHeader: bulkA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    synthetic.bulkJobIds.push(bulkA.body.jobId);
    signedWriteRouteProof.bulkTenantA = 'PASS';

    const bulkReplayA = await queryHttp(port, '/api/v1/work-orders/bulk', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': bulkKeyA },
      body: bulkBodyA
    });
    if (bulkReplayA.status !== 200
        || bulkReplayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || bulkReplayA.body?.jobId !== bulkA.body.jobId
        || bulkReplayA.body?.affectedCount !== 1
        || bulkReplayA.body?.failedCount !== 0) {
      throw new Error('SIGNED_CONTEXT_BULK_WORK_ORDER_IDEMPOTENCY_REPLAY_FAILED:' + JSON.stringify({
        status: bulkReplayA.status, body: bulkReplayA.body,
        originalJobId: bulkA.body?.jobId,
        signedHeader: bulkReplayA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.bulkIdempotencyReplay = 'PASS';

    const bulkBodyB = {
      workOrderIds: [synthetic.workOrderIds[1]],
      operation: 'priority',
      value: 'high'
    };
    const bulkB = await queryHttp(port, '/api/v1/work-orders/bulk', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': bulkKeyB },
      body: bulkBodyB
    });
    if (bulkB.status !== 200
        || bulkB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || bulkB.body?.requestedCount !== 1
        || bulkB.body?.affectedCount !== 1
        || bulkB.body?.failedCount !== 0
        || !bulkB.body?.jobId) {
      throw new Error('SIGNED_CONTEXT_BULK_WORK_ORDER_TENANT_B_FAILED:' + JSON.stringify({
        status: bulkB.status, body: bulkB.body,
        signedHeader: bulkB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    synthetic.bulkJobIds.push(bulkB.body.jobId);
    signedWriteRouteProof.bulkTenantB = 'PASS';

    const foreignBulk = await queryHttp(port, '/api/v1/work-orders/bulk', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': bulkKeyForeign },
      body: {
        workOrderIds: [synthetic.workOrderIds[1]],
        operation: 'priority',
        value: 'low'
      }
    });
    if (foreignBulk.status !== 200
        || foreignBulk.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || foreignBulk.body?.requestedCount !== 1
        || foreignBulk.body?.affectedCount !== 0
        || foreignBulk.body?.failedCount !== 1
        || foreignBulk.body?.failures?.length !== 1
        || foreignBulk.body?.failures[0]?.id !== synthetic.workOrderIds[1]
        || foreignBulk.body?.failures[0]?.code !== 'NOT_FOUND'
        || !foreignBulk.body?.jobId) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_BULK_NOT_REJECTED:' + JSON.stringify({
        status: foreignBulk.status, body: foreignBulk.body,
        signedHeader: foreignBulk.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    synthetic.bulkJobIds.push(foreignBulk.body.jobId);
    const bulkBUnchanged = await queryHttp(
      port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB
    );
    if (bulkBUnchanged.status !== 200
        || bulkBUnchanged.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || bulkBUnchanged.body?.priority !== 'high'
        || bulkBUnchanged.body?.organization_id !== tenantB) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_BULK_CHANGED_FOREIGN_ROW:' + JSON.stringify({
        status: bulkBUnchanged.status, body: bulkBUnchanged.body
      }));
    }
    signedWriteRouteProof.crossTenantBulkFailedNotFound = 'PASS';
    signedWriteRouteProof.crossTenantBulkLeftForeignRowUnchanged = 'PASS';

    const transitionKeyA = 'signed-context-ci-transition-a-' + keyId;
    const transitionKeyB = 'signed-context-ci-transition-b-' + keyId;
    const transitionKeyForeign = 'signed-context-ci-transition-foreign-' + keyId;
    synthetic.idempotencyKeys.push(transitionKeyA, transitionKeyB, transitionKeyForeign);
    const transitionA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/transition', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': transitionKeyA },
      body: { toStatus: 'in_progress', reason: 'CI signed tenant transition A' }
    });
    if (transitionA.status !== 200
        || transitionA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || transitionA.headers?.['x-idempotency-replayed'] !== 'false'
        || transitionA.body?.status !== 'in_progress'
        || transitionA.body?.organization_id !== tenantA) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_TRANSITION_TENANT_A_FAILED:' + JSON.stringify({
        status: transitionA.status, body: transitionA.body,
        signedHeader: transitionA.headers?.['x-opscore-signed-tenant-context'] || null,
        idempotentHeader: transitionA.headers?.['x-idempotency-replayed'] || null
      }));
    }
    signedWriteRouteProof.transitionTenantA = 'PASS';

    const transitionReplayA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/transition', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': transitionKeyA },
      body: { toStatus: 'in_progress', reason: 'CI signed tenant transition A' }
    });
    if (transitionReplayA.status !== 200
        || transitionReplayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || transitionReplayA.headers?.['x-idempotency-replayed'] !== 'true'
        || transitionReplayA.body?.status !== 'in_progress') {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_TRANSITION_IDEMPOTENCY_REPLAY_FAILED:' + JSON.stringify({
        status: transitionReplayA.status, body: transitionReplayA.body,
        signedHeader: transitionReplayA.headers?.['x-opscore-signed-tenant-context'] || null,
        idempotentHeader: transitionReplayA.headers?.['x-idempotency-replayed'] || null
      }));
    }
    signedWriteRouteProof.transitionIdempotencyReplay = 'PASS';

    const transitionB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/transition', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': transitionKeyB },
      body: { toStatus: 'in_progress', reason: 'CI signed tenant transition B' }
    });
    if (transitionB.status !== 200
        || transitionB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || transitionB.body?.status !== 'in_progress'
        || transitionB.body?.organization_id !== tenantB) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_TRANSITION_TENANT_B_FAILED:' + JSON.stringify({
        status: transitionB.status, body: transitionB.body,
        signedHeader: transitionB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.transitionTenantB = 'PASS';

    const foreignTransition = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/transition', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': transitionKeyForeign },
      body: { toStatus: 'blocked', reason: 'FORGED CROSS TENANT TRANSITION' }
    });
    if (foreignTransition.status !== 404
        || foreignTransition.body?.error?.code !== 'NOT_FOUND'
        || foreignTransition.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_TRANSITION_NOT_DENIED:' + JSON.stringify({
        status: foreignTransition.status, body: foreignTransition.body,
        signedHeader: foreignTransition.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const transitionBUnchanged = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB);
    if (transitionBUnchanged.status !== 200
        || transitionBUnchanged.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || transitionBUnchanged.body?.status !== 'in_progress'
        || transitionBUnchanged.body?.organization_id !== tenantB) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_TRANSITION_CHANGED_FOREIGN_ROW');
    }
    signedWriteRouteProof.crossTenantTransitionDenied = 'PASS';
    signedWriteRouteProof.crossTenantTransitionLeftForeignRowUnchanged = 'PASS';

    const deleteA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]), tokenA, { method: 'DELETE' });
    if (deleteA.status !== 200
        || deleteA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || deleteA.body?.deleted !== true
        || deleteA.body?.entityType !== 'work_order'
        || deleteA.body?.entityId !== synthetic.workOrderIds[0]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_DELETE_TENANT_A_FAILED:' + JSON.stringify({
        status: deleteA.status, body: deleteA.body,
        signedHeader: deleteA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.deleteTenantA = 'PASS';

    const foreignDelete = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenA, { method: 'DELETE' });
    if (foreignDelete.status !== 404
        || foreignDelete.body?.error?.code !== 'NOT_FOUND'
        || foreignDelete.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_DELETE_NOT_DENIED:' + JSON.stringify({
        status: foreignDelete.status, body: foreignDelete.body,
        signedHeader: foreignDelete.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const foreignDeleteState = await owner.query(
      "SELECT COUNT(*)::int AS active_deletions FROM public.deleted_records WHERE organization_id=$1 AND entity_type='work_order' AND entity_id=$2 AND restored_at IS NULL",
      [tenantB, synthetic.workOrderIds[1]]
    );
    if (foreignDeleteState.rows[0]?.active_deletions !== 0) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_DELETE_CREATED_FOREIGN_MARKER');
    }
    signedWriteRouteProof.crossTenantDeleteDenied = 'PASS';
    signedWriteRouteProof.crossTenantDeleteNoForeignMarker = 'PASS';

    const deleteB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]), tokenB, { method: 'DELETE' });
    if (deleteB.status !== 200
        || deleteB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || deleteB.body?.deleted !== true
        || deleteB.body?.entityId !== synthetic.workOrderIds[1]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_DELETE_TENANT_B_FAILED:' + JSON.stringify({
        status: deleteB.status, body: deleteB.body,
        signedHeader: deleteB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.deleteTenantB = 'PASS';

    const foreignRestore = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/restore', tokenA, {
      method: 'POST'
    });
    if (foreignRestore.status !== 404
        || foreignRestore.body?.error?.code !== 'NOT_FOUND'
        || foreignRestore.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_RESTORE_NOT_DENIED:' + JSON.stringify({
        status: foreignRestore.status, body: foreignRestore.body,
        signedHeader: foreignRestore.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const foreignRestoreState = await owner.query(
      "SELECT COUNT(*)::int AS active_deletions FROM public.deleted_records WHERE organization_id=$1 AND entity_type='work_order' AND entity_id=$2 AND restored_at IS NULL",
      [tenantB, synthetic.workOrderIds[1]]
    );
    if (foreignRestoreState.rows[0]?.active_deletions !== 1) {
      throw new Error('SIGNED_CONTEXT_CROSS_TENANT_RESTORE_CHANGED_FOREIGN_MARKER');
    }
    signedWriteRouteProof.crossTenantRestoreDenied = 'PASS';
    signedWriteRouteProof.crossTenantRestoreLeftForeignMarker = 'PASS';

    const restoreA = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/restore', tokenA, {
      method: 'POST'
    });
    if (restoreA.status !== 200
        || restoreA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || restoreA.body?.restored !== true
        || restoreA.body?.entityId !== synthetic.workOrderIds[0]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_RESTORE_TENANT_A_FAILED:' + JSON.stringify({
        status: restoreA.status, body: restoreA.body,
        signedHeader: restoreA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.restoreTenantA = 'PASS';

    const restoreB = await queryHttp(port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/restore', tokenB, {
      method: 'POST'
    });
    if (restoreB.status !== 200
        || restoreB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || restoreB.body?.restored !== true
        || restoreB.body?.entityId !== synthetic.workOrderIds[1]) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_RESTORE_TENANT_B_FAILED:' + JSON.stringify({
        status: restoreB.status, body: restoreB.body,
        signedHeader: restoreB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedWriteRouteProof.restoreTenantB = 'PASS';

    const restoredMarkers = await owner.query(
      "SELECT COUNT(*)::int AS active_deletions FROM public.deleted_records WHERE organization_id = ANY($1::text[]) AND entity_type='work_order' AND entity_id = ANY($2::text[]) AND restored_at IS NULL",
      [synthetic.tenantIds, [synthetic.workOrderIds[0], synthetic.workOrderIds[1]]]
    );
    if (restoredMarkers.rows[0]?.active_deletions !== 0) {
      throw new Error('SIGNED_CONTEXT_WORK_ORDER_RESTORE_MARKERS_REMAIN_ACTIVE');
    }
    signedWriteRouteProof.restoreBothMarkersCleared = 'PASS';

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
        signedWorkOrderSubresourceReads: signedReadRouteProof,
        signedWorkOrderWrites: signedWriteRouteProof,
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

    try { await owner.query('DELETE FROM public.comments WHERE organization_id = ANY($1::text[]) AND work_order_id = ANY($2::text[])', [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query("DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='work_order' AND entity_id = ANY($2::text[])", [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query("DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND resource_type='work_order' AND resource_id = ANY($2::text[])", [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.work_order_sla WHERE organization_id = ANY($1::text[]) AND work_order_id = ANY($2::text[])', [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.work_order_bulk_jobs WHERE organization_id = ANY($1::text[]) AND id = ANY($2::text[])', [synthetic.tenantIds, synthetic.bulkJobIds]); } catch (_) {}
    try { await owner.query("DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND resource_type='work_order_bulk_job' AND resource_id = ANY($2::text[])", [synthetic.tenantIds, synthetic.bulkJobIds]); } catch (_) {}
    try { await owner.query("DELETE FROM public.deleted_records WHERE organization_id = ANY($1::text[]) AND entity_type='work_order' AND entity_id = ANY($2::text[])", [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.workflow_transition_log WHERE organization_id = ANY($1::text[]) AND entity_id = ANY($2::text[])', [synthetic.tenantIds, synthetic.workOrderIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.idempotency_records WHERE organization_id = ANY($1::text[]) AND idempotency_key = ANY($2::text[])', [synthetic.tenantIds, synthetic.idempotencyKeys]); } catch (_) {}
    try { await owner.query('DELETE FROM public.operation_envelopes WHERE organization_id = ANY($1::text[]) AND idempotency_key = ANY($2::text[])', [synthetic.tenantIds, synthetic.idempotencyKeys]); } catch (_) {}
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
