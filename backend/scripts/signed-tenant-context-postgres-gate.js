'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { createPostgresPool } = require('../src/adapters/postgres');
const { withSignedTenantClient } = require('../src/postgres-runtime');
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

function candidateOrigin(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new Error('CANDIDATE_HTTP_ORIGIN_INVALID'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:'
      || !host.startsWith('opscore-platform-')
      || !host.endsWith('-mosamiryamany-1692.vercel.app')
      || host === 'opscore-platform.vercel.app'
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CANDIDATE_HTTP_ORIGIN_NOT_UNALIASED_VERCEL_DEPLOYMENT');
  }
  return url.origin;
}

function validateCandidateProbeEnvironment(env = process.env) {
  const origin = candidateOrigin(env.OPSC_SIGNED_CONTEXT_CANDIDATE_HTTP_ORIGIN);
  const probeToken = String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || '').trim();
  const oidcToken = String(env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(probeToken)) throw new Error('CANDIDATE_PROBE_TOKEN_REQUIRED');
  if (oidcToken.split('.').length !== 3) throw new Error('CANDIDATE_VERCEL_OIDC_TOKEN_REQUIRED');
  if (String(env.VERCEL_ENV || '') !== 'production'
      || String(env.OPSC_PRODUCTION_HOLD || '').toLowerCase() !== 'true'
      || String(env.OPSC_RELEASE_VERIFIED || '').toLowerCase() !== 'false'
      || String(env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').toLowerCase() !== 'true'
      || String(env.OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED || 'false').toLowerCase() === 'true'
      || String(env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED || 'false').toLowerCase() === 'true') {
    throw new Error('CANDIDATE_PROBE_RUNTIME_NOT_FAIL_CLOSED');
  }
  return origin;
}

async function neonApi(pathname, apiKey) {
  const response = await fetch('https://console.neon.tech/api/v2' + pathname, {
    method: 'GET',
    headers: { accept: 'application/json', authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('NEON_API_REJECTED:' + response.status);
  try { return JSON.parse(raw); } catch { throw new Error('NEON_API_RESPONSE_INVALID'); }
}

async function candidateDatabaseUrl(roleName, config) {
  const query = new URLSearchParams({
    branch_id: config.branchId,
    database_name: config.databaseName,
    role_name: roleName,
    pooled: 'false'
  });
  const result = await neonApi('/projects/' + encodeURIComponent(config.projectId)
    + '/connection_uri?' + query.toString(), config.apiKey);
  const connectionString = String(result.uri || '').trim();
  if (!connectionString) throw new Error('NEON_CONNECTION_URI_MISSING:' + roleName);
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || decodeURIComponent(url.pathname.replace(/^\\/+/, '')) !== config.databaseName
      || decodeURIComponent(url.username) !== roleName
      || url.hostname.toLowerCase().includes('-pooler.')) {
    throw new Error('NEON_CONNECTION_URI_IDENTITY_INVALID:' + roleName);
  }
  const endpointId = url.hostname.toLowerCase().split('.')[0].replace(/-pooler$/, '');
  if (!/^ep-[a-z0-9-]+$/.test(endpointId)) throw new Error('NEON_ENDPOINT_ID_INVALID');
  const endpointsPayload = await neonApi('/projects/' + encodeURIComponent(config.projectId)
    + '/endpoints?limit=100', config.apiKey);
  const hits = (Array.isArray(endpointsPayload.endpoints) ? endpointsPayload.endpoints : [])
    .filter(endpoint => String(endpoint.id || '') === endpointId);
  if (hits.length !== 1) throw new Error('NEON_ENDPOINT_NOT_UNIQUELY_RESOLVED');
  const endpoint = hits[0];
  const apiHost = String(endpoint.host || (endpoint.hosts && endpoint.hosts.read_write_host) || '').trim().toLowerCase();
  const normalizedApiHost = apiHost.replace(/-pooler(?=\\.)/, '');
  const normalizedConnectionHost = url.hostname.toLowerCase().replace(/-pooler(?=\\.)/, '');
  if (String(endpoint.project_id || '') !== config.projectId
      || String(endpoint.branch_id || '') !== config.branchId
      || normalizedApiHost !== normalizedConnectionHost
      || String(endpoint.type || '').toLowerCase() !== 'read_write') {
    throw new Error('NEON_ENDPOINT_PROJECT_BRANCH_HOST_OR_TYPE_MISMATCH');
  }
  return connectionString;
}

async function queryHttp(port, route, token, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined;
  const requestBody = hasBody ? JSON.stringify(options.body) : '';
  const baseHeaders = {
    authorization: 'Bearer ' + token,
    accept: 'application/json',
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
    ...(options.headers && typeof options.headers === 'object' ? options.headers : {})
  };

  if (typeof port === 'string') {
    const headers = {
      ...baseHeaders,
      'x-opscore-signed-context-probe': String(process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || ''),
      'x-vercel-trusted-oidc-idp-token': String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '')
    };
    if (!/^[a-f0-9]{64}$/i.test(headers['x-opscore-signed-context-probe'])) {
      throw new Error('CANDIDATE_PROBE_TOKEN_INVALID');
    }
    if (headers['x-vercel-trusted-oidc-idp-token'].split('.').length !== 3) {
      throw new Error('CANDIDATE_VERCEL_OIDC_TOKEN_INVALID');
    }
    const target = new URL(String(route || ''), port);
    if (target.origin !== port || !target.pathname.startsWith('/api/')) {
      throw new Error('CANDIDATE_HTTP_ROUTE_ORIGIN_INVALID');
    }
    const response = await fetch(target, {
      method,
      headers,
      body: hasBody ? requestBody : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000)
    });
    const responseBody = await response.text();
    if (Buffer.byteLength(responseBody, 'utf8') > 1024 * 1024) {
      throw new Error('CANDIDATE_HTTP_RESPONSE_TOO_LARGE');
    }
    let parsed = null;
    try { parsed = responseBody ? JSON.parse(responseBody) : null; } catch (_) {}
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parsed };
  }

  return new Promise((resolve, reject) => {
    const headers = {
      ...baseHeaders,
      ...(hasBody ? { 'content-length': String(Buffer.byteLength(requestBody, 'utf8')) } : {})
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
  const candidateMode = String(process.env.OPSC_SIGNED_CONTEXT_CANDIDATE_MODE || '').trim().toLowerCase() === 'true';
  let ownerUrl = process.env.OPSC_TENANT_CONTEXT_OWNER_URL;
  let runtimeUrl = process.env.OPSC_PG_ACCEPTANCE_URL;
  let remoteHttpOrigin = null;

  if (candidateMode) {
    remoteHttpOrigin = validateCandidateProbeEnvironment(process.env);
    const config = {
      projectId: String(process.env.NEON_PROJECT_ID || '').trim(),
      branchId: String(process.env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim(),
      databaseName: String(process.env.OPSC_PRODUCTION_DATABASE_NAME || '').trim(),
      apiKey: String(process.env.NEON_API_KEY || '').trim()
    };
    if (!config.projectId || !config.branchId || !config.databaseName || !config.apiKey) {
      throw new Error('CANDIDATE_NEON_TARGET_EXPECTATIONS_REQUIRED');
    }
    ownerUrl = await candidateDatabaseUrl('neondb_owner', config);
    runtimeUrl = await candidateDatabaseUrl('opscore_runtime', config);
  } else {
    requireLocalAcceptanceUrl(ownerUrl, 'neondb_owner', 'OWNER');
    requireLocalAcceptanceUrl(runtimeUrl, 'opscore_runtime', 'RUNTIME');
  }

  const owner = new Client({ connectionString: ownerUrl });
  const runtimeProbe = candidateMode ? null : new Client({ connectionString: runtimeUrl });
  let serverProcess = null;
  let serverOutput = '';
  let clientA = null;
  let clientB = null;
  let signedContextPool = null;
  let activeVerifierRole = false;
  let evidenceRoot = null;
  let evidenceRollbackTriggerInstalled = false;
  const signedSessionAutobindHttpProof = {};

  const keyId = (candidateMode ? 'probe-' : 'ci-') + crypto.randomUUID();
  const key = candidateMode ? null : crypto.randomBytes(32);
  const keyHex = key ? key.toString('hex') : null;
  const priorSigningKey = process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
  const priorSigningKeyId = process.env.OPSC_TENANT_CONTEXT_KEY_ID;
  if (!candidateMode) {
    process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = keyHex;
    process.env.OPSC_TENANT_CONTEXT_KEY_ID = keyId;
  }
  const tenantA = 'tc_org_a_' + crypto.randomUUID().replace(/-/g, '');
  const tenantB = 'tc_org_b_' + crypto.randomUUID().replace(/-/g, '');
  const userA = 'tc_user_a_' + crypto.randomUUID().replace(/-/g, '');
  const userB = 'tc_user_b_' + crypto.randomUUID().replace(/-/g, '');
  const sessionA = 'tc_session_a_' + crypto.randomUUID().replace(/-/g, '');
  const sessionB = 'tc_session_b_' + crypto.randomUUID().replace(/-/g, '');
  const tokenA = crypto.randomBytes(32).toString('hex');
  const tokenB = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const siteCleanupErrors = [];
  const geofenceCleanupErrors = [];
  const appointmentCleanupErrors = [];
  const businessCleanupErrors = [];
  const trailCleanupErrors = [];
  const technicianCleanupErrors = [];
  const assetCleanupErrors = [];
  let syntheticAssetEventIds = [];
  const customerCleanupErrors = [];
  const serviceLineCleanupErrors = [];
  const synthetic = {
    tenantIds: [tenantA, tenantB],
    userIds: [userA, userB],
    sessionIds: [sessionA, sessionB],
    workOrderIds: ['tc_wo_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_wo_b_' + crypto.randomUUID().replace(/-/g, '')],
    customerIds: ['tc_customer_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_customer_b_' + crypto.randomUUID().replace(/-/g, '')],
    siteIds: ['tc_site_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_site_b_' + crypto.randomUUID().replace(/-/g, '')],
    geofenceIds: [],
    dynamicGeofenceIds: [],
    dynamicGeofenceSourceEventIds: [],
    operationalConfigKeys: [],
    serviceLineIds: ['tc_line_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_line_b_' + crypto.randomUUID().replace(/-/g, '')],
    appointmentIds: [],
    trailPointIds: [],
    trailClientEventIds: [],
    assetIds: ['tc_asset_a_' + crypto.randomUUID().replace(/-/g, ''), 'tc_asset_b_' + crypto.randomUUID().replace(/-/g, '')],
    idempotencyKeys: [],
    bulkJobIds: [],
    evidenceUploadIds: [],
    attachmentIds: [],
    keyId
  };

  try {
    await owner.connect();
    if (runtimeProbe) await runtimeProbe.connect();

    const ownerIdentity = await owner.query('SELECT current_user AS role_name, current_database() AS database_name');
    if (ownerIdentity.rows[0].role_name !== 'neondb_owner'
        || ownerIdentity.rows[0].database_name !== (candidateMode
          ? String(process.env.OPSC_PRODUCTION_DATABASE_NAME || '')
          : 'opscore_http_acceptance')) {
      throw new Error('SIGNED_CONTEXT_OWNER_DATABASE_IDENTITY_INVALID');
    }
    if (runtimeProbe) {
      const runtimeIdentity = await runtimeProbe.query(
        "SELECT current_user AS role_name, current_database() AS database_name, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls"
      );
      if (runtimeIdentity.rows[0].role_name !== 'opscore_runtime'
          || runtimeIdentity.rows[0].database_name !== 'opscore_http_acceptance'
          || runtimeIdentity.rows[0].bypass_rls !== false) {
        throw new Error('SIGNED_CONTEXT_RUNTIME_DATABASE_IDENTITY_INVALID');
      }
    }

    if (!candidateMode) {
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
  
  
    }

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
      'INSERT INTO public.customers(id,organization_id,name,email,phone,external_ref,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,\'active\',now()::text,now()::text),($7,$8,$9,$10,$11,$12,\'active\',now()::text,now()::text)',
      [synthetic.customerIds[0], tenantA, 'Signed Context Customer A', userA + '@customer.invalid', null, null, synthetic.customerIds[1], tenantB, 'Signed Context Customer B', userB + '@customer.invalid', null, null]
    );
    // Real service-line tenant fixtures. Created by the owner role in the disposable PostgreSQL DB.
    await owner.query(
      'INSERT INTO public.service_lines(id,organization_id,code,name,service_ref,active,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,1,$6,now()::text,now()::text),($7,$8,$9,$10,$11,1,$12,now()::text,now()::text)',
      [
        synthetic.serviceLineIds[0], tenantA, 'TC-A-' + keyId, 'Tenant A CI Service Line', 'tc-service-a-' + keyId, userA,
        synthetic.serviceLineIds[1], tenantB, 'TC-B-' + keyId, 'Tenant B CI Service Line', 'tc-service-b-' + keyId, userB
      ]
    );
    if (!candidateMode) {
      await owner.query(
        'INSERT INTO opscore_security.context_probe_rows(id,organization_id,probe_value) VALUES($1,$2,$3),($4,$5,$6)',
        ['row-' + sessionA, tenantA, 'proof:' + tenantA, 'row-' + sessionB, tenantB, 'proof:' + tenantB]
      );
    }

    // Real product relation fixtures for the non-work-orders signed vertical slice.
    // The assets list query joins assets -> sites; both relations carry organization_id
    // and have FORCE ROW LEVEL SECURITY on the Preview schema.
    await owner.query(
      'INSERT INTO public.sites(id,organization_id,customer_id,name,address,latitude,longitude,geojson,external_ref,created_at,updated_at) VALUES($1,$2,$3,$4,NULL,NULL,NULL,NULL,NULL,now()::text,now()::text),($5,$6,$7,$8,NULL,NULL,NULL,NULL,NULL,now()::text,now()::text)',
      [synthetic.siteIds[0], tenantA, synthetic.customerIds[0], 'Signed Context Site A',
       synthetic.siteIds[1], tenantB, synthetic.customerIds[1], 'Signed Context Site B']
    );
    await owner.query(
      'INSERT INTO public.assets(id,organization_id,name,asset_type,external_ref,status,site_id,created_at,updated_at) VALUES($1,$2,$3,$4,NULL,$5,$6,now()::text,now()::text),($7,$8,$9,$10,NULL,$11,$12,now()::text,now()::text)',
      [synthetic.assetIds[0], tenantA, 'Signed Context Asset A', 'network_asset', 'active', synthetic.siteIds[0],
       synthetic.assetIds[1], tenantB, 'Signed Context Asset B', 'network_asset', 'active', synthetic.siteIds[1]]
    );

    let secondaryPoolProof = { status: 'SKIPPED_CANDIDATE_REMOTE' };
    if (!candidateMode) {
      // The knowledge service uses a secondary node-postgres Pool, not the main
      // synchronous bridge. Prove that this independent connection also binds a
      // signed principal to its own backend/xid and ignores forged legacy GUCs.
      signedContextPool = createPostgresPool({ connectionString: runtimeUrl, max: 2 });
      secondaryPoolProof = {};
      for (const [label, principal, expectedTenant, foreignTenant] of [
        ['tenantA', { sessionId: sessionA, userId: userA, tenantId: tenantA }, tenantA, tenantB],
        ['tenantB', { sessionId: sessionB, userId: userB, tenantId: tenantB }, tenantB, tenantA]
      ]) {
        const rows = await withSignedTenantClient(signedContextPool, principal, async (client) => {
          await client.query(
            "SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true), set_config('app.access_mode',$3,true)",
            [foreignTenant, 'forged-secondary-pool-user', 'backoffice']
          );
          return (await client.query(
            'SELECT id, organization_id, probe_value FROM opscore_security.context_probe_rows ORDER BY id'
          )).rows;
        });
        if (rows.length !== 1 || rows[0].organization_id !== expectedTenant
            || rows[0].id !== 'row-' + (label === 'tenantA' ? sessionA : sessionB)) {
          throw new Error('SIGNED_SECONDARY_POOL_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
            label, returnedTenants: rows.map(row => row.organization_id), returnedIds: rows.map(row => row.id)
          }));
        }
        secondaryPoolProof[label] = 'PASS';
      }
      secondaryPoolProof.rawGucTamperingIgnored = 'PASS';
  
  
    }

    let port;
    if (candidateMode) {
      port = remoteHttpOrigin;
    } else {
      port = await choosePort();
      evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-signed-evidence-root-'));
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
        OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
        OPSC_TENANT_CONTEXT_PROOF_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_ASSETS_READ_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_WRITE_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_TAMPER_TEST: 'true',
        OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_TAMPER_TEST: 'true',
        OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex,
        OPSC_TENANT_CONTEXT_KEY_ID: keyId,
        OPSC_RELEASE_VERIFICATION_ROOT: evidenceRoot,
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
  
  
    }

    // Exercise a normal authenticated Store route outside the work-order allowlist.
    // The PostgreSQL worker tampers legacy tenant/user/access-mode GUCs after the
    // HMAC assertion is bound, but before each statement executes.
    const signedCustomersA = await queryHttp(port, '/api/v1/customers', tokenA);
    const signedCustomersB = await queryHttp(port, '/api/v1/customers', tokenB);
    const assertSessionAutobindCustomers = (label, response, expectedId, foreignId, expectedTenant) => {
      const rows = response.body;
      if (response.status !== 200
          || !Array.isArray(rows)
          || rows.length !== 1
          || rows[0].id !== expectedId
          || rows[0].organization_id !== expectedTenant
          || rows.some(row => row.id === foreignId)) {
        throw new Error('SIGNED_SESSION_AUTOBIND_CUSTOMER_ROUTE_FAILED:' + JSON.stringify({
          label, status: response.status,
          returnedIds: Array.isArray(rows) ? rows.map(row => row.id).slice(0, 5) : null,
          returnedTenants: Array.isArray(rows) ? rows.map(row => row.organization_id).slice(0, 5) : null,
          serverOutput: serverOutput.slice(-2500)
        }));
      }
    };
    assertSessionAutobindCustomers('tenantA', signedCustomersA, synthetic.customerIds[0], synthetic.customerIds[1], tenantA);
    assertSessionAutobindCustomers('tenantB', signedCustomersB, synthetic.customerIds[1], synthetic.customerIds[0], tenantB);
    signedSessionAutobindHttpProof.customersTenantA = 'PASS';
    signedSessionAutobindHttpProof.customersTenantB = 'PASS';
    signedSessionAutobindHttpProof.rawGucTamperingIgnored = 'PASS';


    // Exercise signed customer create/update routes and cross-tenant write denial.
    const createCustomerA = await queryHttp(port, '/api/v1/customers', tokenA, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Customer A',
        email: 'signed-context-created-a@customer.invalid',
        organizationId: tenantB
      }
    });
    if (createCustomerA.body?.id) synthetic.customerIds.push(createCustomerA.body.id);
    if (createCustomerA.status !== 201
        || createCustomerA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createCustomerA.body?.organization_id !== tenantA
        || createCustomerA.body?.name !== 'Signed Context Created Customer A'
        || createCustomerA.body?.email !== 'signed-context-created-a@customer.invalid') {
      throw new Error('SIGNED_CONTEXT_CUSTOMERS_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createCustomerA.status,
        body: createCustomerA.body,
        signedHeader: createCustomerA.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }

    const createCustomerB = await queryHttp(port, '/api/v1/customers', tokenB, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Customer B',
        email: 'signed-context-created-b@customer.invalid',
        organizationId: tenantA
      }
    });
    if (createCustomerB.body?.id) synthetic.customerIds.push(createCustomerB.body.id);
    if (createCustomerB.status !== 201
        || createCustomerB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createCustomerB.body?.organization_id !== tenantB
        || createCustomerB.body?.name !== 'Signed Context Created Customer B'
        || createCustomerB.body?.email !== 'signed-context-created-b@customer.invalid') {
      throw new Error('SIGNED_CONTEXT_CUSTOMERS_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createCustomerB.status,
        body: createCustomerB.body,
        signedHeader: createCustomerB.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.customersCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.customersCreateTenantB = 'PASS';
    signedSessionAutobindHttpProof.customersCreateIgnoresClientTenantClaim = 'PASS';

    const foreignCustomerPatch = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(createCustomerB.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'FORGED-CROSS-TENANT-CUSTOMER-UPDATE' } }
    );
    if (foreignCustomerPatch.status !== 404
        || foreignCustomerPatch.body?.error?.code !== 'NOT_FOUND'
        || foreignCustomerPatch.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CUSTOMERS_CROSS_TENANT_UPDATE_NOT_DENIED:' + JSON.stringify({
        status: foreignCustomerPatch.status,
        body: foreignCustomerPatch.body,
        signedHeader: foreignCustomerPatch.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.customersCrossTenantUpdateDenied = 'PASS';

    const updateCustomerA = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(createCustomerA.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'Signed Context Updated Customer A', email: 'signed-context-updated-a@customer.invalid' } }
    );
    const updateCustomerB = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(createCustomerB.body.id),
      tokenB,
      { method: 'PATCH', body: { name: 'Signed Context Updated Customer B', email: 'signed-context-updated-b@customer.invalid' } }
    );
    for (const [label, response, expectedId, expectedTenant, expectedName, expectedEmail] of [
      ['tenantA', updateCustomerA, createCustomerA.body.id, tenantA, 'Signed Context Updated Customer A', 'signed-context-updated-a@customer.invalid'],
      ['tenantB', updateCustomerB, createCustomerB.body.id, tenantB, 'Signed Context Updated Customer B', 'signed-context-updated-b@customer.invalid']
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.name !== expectedName
          || response.body?.email !== expectedEmail) {
        throw new Error('SIGNED_CONTEXT_CUSTOMERS_UPDATE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.customersUpdateTenantA = 'PASS';
    signedSessionAutobindHttpProof.customersUpdateTenantB = 'PASS';

    const customersAfterWriteA = await queryHttp(port, '/api/v1/customers', tokenA);
    const customersAfterWriteB = await queryHttp(port, '/api/v1/customers', tokenB);
    for (const [label, response, ownTenant, ownCustomerId, foreignCustomerId, updatedName] of [
      ['tenantA', customersAfterWriteA, tenantA, createCustomerA.body.id, createCustomerB.body.id, 'Signed Context Updated Customer A'],
      ['tenantB', customersAfterWriteB, tenantB, createCustomerB.body.id, createCustomerA.body.id, 'Signed Context Updated Customer B']
    ]) {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 2
          || !rows.some(row => row.id === ownCustomerId && row.organization_id === ownTenant && row.name === updatedName)
          || rows.some(row => row.id === foreignCustomerId || row.organization_id !== ownTenant)) {
        throw new Error('SIGNED_CONTEXT_CUSTOMERS_POST_WRITE_READ_ISOLATION_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          rows: Array.isArray(rows) ? rows.map(row => ({
            id: row.id,
            organization_id: row.organization_id,
            name: row.name
          })) : null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.customersPostWriteReadIsolation = 'PASS';


    // Assign a persisted service line to each tenant's own customer via the real API.
    // Reusing an idempotency key is not required for the first execution but every
    // write is supplied one because this route requires durable replay protection.
    const serviceLineKeyA = 'signed-context-line-a-' + keyId;
    const serviceLineKeyB = 'signed-context-line-b-' + keyId;
    const serviceLineKeyCross = 'signed-context-line-cross-' + keyId;
    synthetic.idempotencyKeys.push(serviceLineKeyA, serviceLineKeyB, serviceLineKeyCross);
    const assignServiceLineA = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(synthetic.customerIds[0]) + '/service-line',
      tokenA,
      { method: 'POST', headers: { 'idempotency-key': serviceLineKeyA }, body: { lineId: synthetic.serviceLineIds[0] } }
    );
    const assignServiceLineB = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(synthetic.customerIds[1]) + '/service-line',
      tokenB,
      { method: 'POST', headers: { 'idempotency-key': serviceLineKeyB }, body: { lineId: synthetic.serviceLineIds[1] } }
    );
    for (const [label, response, expectedTenant, expectedCustomer, expectedLine, expectedCode] of [
      ['tenantA', assignServiceLineA, tenantA, synthetic.customerIds[0], synthetic.serviceLineIds[0], 'TC-A-' + keyId],
      ['tenantB', assignServiceLineB, tenantB, synthetic.customerIds[1], synthetic.serviceLineIds[1], 'TC-B-' + keyId]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.organization_id !== expectedTenant
          || response.body?.customer_id !== expectedCustomer
          || response.body?.line_id !== expectedLine
          || response.body?.line_code !== expectedCode) {
        throw new Error('SIGNED_CONTEXT_CUSTOMER_SERVICE_LINE_ASSIGNMENT_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
    }
    signedSessionAutobindHttpProof.customerServiceLineAssignTenantA = 'PASS';
    signedSessionAutobindHttpProof.customerServiceLineAssignTenantB = 'PASS';

    const crossServiceLineAssign = await queryHttp(
      port,
      '/api/v1/customers/' + encodeURIComponent(synthetic.customerIds[1]) + '/service-line',
      tokenA,
      { method: 'POST', headers: { 'idempotency-key': serviceLineKeyCross }, body: { lineId: synthetic.serviceLineIds[0] } }
    );
    if (crossServiceLineAssign.status !== 404
        || crossServiceLineAssign.body?.error?.code !== 'NOT_FOUND'
        || crossServiceLineAssign.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_CUSTOMER_SERVICE_LINE_CROSS_TENANT_ASSIGN_NOT_DENIED:' + JSON.stringify({
        status: crossServiceLineAssign.status,
        body: crossServiceLineAssign.body,
        signedHeader: crossServiceLineAssign.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.customerServiceLineCrossTenantAssignDenied = 'PASS';

    const readServiceLineA = await queryHttp(
      port, '/api/v1/customers/' + encodeURIComponent(synthetic.customerIds[0]) + '/service-line', tokenA
    );
    const readServiceLineB = await queryHttp(
      port, '/api/v1/customers/' + encodeURIComponent(synthetic.customerIds[1]) + '/service-line', tokenB
    );
    if (readServiceLineA.status !== 200
        || readServiceLineA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || readServiceLineA.body?.organization_id !== tenantA
        || readServiceLineA.body?.line_id !== synthetic.serviceLineIds[0]
        || readServiceLineA.body?.line_code !== 'TC-A-' + keyId
        || readServiceLineB.status !== 200
        || readServiceLineB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || readServiceLineB.body?.organization_id !== tenantB
        || readServiceLineB.body?.line_id !== synthetic.serviceLineIds[1]
        || readServiceLineB.body?.line_code !== 'TC-B-' + keyId) {
      throw new Error('SIGNED_CONTEXT_CUSTOMER_SERVICE_LINE_READ_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
        tenantA: { status: readServiceLineA.status, body: readServiceLineA.body },
        tenantB: { status: readServiceLineB.status, body: readServiceLineB.body }
      }));
    }
    signedSessionAutobindHttpProof.customerServiceLineReadTenantA = 'PASS';
    signedSessionAutobindHttpProof.customerServiceLineReadTenantB = 'PASS';

    // Exercise the authenticated sites list through its real signed read wrapper.
    // The response must include only the caller's site and its tenant-owned customer join.
    const signedSitesA = await queryHttp(port, '/api/v1/sites', tokenA);
    const signedSitesB = await queryHttp(port, '/api/v1/sites', tokenB);
    for (const [label, response, ownSiteId, foreignSiteId, ownTenant, ownCustomerName] of [
      ['tenantA', signedSitesA, synthetic.siteIds[0], synthetic.siteIds[1], tenantA, 'Signed Context Customer A'],
      ['tenantB', signedSitesB, synthetic.siteIds[1], synthetic.siteIds[0], tenantB, 'Signed Context Customer B']
    ]) {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 1
          || rows[0].id !== ownSiteId
          || rows[0].organization_id !== ownTenant
          || rows[0].customer_name !== ownCustomerName
          || rows.some(row => row.id === foreignSiteId)) {
        throw new Error('SIGNED_CONTEXT_SITES_ROUTE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          rows: Array.isArray(rows) ? rows.map(row => ({
            id: row.id, organization_id: row.organization_id, customer_name: row.customer_name
          })) : null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.sitesTenantA = 'PASS';
    signedSessionAutobindHttpProof.sitesTenantB = 'PASS';
    signedSessionAutobindHttpProof.sitesCustomerJoinTenantScoped = 'PASS';
    signedSessionAutobindHttpProof.sitesRawGucTamperingIgnored = 'PASS';


    // Test signed POST/PATCH site routes for both tenants, including cross-tenant
    // write denial. The CI-only worker probe also forges legacy GUC values.
    const createSiteA = await queryHttp(port, '/api/v1/sites', tokenA, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Site A',
        customerId: synthetic.customerIds[0],
        latitude: 30.0444,
        longitude: 31.2357,
        organizationId: tenantB
      }
    });
    if (createSiteA.body?.id) synthetic.siteIds.push(createSiteA.body.id);
    if (createSiteA.status !== 201
        || createSiteA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createSiteA.body?.organization_id !== tenantA
        || createSiteA.body?.customer_id !== synthetic.customerIds[0]
        || createSiteA.body?.name !== 'Signed Context Created Site A') {
      throw new Error('SIGNED_CONTEXT_SITES_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createSiteA.status,
        body: createSiteA.body,
        signedHeader: createSiteA.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }

    const createSiteB = await queryHttp(port, '/api/v1/sites', tokenB, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Site B',
        customerId: synthetic.customerIds[1],
        latitude: 29.9765,
        longitude: 31.1313,
        organizationId: tenantA
      }
    });
    if (createSiteB.body?.id) synthetic.siteIds.push(createSiteB.body.id);
    if (createSiteB.status !== 201
        || createSiteB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createSiteB.body?.organization_id !== tenantB
        || createSiteB.body?.customer_id !== synthetic.customerIds[1]
        || createSiteB.body?.name !== 'Signed Context Created Site B') {
      throw new Error('SIGNED_CONTEXT_SITES_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createSiteB.status,
        body: createSiteB.body,
        signedHeader: createSiteB.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.sitesCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.sitesCreateTenantB = 'PASS';
    signedSessionAutobindHttpProof.sitesCreateIgnoresClientTenantClaim = 'PASS';

    // A valid Tenant A session knows the foreign ID but cannot update Tenant B's row.
    const foreignSitePatch = await queryHttp(
      port,
      '/api/v1/sites/' + encodeURIComponent(createSiteB.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'FORGED-CROSS-TENANT-SITE-UPDATE' } }
    );
    if (foreignSitePatch.status !== 404
        || foreignSitePatch.body?.error?.code !== 'NOT_FOUND'
        || foreignSitePatch.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_SITES_CROSS_TENANT_UPDATE_NOT_DENIED:' + JSON.stringify({
        status: foreignSitePatch.status,
        body: foreignSitePatch.body,
        signedHeader: foreignSitePatch.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.sitesCrossTenantUpdateDenied = 'PASS';

    const updateSiteA = await queryHttp(
      port,
      '/api/v1/sites/' + encodeURIComponent(createSiteA.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'Signed Context Updated Site A', address: 'Tenant A verified update' } }
    );
    const updateSiteB = await queryHttp(
      port,
      '/api/v1/sites/' + encodeURIComponent(createSiteB.body.id),
      tokenB,
      { method: 'PATCH', body: { name: 'Signed Context Updated Site B', address: 'Tenant B verified update' } }
    );
    for (const [label, response, expectedId, expectedTenant, expectedName, expectedAddress] of [
      ['tenantA', updateSiteA, createSiteA.body.id, tenantA, 'Signed Context Updated Site A', 'Tenant A verified update'],
      ['tenantB', updateSiteB, createSiteB.body.id, tenantB, 'Signed Context Updated Site B', 'Tenant B verified update']
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.name !== expectedName
          || response.body?.address !== expectedAddress) {
        throw new Error('SIGNED_CONTEXT_SITES_UPDATE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.sitesUpdateTenantA = 'PASS';
    signedSessionAutobindHttpProof.sitesUpdateTenantB = 'PASS';

    // Verify the writes are visible to their owner only after the update transactions.
    const sitesAfterWriteA = await queryHttp(port, '/api/v1/sites', tokenA);
    const sitesAfterWriteB = await queryHttp(port, '/api/v1/sites', tokenB);
    for (const [label, response, ownTenant, ownSiteId, foreignSiteId, updatedName] of [
      ['tenantA', sitesAfterWriteA, tenantA, createSiteA.body.id, createSiteB.body.id, 'Signed Context Updated Site A'],
      ['tenantB', sitesAfterWriteB, tenantB, createSiteB.body.id, createSiteA.body.id, 'Signed Context Updated Site B']
    ]) {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 2
          || !rows.some(row => row.id === ownSiteId && row.organization_id === ownTenant && row.name === updatedName)
          || rows.some(row => row.id === foreignSiteId || row.organization_id !== ownTenant)) {
        throw new Error('SIGNED_CONTEXT_SITES_POST_WRITE_READ_ISOLATION_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          rows: Array.isArray(rows) ? rows.map(row => ({
            id: row.id,
            organization_id: row.organization_id,
            name: row.name
          })) : null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.sitesPostWriteReadIsolation = 'PASS';

    // Dedicated signed vertical slice outside work-orders. Each tenant's real GET
    // list operation must run in a read-only signed transaction, ignore forged raw
    // GUCs, and preserve the tenant-scoped assets -> sites join.
    const signedAssetsA = await queryHttp(port, '/api/v1/assets', tokenA);
    const signedAssetsB = await queryHttp(port, '/api/v1/assets', tokenB);
    for (const [label, response, ownAssetId, foreignAssetId, ownTenant, ownSiteName] of [
      ['tenantA', signedAssetsA, synthetic.assetIds[0], synthetic.assetIds[1], tenantA, 'Signed Context Site A'],
      ['tenantB', signedAssetsB, synthetic.assetIds[1], synthetic.assetIds[0], tenantB, 'Signed Context Site B']
    ]) {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 1
          || rows[0].id !== ownAssetId
          || rows[0].organization_id !== ownTenant
          || rows[0].site_name !== ownSiteName
          || rows.some(row => row.id === foreignAssetId)) {
        throw new Error('SIGNED_CONTEXT_ASSETS_ROUTE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          rows: Array.isArray(rows) ? rows.map(row => ({
            id: row.id, organization_id: row.organization_id, site_name: row.site_name
          })) : null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.assetsTenantA = 'PASS';
    signedSessionAutobindHttpProof.assetsTenantB = 'PASS';
    signedSessionAutobindHttpProof.assetsSiteJoinTenantScoped = 'PASS';
    signedSessionAutobindHttpProof.assetsRawGucTamperingIgnored = 'PASS';


    // Exercise signed asset creation, update, and event writes for both tenants.
    // Each create request also attempts to override organization ownership.
    const createAssetA = await queryHttp(port, '/api/v1/assets', tokenA, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Asset A',
        assetType: 'network_asset',
        siteId: createSiteA.body.id,
        organizationId: tenantB
      }
    });
    if (createAssetA.body?.id) synthetic.assetIds.push(createAssetA.body.id);
    if (createAssetA.status !== 201
        || createAssetA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createAssetA.body?.organization_id !== tenantA
        || createAssetA.body?.site_id !== createSiteA.body.id
        || createAssetA.body?.name !== 'Signed Context Created Asset A') {
      throw new Error('SIGNED_CONTEXT_ASSETS_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createAssetA.status,
        body: createAssetA.body,
        signedHeader: createAssetA.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }

    const createAssetB = await queryHttp(port, '/api/v1/assets', tokenB, {
      method: 'POST',
      body: {
        name: 'Signed Context Created Asset B',
        assetType: 'network_asset',
        siteId: createSiteB.body.id,
        organizationId: tenantA
      }
    });
    if (createAssetB.body?.id) synthetic.assetIds.push(createAssetB.body.id);
    if (createAssetB.status !== 201
        || createAssetB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createAssetB.body?.organization_id !== tenantB
        || createAssetB.body?.site_id !== createSiteB.body.id
        || createAssetB.body?.name !== 'Signed Context Created Asset B') {
      throw new Error('SIGNED_CONTEXT_ASSETS_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createAssetB.status,
        body: createAssetB.body,
        signedHeader: createAssetB.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.assetsCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.assetsCreateTenantB = 'PASS';
    signedSessionAutobindHttpProof.assetsCreateIgnoresClientTenantClaim = 'PASS';

    const foreignAssetPatch = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetB.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'FORGED-CROSS-TENANT-ASSET-UPDATE' } }
    );
    if (foreignAssetPatch.status !== 404
        || foreignAssetPatch.body?.error?.code !== 'NOT_FOUND'
        || foreignAssetPatch.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_ASSETS_CROSS_TENANT_UPDATE_NOT_DENIED:' + JSON.stringify({
        status: foreignAssetPatch.status,
        body: foreignAssetPatch.body,
        signedHeader: foreignAssetPatch.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.assetsCrossTenantUpdateDenied = 'PASS';

    const updateAssetA = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetA.body.id),
      tokenA,
      { method: 'PATCH', body: { name: 'Signed Context Updated Asset A', status: 'active' } }
    );
    const updateAssetB = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetB.body.id),
      tokenB,
      { method: 'PATCH', body: { name: 'Signed Context Updated Asset B', status: 'active' } }
    );
    for (const [label, response, expectedId, expectedTenant, expectedSite, expectedName] of [
      ['tenantA', updateAssetA, createAssetA.body.id, tenantA, createSiteA.body.id, 'Signed Context Updated Asset A'],
      ['tenantB', updateAssetB, createAssetB.body.id, tenantB, createSiteB.body.id, 'Signed Context Updated Asset B']
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.site_id !== expectedSite
          || response.body?.name !== expectedName
          || response.body?.status !== 'active') {
        throw new Error('SIGNED_CONTEXT_ASSETS_UPDATE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.assetsUpdateTenantA = 'PASS';
    signedSessionAutobindHttpProof.assetsUpdateTenantB = 'PASS';

    const eventAssetA = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetA.body.id) + '/events',
      tokenA,
      { method: 'POST', body: { eventType: 'inspection', details: { source: 'signed-context-ci', tenant: 'A' } } }
    );
    const eventAssetB = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetB.body.id) + '/events',
      tokenB,
      { method: 'POST', body: { eventType: 'inspection', details: { source: 'signed-context-ci', tenant: 'B' } } }
    );
    for (const [label, response, expectedId, expectedTenant, expectedMarker] of [
      ['tenantA', eventAssetA, createAssetA.body.id, tenantA, 'A'],
      ['tenantB', eventAssetB, createAssetB.body.id, tenantB, 'B']
    ]) {
      if (response.status !== 201
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.asset?.id !== expectedId
          || response.body?.asset?.organization_id !== expectedTenant
          || !Array.isArray(response.body?.events)
          || !response.body.events.some(event => event.event_type === 'inspection'
            && event.details?.source === 'signed-context-ci'
            && event.details?.tenant === expectedMarker)) {
        throw new Error('SIGNED_CONTEXT_ASSET_EVENT_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
    }
    signedSessionAutobindHttpProof.assetsEventTenantA = 'PASS';
    signedSessionAutobindHttpProof.assetsEventTenantB = 'PASS';

    const foreignAssetEvent = await queryHttp(
      port,
      '/api/v1/assets/' + encodeURIComponent(createAssetB.body.id) + '/events',
      tokenA,
      { method: 'POST', body: { eventType: 'inspection', details: { source: 'cross-tenant-probe' } } }
    );
    if (foreignAssetEvent.status !== 404
        || foreignAssetEvent.body?.error?.code !== 'NOT_FOUND'
        || foreignAssetEvent.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_ASSET_EVENT_CROSS_TENANT_WRITE_NOT_DENIED:' + JSON.stringify({
        status: foreignAssetEvent.status,
        body: foreignAssetEvent.body,
        signedHeader: foreignAssetEvent.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.assetsEventCrossTenantWriteDenied = 'PASS';

    const assetsAfterWriteA = await queryHttp(port, '/api/v1/assets', tokenA);
    const assetsAfterWriteB = await queryHttp(port, '/api/v1/assets', tokenB);
    for (const [label, response, ownTenant, ownAssetId, foreignAssetId, ownSiteName, updatedName] of [
      ['tenantA', assetsAfterWriteA, tenantA, createAssetA.body.id, createAssetB.body.id, 'Signed Context Updated Site A', 'Signed Context Updated Asset A'],
      ['tenantB', assetsAfterWriteB, tenantB, createAssetB.body.id, createAssetA.body.id, 'Signed Context Updated Site B', 'Signed Context Updated Asset B']
    ]) {
      const rows = response.body;
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(rows)
          || rows.length !== 2
          || !rows.some(row => row.id === ownAssetId && row.organization_id === ownTenant
            && row.site_name === ownSiteName && row.name === updatedName)
          || rows.some(row => row.id === foreignAssetId || row.organization_id !== ownTenant)) {
        throw new Error('SIGNED_CONTEXT_ASSETS_POST_WRITE_READ_ISOLATION_FAILED:' + JSON.stringify({
          label,
          status: response.status,
          rows: Array.isArray(rows) ? rows.map(row => ({
            id: row.id,
            organization_id: row.organization_id,
            site_name: row.site_name,
            name: row.name
          })) : null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.assetsPostWriteReadIsolation = 'PASS';


    // Classify faults using each tenant's persisted service line, site and asset.
    // A Tenant A session querying Tenant B IDs must get no foreign linked records.
    const classifyFaultA = await queryHttp(port, '/api/v1/faults/classify', tokenA, {
      method: 'POST',
      body: {
        customerId: synthetic.customerIds[0],
        assetId: createAssetA.body.id,
        siteId: createSiteA.body.id
      }
    });
    const classifyFaultB = await queryHttp(port, '/api/v1/faults/classify', tokenB, {
      method: 'POST',
      body: {
        customerId: synthetic.customerIds[1],
        assetId: createAssetB.body.id,
        siteId: createSiteB.body.id
      }
    });
    for (const [label, response, expectedTenant, expectedLine, expectedAsset, expectedSite] of [
      ['tenantA', classifyFaultA, tenantA, synthetic.serviceLineIds[0], createAssetA.body.id, createSiteA.body.id],
      ['tenantB', classifyFaultB, tenantB, synthetic.serviceLineIds[1], createAssetB.body.id, createSiteB.body.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.organizationId !== expectedTenant
          || response.body?.serviceLine?.id !== expectedLine
          || response.body?.asset?.id !== expectedAsset
          || response.body?.site?.id !== expectedSite) {
        throw new Error('SIGNED_CONTEXT_FAULT_CLASSIFICATION_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
    }
    const foreignFaultClassification = await queryHttp(port, '/api/v1/faults/classify', tokenA, {
      method: 'POST',
      body: {
        customerId: synthetic.customerIds[1],
        assetId: createAssetB.body.id,
        siteId: createSiteB.body.id
      }
    });
    if (foreignFaultClassification.status !== 200
        || foreignFaultClassification.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || foreignFaultClassification.body?.serviceLine !== null
        || foreignFaultClassification.body?.asset !== null
        || foreignFaultClassification.body?.site !== null) {
      throw new Error('SIGNED_CONTEXT_FAULT_CLASSIFICATION_EXPOSED_FOREIGN_TENANT_DATA:' + JSON.stringify({
        status: foreignFaultClassification.status,
        body: foreignFaultClassification.body
      }));
    }
    signedSessionAutobindHttpProof.faultClassificationTenantA = 'PASS';
    signedSessionAutobindHttpProof.faultClassificationTenantB = 'PASS';
    signedSessionAutobindHttpProof.faultClassificationForeignTenantHidden = 'PASS';


    // Create tenant-owned technician profiles and skills through the real routes.
    const technicianA = await queryHttp(port, '/api/v1/technicians', tokenA, {
      method: 'POST',
      body: { userId: userA, latitude: 30.0444, longitude: 31.2357, active: true }
    });
    const technicianB = await queryHttp(port, '/api/v1/technicians', tokenB, {
      method: 'POST',
      body: { userId: userB, latitude: 29.9765, longitude: 31.1313, active: true }
    });
    for (const [label, response, expectedUser, expectedTenant, expectedLat, expectedLon] of [
      ['tenantA', technicianA, userA, tenantA, 30.0444, 31.2357],
      ['tenantB', technicianB, userB, tenantB, 29.9765, 31.1313]
    ]) {
      if (response.status !== 201
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.user_id !== expectedUser
          || response.body?.organization_id !== expectedTenant
          || Number(response.body?.working_from_lat) !== expectedLat
          || Number(response.body?.working_from_lon) !== expectedLon
          || Number(response.body?.active) !== 1) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_PROFILE_WRITE_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
    }
    signedSessionAutobindHttpProof.technicianProfileTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianProfileTenantB = 'PASS';

    const technicianSkillA = 'ci-signed-skill-a-' + keyId;
    const technicianSkillB = 'ci-signed-skill-b-' + keyId;
    const skillA = await queryHttp(port, '/api/v1/technicians/skills', tokenA, {
      method: 'POST',
      body: { userId: userA, skill: technicianSkillA, level: 4 }
    });
    const skillB = await queryHttp(port, '/api/v1/technicians/skills', tokenB, {
      method: 'POST',
      body: { userId: userB, skill: technicianSkillB, level: 3 }
    });
    if (skillA.status !== 201
        || skillA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || skillA.body?.organization_id !== tenantA
        || skillA.body?.user_id !== userA
        || skillA.body?.skill !== technicianSkillA
        || Number(skillA.body?.level) !== 4
        || skillB.status !== 201
        || skillB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || skillB.body?.organization_id !== tenantB
        || skillB.body?.user_id !== userB
        || skillB.body?.skill !== technicianSkillB
        || Number(skillB.body?.level) !== 3) {
      throw new Error('SIGNED_CONTEXT_TECHNICIAN_SKILL_WRITE_FAILED:' + JSON.stringify({
        tenantA: { status: skillA.status, body: skillA.body },
        tenantB: { status: skillB.status, body: skillB.body }
      }));
    }
    signedSessionAutobindHttpProof.technicianSkillTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianSkillTenantB = 'PASS';

    const techniciansA = await queryHttp(port, '/api/v1/technicians', tokenA);
    const techniciansB = await queryHttp(port, '/api/v1/technicians', tokenB);
    const skillsA = await queryHttp(port, '/api/v1/technicians/skills', tokenA);
    const skillsB = await queryHttp(port, '/api/v1/technicians/skills', tokenB);
    for (const [label, response, ownUser, foreignUser, expectedSkill] of [
      ['tenantA-technicians', techniciansA, userA, userB, technicianSkillA],
      ['tenantB-technicians', techniciansB, userB, userA, technicianSkillB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(response.body)
          || response.body.length !== 1
          || response.body[0].user_id !== ownUser
          || response.body.some(row => row.user_id === foreignUser)) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_LIST_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    for (const [label, response, ownTenant, ownUser, foreignUser, expectedSkill] of [
      ['tenantA-skills', skillsA, tenantA, userA, userB, technicianSkillA],
      ['tenantB-skills', skillsB, tenantB, userB, userA, technicianSkillB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(response.body)
          || response.body.length !== 1
          || response.body[0].organization_id !== ownTenant
          || response.body[0].user_id !== ownUser
          || response.body[0].skill !== expectedSkill
          || response.body.some(row => row.user_id === foreignUser)) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_SKILL_LIST_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.technicianListTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianListTenantB = 'PASS';
    signedSessionAutobindHttpProof.technicianSkillsListTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianSkillsListTenantB = 'PASS';

    // Create real appointments against the two seeded tenant-owned work orders.
    // They are intentionally separated in time to avoid unrelated resource conflicts.
    const appointmentDay = new Date(Date.now() + 48 * 60 * 60 * 1000);
    appointmentDay.setUTCHours(9, 0, 0, 0);
    const appointmentBase = appointmentDay.getTime();
    const appointmentStartA = new Date(appointmentBase).toISOString();
    const appointmentEndA = new Date(appointmentBase + 60 * 60 * 1000).toISOString();
    const appointmentStartB = new Date(appointmentBase + 3 * 60 * 60 * 1000).toISOString();
    const appointmentEndB = new Date(appointmentBase + 4 * 60 * 60 * 1000).toISOString();
    const appointmentKeyA = 'signed-context-appointment-create-a-' + keyId;
    const appointmentKeyB = 'signed-context-appointment-create-b-' + keyId;
    const appointmentUpdateKeyA = 'signed-context-appointment-update-a-' + keyId;
    const appointmentUpdateKeyB = 'signed-context-appointment-update-b-' + keyId;
    const appointmentCrossKey = 'signed-context-appointment-cross-' + keyId;
    synthetic.idempotencyKeys.push(
      appointmentKeyA, appointmentKeyB, appointmentUpdateKeyA, appointmentUpdateKeyB, appointmentCrossKey
    );

    const createAppointmentA = await queryHttp(port, '/api/v1/appointments', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': appointmentKeyA },
      body: {
        workOrderId: synthetic.workOrderIds[0],
        technicianId: userA,
        startAt: appointmentStartA,
        endAt: appointmentEndA
      }
    });
    if (createAppointmentA.body?.id) synthetic.appointmentIds.push(createAppointmentA.body.id);
    if (createAppointmentA.status !== 201
        || createAppointmentA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createAppointmentA.body?.organization_id !== tenantA
        || createAppointmentA.body?.work_order_id !== synthetic.workOrderIds[0]
        || createAppointmentA.body?.technician_id !== userA
        || createAppointmentA.body?.status !== 'scheduled') {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createAppointmentA.status, body: createAppointmentA.body,
        signedHeader: createAppointmentA.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }

    const createAppointmentB = await queryHttp(port, '/api/v1/appointments', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': appointmentKeyB },
      body: {
        workOrderId: synthetic.workOrderIds[1],
        technicianId: userB,
        startAt: appointmentStartB,
        endAt: appointmentEndB
      }
    });
    if (createAppointmentB.body?.id) synthetic.appointmentIds.push(createAppointmentB.body.id);
    if (createAppointmentB.status !== 201
        || createAppointmentB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createAppointmentB.body?.organization_id !== tenantB
        || createAppointmentB.body?.work_order_id !== synthetic.workOrderIds[1]
        || createAppointmentB.body?.technician_id !== userB
        || createAppointmentB.body?.status !== 'scheduled') {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createAppointmentB.status, body: createAppointmentB.body,
        signedHeader: createAppointmentB.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.appointmentCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentCreateTenantB = 'PASS';

    const foreignAppointmentPatch = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id),
      tokenA,
      {
        method: 'PATCH',
        headers: { 'idempotency-key': appointmentCrossKey },
        body: {
          status: 'confirmed',
          expectedUpdatedAt: createAppointmentB.body.updated_at
        }
      }
    );
    if (foreignAppointmentPatch.status !== 404
        || foreignAppointmentPatch.body?.error?.code !== 'NOT_FOUND'
        || foreignAppointmentPatch.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_CROSS_TENANT_UPDATE_NOT_DENIED:' + JSON.stringify({
        status: foreignAppointmentPatch.status,
        body: foreignAppointmentPatch.body
      }));
    }
    signedSessionAutobindHttpProof.appointmentCrossTenantUpdateDenied = 'PASS';

    const updateAppointmentA = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentA.body.id),
      tokenA,
      {
        method: 'PATCH',
        headers: { 'idempotency-key': appointmentUpdateKeyA },
        body: {
          status: 'confirmed',
          expectedUpdatedAt: createAppointmentA.body.updated_at,
          startAt: new Date(appointmentBase + 90 * 60 * 1000).toISOString(),
          endAt: new Date(appointmentBase + 150 * 60 * 1000).toISOString()
        }
      }
    );
    const updateAppointmentB = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id),
      tokenB,
      {
        method: 'PATCH',
        headers: { 'idempotency-key': appointmentUpdateKeyB },
        body: {
          status: 'confirmed',
          expectedUpdatedAt: createAppointmentB.body.updated_at,
          startAt: new Date(appointmentBase + 210 * 60 * 1000).toISOString(),
          endAt: new Date(appointmentBase + 270 * 60 * 1000).toISOString()
        }
      }
    );
    for (const [label, response, expectedId, expectedTenant, expectedTechnician, expectedWorkOrder] of [
      ['tenantA', updateAppointmentA, createAppointmentA.body.id, tenantA, userA, synthetic.workOrderIds[0]],
      ['tenantB', updateAppointmentB, createAppointmentB.body.id, tenantB, userB, synthetic.workOrderIds[1]]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.technician_id !== expectedTechnician
          || response.body?.work_order_id !== expectedWorkOrder
          || response.body?.status !== 'confirmed') {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_UPDATE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body,
          signedHeader: response.headers?.['x-opscore-signed-tenant-context'] || null,
          serverOutput: serverOutput.slice(-3000)
        }));
      }
    }
    signedSessionAutobindHttpProof.appointmentUpdateTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentUpdateTenantB = 'PASS';

    const readAppointmentA = await queryHttp(
      port, '/api/v1/appointments/' + encodeURIComponent(createAppointmentA.body.id), tokenA
    );
    const readAppointmentB = await queryHttp(
      port, '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id), tokenB
    );
    const listAppointmentsA = await queryHttp(port, '/api/v1/appointments', tokenA);
    const listAppointmentsB = await queryHttp(port, '/api/v1/appointments', tokenB);
    for (const [label, response, expectedId, expectedTenant, expectedWorkOrder, listed] of [
      ['tenantA-detail', readAppointmentA, createAppointmentA.body.id, tenantA, synthetic.workOrderIds[0], listAppointmentsA],
      ['tenantB-detail', readAppointmentB, createAppointmentB.body.id, tenantB, synthetic.workOrderIds[1], listAppointmentsB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.work_order_id !== expectedWorkOrder
          || listed.status !== 200
          || listed.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(listed.body)
          || listed.body.length !== 1
          || listed.body[0].id !== expectedId
          || listed.body.some(row => row.organization_id !== expectedTenant)) {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_READ_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label,
          detail: { status: response.status, body: response.body },
          list: { status: listed.status, body: listed.body }
        }));
      }
    }
    signedSessionAutobindHttpProof.appointmentDetailTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentDetailTenantB = 'PASS';
    signedSessionAutobindHttpProof.appointmentListTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentListTenantB = 'PASS';

    const availabilityA = await queryHttp(
      port,
      '/api/v1/technicians/availability?technicianId=' + encodeURIComponent(userA)
        + '&date=' + encodeURIComponent(appointmentStartA.slice(0, 10)),
      tokenA
    );
    const availabilityB = await queryHttp(
      port,
      '/api/v1/technicians/availability?technicianId=' + encodeURIComponent(userB)
        + '&date=' + encodeURIComponent(appointmentStartB.slice(0, 10)),
      tokenB
    );
    for (const [label, response, expectedTenant, expectedTech, expectedAppointment] of [
      ['tenantA', availabilityA, tenantA, userA, createAppointmentA.body.id],
      ['tenantB', availabilityB, tenantB, userB, createAppointmentB.body.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.organizationId !== expectedTenant
          || response.body?.technicianId !== expectedTech
          || !Array.isArray(response.body?.busyAppointments)
          || !response.body.busyAppointments.some(row => row.id === expectedAppointment)) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_AVAILABILITY_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.technicianAvailabilityTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianAvailabilityTenantB = 'PASS';


    // PostgreSQL trail storage is migration-backed (069) and must be present
    // before this signed read transaction. Exercise insert/list/GeoJSON per tenant.
    const trailClientEventA = 'signed-context-trail-a-' + keyId;
    const trailClientEventB = 'signed-context-trail-b-' + keyId;
    const trailIdempotencyKeyA = 'signed-context-trail-write-a-' + keyId;
    const trailIdempotencyKeyB = 'signed-context-trail-write-b-' + keyId;
    synthetic.trailClientEventIds.push(trailClientEventA, trailClientEventB);
    synthetic.idempotencyKeys.push(trailIdempotencyKeyA, trailIdempotencyKeyB);
    const trailRecordedAtA = new Date(Date.now() + 1000).toISOString();
    const trailRecordedAtB = new Date(Date.now() + 2000).toISOString();

    const trailWriteA = await queryHttp(port, '/api/v1/technicians/trail', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': trailIdempotencyKeyA },
      body: {
        technicianId: userA,
        latitude: 30.0444,
        longitude: 31.2357,
        accuracyMeters: 8,
        recordedAt: trailRecordedAtA,
        appointmentId: createAppointmentA.body.id,
        workOrderId: synthetic.workOrderIds[0],
        source: 'device',
        clientEventId: trailClientEventA
      }
    });
    if (trailWriteA.body?.point?.id) synthetic.trailPointIds.push(trailWriteA.body.point.id);
    if (trailWriteA.status !== 201
        || trailWriteA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || trailWriteA.body?.point?.organization_id !== tenantA
        || trailWriteA.body?.point?.technician_id !== userA
        || trailWriteA.body?.point?.appointment_id !== createAppointmentA.body.id
        || trailWriteA.body?.point?.work_order_id !== synthetic.workOrderIds[0]
        || trailWriteA.body?.point?.client_event_id !== trailClientEventA
        || Number(trailWriteA.body?.point?.accuracy_m) !== 8) {
      throw new Error('SIGNED_CONTEXT_TECHNICIAN_TRAIL_WRITE_TENANT_A_FAILED:' + JSON.stringify({
        status: trailWriteA.status,
        body: trailWriteA.body,
        signedHeader: trailWriteA.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }

    const trailWriteB = await queryHttp(port, '/api/v1/technicians/trail', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': trailIdempotencyKeyB },
      body: {
        technicianId: userB,
        latitude: 29.9765,
        longitude: 31.1313,
        accuracyMeters: 9,
        recordedAt: trailRecordedAtB,
        appointmentId: createAppointmentB.body.id,
        workOrderId: synthetic.workOrderIds[1],
        source: 'device',
        clientEventId: trailClientEventB
      }
    });
    if (trailWriteB.body?.point?.id) synthetic.trailPointIds.push(trailWriteB.body.point.id);
    if (trailWriteB.status !== 201
        || trailWriteB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || trailWriteB.body?.point?.organization_id !== tenantB
        || trailWriteB.body?.point?.technician_id !== userB
        || trailWriteB.body?.point?.appointment_id !== createAppointmentB.body.id
        || trailWriteB.body?.point?.work_order_id !== synthetic.workOrderIds[1]
        || trailWriteB.body?.point?.client_event_id !== trailClientEventB
        || Number(trailWriteB.body?.point?.accuracy_m) !== 9) {
      throw new Error('SIGNED_CONTEXT_TECHNICIAN_TRAIL_WRITE_TENANT_B_FAILED:' + JSON.stringify({
        status: trailWriteB.status,
        body: trailWriteB.body,
        signedHeader: trailWriteB.headers?.['x-opscore-signed-tenant-context'] || null,
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.technicianTrailWriteTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianTrailWriteTenantB = 'PASS';

    const trailReadA = await queryHttp(
      port,
      '/api/v1/technicians/trail?technicianId=' + encodeURIComponent(userA) + '&limit=20',
      tokenA
    );
    const trailReadB = await queryHttp(
      port,
      '/api/v1/technicians/trail?technicianId=' + encodeURIComponent(userB) + '&limit=20',
      tokenB
    );
    const crossTenantTrailReadA = await queryHttp(
      port,
      '/api/v1/technicians/trail?technicianId=' + encodeURIComponent(userB) + '&limit=20',
      tokenA
    );
    for (const [label, response, expectedTenant, expectedUser, expectedClientEvent] of [
      ['tenantA', trailReadA, tenantA, userA, trailClientEventA],
      ['tenantB', trailReadB, tenantB, userB, trailClientEventB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.organizationId !== expectedTenant
          || response.body?.technicianId !== expectedUser
          || response.body?.count !== 1
          || !Array.isArray(response.body?.points)
          || response.body.points[0]?.client_event_id !== expectedClientEvent
          || response.body.points[0]?.organization_id !== expectedTenant) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_TRAIL_READ_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    if (crossTenantTrailReadA.status !== 200
        || crossTenantTrailReadA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || crossTenantTrailReadA.body?.organizationId !== tenantA
        || crossTenantTrailReadA.body?.technicianId !== userB
        || crossTenantTrailReadA.body?.count !== 0
        || crossTenantTrailReadA.body?.points?.length !== 0) {
      throw new Error('SIGNED_CONTEXT_TECHNICIAN_TRAIL_CROSS_TENANT_READ_EXPOSED:' + JSON.stringify({
        status: crossTenantTrailReadA.status,
        body: crossTenantTrailReadA.body
      }));
    }
    signedSessionAutobindHttpProof.technicianTrailReadTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianTrailReadTenantB = 'PASS';
    signedSessionAutobindHttpProof.technicianTrailCrossTenantHidden = 'PASS';

    const trailGeoJsonA = await queryHttp(
      port,
      '/api/v1/technicians/trail.geojson?technicianId=' + encodeURIComponent(userA) + '&limit=20',
      tokenA
    );
    const trailGeoJsonB = await queryHttp(
      port,
      '/api/v1/technicians/trail.geojson?technicianId=' + encodeURIComponent(userB) + '&limit=20',
      tokenB
    );
    for (const [label, response, expectedUser, expectedCoordinates] of [
      ['tenantA', trailGeoJsonA, userA, [31.2357, 30.0444]],
      ['tenantB', trailGeoJsonB, userB, [31.1313, 29.9765]]
    ]) {
      const feature = response.body?.features?.[0];
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.type !== 'FeatureCollection'
          || response.body?.count !== 1
          || response.body?.features?.length !== 1
          || feature?.properties?.technicianId !== expectedUser
          || feature?.geometry?.type !== 'Point'
          || feature?.geometry?.coordinates?.[0] !== expectedCoordinates[0]
          || feature?.geometry?.coordinates?.[1] !== expectedCoordinates[1]) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_TRAIL_GEOJSON_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.technicianTrailGeoJsonTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianTrailGeoJsonTenantB = 'PASS';


    // Tenant-specific geofences: each shape is a real persisted Polygon row,
    // and assignment/evaluation must only resolve within the caller organization.
    const geofenceKeyA = 'signed-context-geofence-create-a-' + keyId;
    const geofenceKeyB = 'signed-context-geofence-create-b-' + keyId;
    const geofenceAssignKeyA = 'signed-context-geofence-assign-a-' + keyId;
    const geofenceAssignKeyB = 'signed-context-geofence-assign-b-' + keyId;
    const geofenceCrossKey = 'signed-context-geofence-cross-' + keyId;
    synthetic.idempotencyKeys.push(
      geofenceKeyA, geofenceKeyB, geofenceAssignKeyA, geofenceAssignKeyB, geofenceCrossKey
    );
    const geofenceGeometryA = {
      type: 'Polygon',
      coordinates: [[[31.23,30.04],[31.24,30.04],[31.24,30.05],[31.23,30.05],[31.23,30.04]]]
    };
    const geofenceGeometryB = {
      type: 'Polygon',
      coordinates: [[[31.12,29.97],[31.14,29.97],[31.14,29.99],[31.12,29.99],[31.12,29.97]]]
    };
    const createGeofenceA = await queryHttp(port, '/api/v1/geofences', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': geofenceKeyA },
      body: { name: 'Signed Context Geofence A', geometry: geofenceGeometryA, enabled: true }
    });
    if (createGeofenceA.body?.id) synthetic.geofenceIds.push(createGeofenceA.body.id);
    if (createGeofenceA.status !== 201
        || createGeofenceA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createGeofenceA.body?.organizationId !== tenantA
        || createGeofenceA.body?.name !== 'Signed Context Geofence A'
        || createGeofenceA.body?.enabled !== true
        || createGeofenceA.body?.geometry?.type !== 'Polygon') {
      throw new Error('SIGNED_CONTEXT_GEOFENCE_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: createGeofenceA.status,
        body: createGeofenceA.body,
        signedHeader: createGeofenceA.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    const createGeofenceB = await queryHttp(port, '/api/v1/geofences', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': geofenceKeyB },
      body: { name: 'Signed Context Geofence B', geometry: geofenceGeometryB, enabled: true }
    });
    if (createGeofenceB.body?.id) synthetic.geofenceIds.push(createGeofenceB.body.id);
    if (createGeofenceB.status !== 201
        || createGeofenceB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || createGeofenceB.body?.organizationId !== tenantB
        || createGeofenceB.body?.name !== 'Signed Context Geofence B'
        || createGeofenceB.body?.enabled !== true
        || createGeofenceB.body?.geometry?.type !== 'Polygon') {
      throw new Error('SIGNED_CONTEXT_GEOFENCE_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: createGeofenceB.status,
        body: createGeofenceB.body,
        signedHeader: createGeofenceB.headers?.['x-opscore-signed-tenant-context'] || null
      }));
    }
    signedSessionAutobindHttpProof.geofenceCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceCreateTenantB = 'PASS';

    const geofencesA = await queryHttp(port, '/api/v1/geofences', tokenA);
    const geofencesB = await queryHttp(port, '/api/v1/geofences', tokenB);
    for (const [label, response, ownId, foreignId, ownTenant] of [
      ['tenantA', geofencesA, createGeofenceA.body.id, createGeofenceB.body.id, tenantA],
      ['tenantB', geofencesB, createGeofenceB.body.id, createGeofenceA.body.id, tenantB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(response.body)
          || response.body.length !== 1
          || response.body[0].id !== ownId
          || response.body.some(row => row.id === foreignId)) {
        throw new Error('SIGNED_CONTEXT_GEOFENCE_LIST_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body, expectedTenant: ownTenant
        }));
      }
    }
    signedSessionAutobindHttpProof.geofenceListTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceListTenantB = 'PASS';

    const assignGeofenceA = await queryHttp(
      port,
      '/api/v1/geofences/' + encodeURIComponent(createGeofenceA.body.id) + '/technicians',
      tokenA,
      { method: 'POST', headers: { 'idempotency-key': geofenceAssignKeyA }, body: { technicianId: userA } }
    );
    const assignGeofenceB = await queryHttp(
      port,
      '/api/v1/geofences/' + encodeURIComponent(createGeofenceB.body.id) + '/technicians',
      tokenB,
      { method: 'POST', headers: { 'idempotency-key': geofenceAssignKeyB }, body: { technicianId: userB } }
    );
    for (const [label, response, expectedId] of [
      ['tenantA', assignGeofenceA, createGeofenceA.body.id],
      ['tenantB', assignGeofenceB, createGeofenceB.body.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(response.body)
          || response.body.length !== 1
          || response.body[0].id !== expectedId) {
        throw new Error('SIGNED_CONTEXT_GEOFENCE_TECHNICIAN_ASSIGN_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.geofenceAssignTechnicianTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceAssignTechnicianTenantB = 'PASS';

    const crossGeofenceAssignment = await queryHttp(
      port,
      '/api/v1/geofences/' + encodeURIComponent(createGeofenceB.body.id) + '/technicians',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': geofenceCrossKey },
        body: { technicianId: userA }
      }
    );
    if (crossGeofenceAssignment.status !== 404
        || crossGeofenceAssignment.body?.error?.code !== 'GEOFENCE_NOT_FOUND'
        || crossGeofenceAssignment.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_GEOFENCE_CROSS_TENANT_ASSIGN_NOT_DENIED:' + JSON.stringify({
        status: crossGeofenceAssignment.status,
        body: crossGeofenceAssignment.body
      }));
    }
    signedSessionAutobindHttpProof.geofenceCrossTenantAssignmentDenied = 'PASS';

    const technicianGeofencesA = await queryHttp(
      port, '/api/v1/technicians/' + encodeURIComponent(userA) + '/geofences', tokenA
    );
    const technicianGeofencesB = await queryHttp(
      port, '/api/v1/technicians/' + encodeURIComponent(userB) + '/geofences', tokenB
    );
    for (const [label, response, ownId, foreignId] of [
      ['tenantA', technicianGeofencesA, createGeofenceA.body.id, createGeofenceB.body.id],
      ['tenantB', technicianGeofencesB, createGeofenceB.body.id, createGeofenceA.body.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || !Array.isArray(response.body)
          || response.body.length !== 1
          || response.body[0].id !== ownId
          || response.body.some(row => row.id === foreignId)) {
        throw new Error('SIGNED_CONTEXT_TECHNICIAN_GEOFENCE_READ_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.technicianGeofenceReadTenantA = 'PASS';
    signedSessionAutobindHttpProof.technicianGeofenceReadTenantB = 'PASS';

    const evaluateGeofenceA = await queryHttp(port, '/api/v1/geofences/evaluate', tokenA, {
      method: 'POST',
      body: { longitude: 31.2357, latitude: 30.0444 }
    });
    const evaluateGeofenceB = await queryHttp(port, '/api/v1/geofences/evaluate', tokenB, {
      method: 'POST',
      body: { longitude: 31.1313, latitude: 29.9765 }
    });
    const evaluateForeignPointA = await queryHttp(port, '/api/v1/geofences/evaluate', tokenA, {
      method: 'POST',
      body: { longitude: 31.1313, latitude: 29.9765 }
    });
    if (evaluateGeofenceA.status !== 200
        || evaluateGeofenceA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evaluateGeofenceA.body?.organizationId !== tenantA
        || evaluateGeofenceA.body?.insideAny !== true
        || !evaluateGeofenceA.body?.matches?.some(row => row.id === createGeofenceA.body.id)
        || evaluateGeofenceB.status !== 200
        || evaluateGeofenceB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evaluateGeofenceB.body?.organizationId !== tenantB
        || evaluateGeofenceB.body?.insideAny !== true
        || !evaluateGeofenceB.body?.matches?.some(row => row.id === createGeofenceB.body.id)
        || evaluateForeignPointA.status !== 200
        || evaluateForeignPointA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evaluateForeignPointA.body?.organizationId !== tenantA
        || evaluateForeignPointA.body?.insideAny !== false
        || evaluateForeignPointA.body?.matches?.length !== 0) {
      throw new Error('SIGNED_CONTEXT_GEOFENCE_EVALUATION_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
        tenantA: { status: evaluateGeofenceA.status, body: evaluateGeofenceA.body },
        tenantB: { status: evaluateGeofenceB.status, body: evaluateGeofenceB.body },
        foreignPointAsTenantA: { status: evaluateForeignPointA.status, body: evaluateForeignPointA.body }
      }));
    }
    signedSessionAutobindHttpProof.geofenceEvaluationTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceEvaluationTenantB = 'PASS';
    signedSessionAutobindHttpProof.geofenceEvaluationForeignTenantHidden = 'PASS';

    const rolePolygonsA = await queryHttp(port, '/api/v1/geofences/role-polygons', tokenA);
    const rolePolygonsB = await queryHttp(port, '/api/v1/geofences/role-polygons', tokenB);
    if (rolePolygonsA.status !== 200
        || rolePolygonsA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || rolePolygonsA.body?.organizationId !== tenantA
        || !rolePolygonsA.body?.polygons?.some(row => row.id === createGeofenceA.body.id)
        || rolePolygonsA.body?.polygons?.some(row => row.id === createGeofenceB.body.id)
        || rolePolygonsB.status !== 200
        || rolePolygonsB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || rolePolygonsB.body?.organizationId !== tenantB
        || !rolePolygonsB.body?.polygons?.some(row => row.id === createGeofenceB.body.id)
        || rolePolygonsB.body?.polygons?.some(row => row.id === createGeofenceA.body.id)) {
      throw new Error('SIGNED_CONTEXT_GEOFENCE_ROLE_POLYGONS_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
        tenantA: { status: rolePolygonsA.status, body: rolePolygonsA.body },
        tenantB: { status: rolePolygonsB.status, body: rolePolygonsB.body }
      }));
    }
    signedSessionAutobindHttpProof.geofenceRolePolygonsTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceRolePolygonsTenantB = 'PASS';

    // Map viewport queries include both fixture coordinates in the same bbox;
    // database scoping must return only the caller tenant's located site.
    const viewportQuery = '?west=31.12&south=29.97&east=31.24&north=30.05&limit=20';
    const mapViewportA = await queryHttp(port, '/api/v1/map/viewport' + viewportQuery, tokenA);
    const mapViewportB = await queryHttp(port, '/api/v1/map/viewport' + viewportQuery, tokenB);
    for (const [label, response, ownSiteId, foreignSiteId, expectedTenant] of [
      ['tenantA', mapViewportA, createSiteA.body.id, createSiteB.body.id, tenantA],
      ['tenantB', mapViewportB, createSiteB.body.id, createSiteA.body.id, tenantB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.organizationId !== expectedTenant
          || !Array.isArray(response.body?.sites)
          || response.body.sites.length !== 1
          || response.body.sites[0].id !== ownSiteId
          || response.body.sites.some(row => row.id === foreignSiteId)
          || response.body?.counts?.sites !== 1) {
        throw new Error('SIGNED_CONTEXT_MAP_VIEWPORT_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.mapViewportTenantA = 'PASS';
    signedSessionAutobindHttpProof.mapViewportTenantB = 'PASS';


    // Complete the remaining declared appointment routes. The caller is a
    // technician-member: on-my-way/unreachable are allowed for its own
    // appointment; reschedule is manager-only and must be denied without mutation.
    const appointmentOnWayKeyA = 'signed-context-appointment-on-way-a-' + keyId;
    const appointmentOnWayKeyB = 'signed-context-appointment-on-way-b-' + keyId;
    const appointmentRescheduleMemberKey = 'signed-context-appointment-reschedule-member-' + keyId;
    const appointmentUnreachableKeyA = 'signed-context-appointment-unreachable-a-' + keyId;
    const appointmentUnreachableKeyB = 'signed-context-appointment-unreachable-b-' + keyId;
    synthetic.idempotencyKeys.push(
      appointmentOnWayKeyA,
      appointmentOnWayKeyB,
      appointmentRescheduleMemberKey,
      appointmentUnreachableKeyA,
      appointmentUnreachableKeyB
    );
    const appointmentConfigKeyA = 'appointment_unreachable:' + createAppointmentA.body.id;
    const appointmentConfigKeyB = 'appointment_unreachable:' + createAppointmentB.body.id;
    synthetic.operationalConfigKeys.push(appointmentConfigKeyA, appointmentConfigKeyB);

    const rescheduleMemberB = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id) + '/reschedule',
      tokenB,
      {
        method: 'POST',
        headers: { 'idempotency-key': appointmentRescheduleMemberKey },
        body: {
          reason: 'CI member role must not reschedule',
          startAt: new Date(appointmentBase + 300 * 60 * 1000).toISOString(),
          endAt: new Date(appointmentBase + 360 * 60 * 1000).toISOString()
        }
      }
    );
    if (rescheduleMemberB.status !== 403
        || rescheduleMemberB.body?.error?.code !== 'FORBIDDEN'
        || rescheduleMemberB.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_RESCHEDULE_MEMBER_NOT_DENIED:' + JSON.stringify({
        status: rescheduleMemberB.status,
        body: rescheduleMemberB.body
      }));
    }
    const appointmentAfterDeniedReschedule = await queryHttp(
      port, '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id), tokenB
    );
    if (appointmentAfterDeniedReschedule.status !== 200
        || appointmentAfterDeniedReschedule.body?.status !== 'confirmed'
        || appointmentAfterDeniedReschedule.body?.start_at !== updateAppointmentB.body.start_at) {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_RESCHEDULE_DENIAL_MUTATED_ROW:' + JSON.stringify({
        status: appointmentAfterDeniedReschedule.status,
        body: appointmentAfterDeniedReschedule.body
      }));
    }
    signedSessionAutobindHttpProof.appointmentRescheduleMemberDenied = 'PASS';
    signedSessionAutobindHttpProof.appointmentRescheduleDenialNoMutation = 'PASS';


    // Positive reschedule path: elevate only the disposable Tenant B membership
    // for this one HTTP call, then restore and verify the original member role.
    // The separate member-denial test above remains a distinct assertion.
    const managerRescheduleKey = 'signed-context-appointment-manager-reschedule-' + keyId;
    synthetic.idempotencyKeys.push(managerRescheduleKey);
    const memberRoleBeforeReschedule = await owner.query(
      'SELECT role FROM public.memberships WHERE user_id=$1 AND organization_id=$2',
      [userB, tenantB]
    );
    if (memberRoleBeforeReschedule.rows[0]?.role !== 'member') {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_MANAGER_FIXTURE_ROLE_NOT_MEMBER:' + JSON.stringify({
        role: memberRoleBeforeReschedule.rows[0]?.role || null
      }));
    }
    const promoteResult = await owner.query(
      "UPDATE public.memberships SET role='manager' WHERE user_id=$1 AND organization_id=$2 AND role='member'",
      [userB, tenantB]
    );
    if (promoteResult.rowCount !== 1) {
      throw new Error('SIGNED_CONTEXT_APPOINTMENT_MANAGER_TEMPORARY_PROMOTION_FAILED:' + JSON.stringify({
        rowCount: promoteResult.rowCount
      }));
    }
    let managerRescheduleResponse = null;
    let roleRestoreResult = null;
    try {
      const managerStartAt = new Date(appointmentBase + 300 * 60 * 1000).toISOString();
      const managerEndAt = new Date(appointmentBase + 360 * 60 * 1000).toISOString();
      managerRescheduleResponse = await queryHttp(
        port,
        '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id) + '/reschedule',
        tokenB,
        {
          method: 'POST',
          headers: { 'idempotency-key': managerRescheduleKey },
          body: {
            reason: 'CI manager-authorized reschedule',
            startAt: managerStartAt,
            endAt: managerEndAt
          }
        }
      );
      if (managerRescheduleResponse.status !== 200
          || managerRescheduleResponse.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || managerRescheduleResponse.body?.auditStatus !== 'persisted'
          || managerRescheduleResponse.body?.reason !== 'CI manager-authorized reschedule'
          || managerRescheduleResponse.body?.appointment?.id !== createAppointmentB.body.id
          || managerRescheduleResponse.body?.appointment?.organization_id !== tenantB
          || managerRescheduleResponse.body?.appointment?.work_order_id !== synthetic.workOrderIds[1]
          || managerRescheduleResponse.body?.appointment?.technician_id !== userB
          || managerRescheduleResponse.body?.appointment?.status !== 'confirmed'
          || managerRescheduleResponse.body?.appointment?.start_at !== managerStartAt
          || managerRescheduleResponse.body?.appointment?.end_at !== managerEndAt) {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_MANAGER_RESCHEDULE_FAILED:' + JSON.stringify({
          status: managerRescheduleResponse.status,
          body: managerRescheduleResponse.body,
          signedHeader: managerRescheduleResponse.headers?.['x-opscore-signed-tenant-context'] || null
        }));
      }
      signedSessionAutobindHttpProof.appointmentRescheduleManagerTenantB = 'PASS';
      signedSessionAutobindHttpProof.appointmentRescheduleAuditPersistedTenantB = 'PASS';
    } finally {
      roleRestoreResult = await owner.query(
        "UPDATE public.memberships SET role='member' WHERE user_id=$1 AND organization_id=$2 AND role='manager'",
        [userB, tenantB]
      );
      const restoredRole = await owner.query(
        'SELECT role FROM public.memberships WHERE user_id=$1 AND organization_id=$2',
        [userB, tenantB]
      );
      if (roleRestoreResult.rowCount !== 1 || restoredRole.rows[0]?.role !== 'member') {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_MANAGER_FIXTURE_ROLE_RESTORE_FAILED:' + JSON.stringify({
          updateCount: roleRestoreResult.rowCount,
          role: restoredRole.rows[0]?.role || null
        }));
      }
      signedSessionAutobindHttpProof.appointmentRescheduleManagerRoleRestored = 'PASS';
    }

    const onWayA = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentA.body.id) + '/on-my-way',
      tokenA,
      { method: 'POST', headers: { 'idempotency-key': appointmentOnWayKeyA } }
    );
    const onWayB = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id) + '/on-my-way',
      tokenB,
      { method: 'POST', headers: { 'idempotency-key': appointmentOnWayKeyB } }
    );
    for (const [label, response, expectedTenant, expectedId, expectedWorkOrder, expectedTech] of [
      ['tenantA', onWayA, tenantA, createAppointmentA.body.id, synthetic.workOrderIds[0], userA],
      ['tenantB', onWayB, tenantB, createAppointmentB.body.id, synthetic.workOrderIds[1], userB]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.id !== expectedId
          || response.body?.organization_id !== expectedTenant
          || response.body?.work_order_id !== expectedWorkOrder
          || response.body?.technician_id !== expectedTech
          || response.body?.status !== 'en_route') {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_ON_MY_WAY_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.appointmentOnMyWayTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentOnMyWayTenantB = 'PASS';

    const unreachableA = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentA.body.id) + '/unreachable',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': appointmentUnreachableKeyA },
        body: { reasonCode: 'CI_FIELD_UNREACHABLE', detail: 'signed tenant route acceptance' }
      }
    );
    const unreachableB = await queryHttp(
      port,
      '/api/v1/appointments/' + encodeURIComponent(createAppointmentB.body.id) + '/unreachable',
      tokenB,
      {
        method: 'POST',
        headers: { 'idempotency-key': appointmentUnreachableKeyB },
        body: { reasonCode: 'CI_FIELD_UNREACHABLE', detail: 'signed tenant route acceptance' }
      }
    );
    for (const [label, response, expectedId, expectedTenant, expectedWorkOrder] of [
      ['tenantA', unreachableA, createAppointmentA.body.id, tenantA, synthetic.workOrderIds[0]],
      ['tenantB', unreachableB, createAppointmentB.body.id, tenantB, synthetic.workOrderIds[1]]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.appointment?.id !== expectedId
          || response.body?.appointment?.organization_id !== expectedTenant
          || response.body?.appointment?.work_order_id !== expectedWorkOrder
          || response.body?.appointment?.status !== 'no_show'
          || response.body?.reasonCode !== 'CI_FIELD_UNREACHABLE'
          || !response.body?.operationalJobId) {
        throw new Error('SIGNED_CONTEXT_APPOINTMENT_UNREACHABLE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.appointmentUnreachableTenantA = 'PASS';
    signedSessionAutobindHttpProof.appointmentUnreachableTenantB = 'PASS';

    // Signed geo-access assertion and dynamic-geofence event persistence.
    const geoAccessA = await queryHttp(port, '/api/v1/geofences/assert-access', tokenA, {
      method: 'POST', body: { longitude: 31.2357, latitude: 30.0444 }
    });
    const geoAccessB = await queryHttp(port, '/api/v1/geofences/assert-access', tokenB, {
      method: 'POST', body: { longitude: 31.1313, latitude: 29.9765 }
    });
    for (const [label, response, expectedPoint] of [
      ['tenantA', geoAccessA, { longitude: 31.2357, latitude: 30.0444 }],
      ['tenantB', geoAccessB, { longitude: 31.1313, latitude: 29.9765 }]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.allow !== true
          || response.body?.point?.longitude !== expectedPoint.longitude
          || response.body?.point?.latitude !== expectedPoint.latitude) {
        throw new Error('SIGNED_CONTEXT_GEOFENCE_ASSERT_ACCESS_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.geofenceAssertAccessTenantA = 'PASS';
    signedSessionAutobindHttpProof.geofenceAssertAccessTenantB = 'PASS';

    const dynamicGeofenceSourceA = 'signed-context-dynamic-geofence-a-' + keyId;
    const dynamicGeofenceSourceB = 'signed-context-dynamic-geofence-b-' + keyId;
    const dynamicGeofenceKeyA = 'signed-context-dynamic-geofence-write-a-' + keyId;
    const dynamicGeofenceKeyB = 'signed-context-dynamic-geofence-write-b-' + keyId;
    const dynamicGeofenceReplayKeyA = 'signed-context-dynamic-geofence-replay-a-' + keyId;
    synthetic.dynamicGeofenceSourceEventIds.push(dynamicGeofenceSourceA, dynamicGeofenceSourceB);
    synthetic.idempotencyKeys.push(dynamicGeofenceKeyA, dynamicGeofenceKeyB, dynamicGeofenceReplayKeyA);
    const dynamicActiveFrom = new Date(Date.now() - 60 * 1000).toISOString();
    const dynamicExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const dynamicGeofenceEventA = {
      source: 'signed-context-ci',
      eventType: 'hazard',
      severity: 'high',
      latitude: 30.0444,
      longitude: 31.2357,
      radiusM: 300,
      reason: 'Synthetic signed-tenant geofence hazard for tenant A',
      sourceEventId: dynamicGeofenceSourceA,
      activeFrom: dynamicActiveFrom,
      expiresAt: dynamicExpiresAt,
      geofenceId: createGeofenceA.body.id
    };
    const dynamicGeofenceEventB = {
      source: 'signed-context-ci',
      eventType: 'restriction',
      severity: 'medium',
      latitude: 29.9765,
      longitude: 31.1313,
      radiusM: 300,
      reason: 'Synthetic signed-tenant restriction for tenant B',
      sourceEventId: dynamicGeofenceSourceB,
      activeFrom: dynamicActiveFrom,
      expiresAt: dynamicExpiresAt,
      geofenceId: createGeofenceB.body.id
    };
    const dynamicWriteA = await queryHttp(port, '/api/v1/geofences/dynamic-events', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': dynamicGeofenceKeyA },
      body: dynamicGeofenceEventA
    });
    if (dynamicWriteA.body?.id) synthetic.dynamicGeofenceIds.push(dynamicWriteA.body.id);
    if (dynamicWriteA.status !== 201
        || dynamicWriteA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || dynamicWriteA.body?.organizationId !== tenantA
        || dynamicWriteA.body?.sourceEventId !== dynamicGeofenceSourceA
        || dynamicWriteA.body?.replayed !== false) {
      throw new Error('SIGNED_CONTEXT_DYNAMIC_GEOFENCE_WRITE_TENANT_A_FAILED:' + JSON.stringify({
        status: dynamicWriteA.status, body: dynamicWriteA.body
      }));
    }
    const dynamicWriteB = await queryHttp(port, '/api/v1/geofences/dynamic-events', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': dynamicGeofenceKeyB },
      body: dynamicGeofenceEventB
    });
    if (dynamicWriteB.body?.id) synthetic.dynamicGeofenceIds.push(dynamicWriteB.body.id);
    if (dynamicWriteB.status !== 201
        || dynamicWriteB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || dynamicWriteB.body?.organizationId !== tenantB
        || dynamicWriteB.body?.sourceEventId !== dynamicGeofenceSourceB
        || dynamicWriteB.body?.replayed !== false) {
      throw new Error('SIGNED_CONTEXT_DYNAMIC_GEOFENCE_WRITE_TENANT_B_FAILED:' + JSON.stringify({
        status: dynamicWriteB.status, body: dynamicWriteB.body
      }));
    }
    const dynamicReplayA = await queryHttp(port, '/api/v1/geofences/dynamic-events', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': dynamicGeofenceReplayKeyA },
      body: dynamicGeofenceEventA
    });
    if (dynamicReplayA.status !== 201
        || dynamicReplayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || dynamicReplayA.body?.id !== dynamicWriteA.body.id
        || dynamicReplayA.body?.replayed !== true) {
      throw new Error('SIGNED_CONTEXT_DYNAMIC_GEOFENCE_DOMAIN_REPLAY_FAILED:' + JSON.stringify({
        status: dynamicReplayA.status, body: dynamicReplayA.body
      }));
    }
    signedSessionAutobindHttpProof.dynamicGeofenceWriteTenantA = 'PASS';
    signedSessionAutobindHttpProof.dynamicGeofenceWriteTenantB = 'PASS';
    signedSessionAutobindHttpProof.dynamicGeofenceSourceEventReplay = 'PASS';

    // This route previously called ctx(req) a second time after the global
    // requireCtx gate, which would attempt to downgrade a signed field principal
    // back to legacy auth-mode GUCs. It must reuse the already authenticated c.
    const customDomainA = await queryHttp(
      port, '/api/v1/custom-domains/resolve?hostname=' + encodeURIComponent('unregistered-' + keyId + '.invalid'), tokenA
    );
    const customDomainB = await queryHttp(
      port, '/api/v1/custom-domains/resolve?hostname=' + encodeURIComponent('unregistered-' + keyId + '.invalid'), tokenB
    );
    if (customDomainA.status !== 200 || customDomainA.body?.resolved !== false
        || customDomainA.body?.tenant !== null
        || customDomainB.status !== 200 || customDomainB.body?.resolved !== false
        || customDomainB.body?.tenant !== null) {
      throw new Error('SIGNED_SESSION_CUSTOM_DOMAIN_RESOLUTION_FAILED:' + JSON.stringify({
        tenantA: { status: customDomainA.status, body: customDomainA.body },
        tenantB: { status: customDomainB.status, body: customDomainB.body },
        serverOutput: serverOutput.slice(-3000)
      }));
    }
    signedSessionAutobindHttpProof.customDomainResolutionTenantA = 'PASS';
    signedSessionAutobindHttpProof.customDomainResolutionTenantB = 'PASS';
    signedSessionAutobindHttpProof.noAuthModeDowngrade = 'PASS';

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
            responseBody: response.body ?? null,
            serverOutput: serverOutput.slice(-4000)
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
    const signedEvidenceRouteProof = {};
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

    // Evidence and attachment writes must use the same signed transaction
    // as work-order writes, including the child-table RLS check and disk cleanup.
    const evidenceBytesA = Buffer.from('tenant A signed evidence ' + keyId, 'utf8');
    const evidenceBytesB = Buffer.from('tenant B signed evidence ' + keyId, 'utf8');
    const evidenceShaA = crypto.createHash('sha256').update(evidenceBytesA).digest('hex');
    const evidenceShaB = crypto.createHash('sha256').update(evidenceBytesB).digest('hex');
    const evidenceBase64A = evidenceBytesA.toString('base64');
    const evidenceBase64B = evidenceBytesB.toString('base64');
    const evidenceInitKeyA = 'signed-context-ci-evidence-init-a-' + keyId;
    const evidenceInitKeyB = 'signed-context-ci-evidence-init-b-' + keyId;
    synthetic.idempotencyKeys.push(evidenceInitKeyA, evidenceInitKeyB);

    const evidenceInitA = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/evidence-uploads',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': evidenceInitKeyA },
        body: { fileName: 'tenant-a-evidence.txt', mediaType: 'text/plain', totalBytes: evidenceBytesA.length, sha256: evidenceShaA }
      }
    );
    if (evidenceInitA.status !== 201
        || evidenceInitA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceInitA.headers?.['x-idempotency-replayed'] !== 'false'
        || !evidenceInitA.body?.uploadId
        || evidenceInitA.body?.status !== 'initiated') {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_INIT_TENANT_A_FAILED:' + JSON.stringify({
        status: evidenceInitA.status, body: evidenceInitA.body,
        headers: evidenceInitA.headers
      }));
    }
    synthetic.evidenceUploadIds.push(evidenceInitA.body.uploadId);
    signedEvidenceRouteProof.initiateTenantA = 'PASS';

    const evidenceInitReplayA = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/evidence-uploads',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': evidenceInitKeyA },
        body: { fileName: 'tenant-a-evidence.txt', mediaType: 'text/plain', totalBytes: evidenceBytesA.length, sha256: evidenceShaA }
      }
    );
    if (evidenceInitReplayA.status !== 200
        || evidenceInitReplayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceInitReplayA.headers?.['x-idempotency-replayed'] !== 'true'
        || evidenceInitReplayA.body?.uploadId !== evidenceInitA.body.uploadId) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_INIT_REPLAY_FAILED:' + JSON.stringify({
        status: evidenceInitReplayA.status, body: evidenceInitReplayA.body,
        headers: evidenceInitReplayA.headers
      }));
    }
    signedEvidenceRouteProof.initiateIdempotencyReplay = 'PASS';

    const evidenceInitB = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/evidence-uploads',
      tokenB,
      {
        method: 'POST',
        headers: { 'idempotency-key': evidenceInitKeyB },
        body: { fileName: 'tenant-b-evidence.txt', mediaType: 'text/plain', totalBytes: evidenceBytesB.length, sha256: evidenceShaB }
      }
    );
    if (evidenceInitB.status !== 201
        || evidenceInitB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || !evidenceInitB.body?.uploadId
        || evidenceInitB.body?.status !== 'initiated') {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_INIT_TENANT_B_FAILED:' + JSON.stringify({
        status: evidenceInitB.status, body: evidenceInitB.body,
        headers: evidenceInitB.headers
      }));
    }
    synthetic.evidenceUploadIds.push(evidenceInitB.body.uploadId);
    signedEvidenceRouteProof.initiateTenantB = 'PASS';

    const foreignEvidenceChunk = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitB.body.uploadId) + '/chunks/0',
      tokenA,
      { method: 'PUT', body: { contentBase64: evidenceBase64B } }
    );
    if (foreignEvidenceChunk.status !== 404
        || foreignEvidenceChunk.body?.error?.code !== 'NOT_FOUND'
        || foreignEvidenceChunk.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_FOREIGN_EVIDENCE_CHUNK_NOT_DENIED:' + JSON.stringify({
        status: foreignEvidenceChunk.status, body: foreignEvidenceChunk.body,
        headers: foreignEvidenceChunk.headers
      }));
    }
    signedEvidenceRouteProof.crossTenantChunkDenied = 'PASS';

    const evidenceChunkA = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitA.body.uploadId) + '/chunks/0',
      tokenA,
      { method: 'PUT', body: { contentBase64: evidenceBase64A } }
    );
    if (evidenceChunkA.status !== 200
        || evidenceChunkA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceChunkA.body?.status !== 'ready'
        || evidenceChunkA.body?.sha256 !== evidenceShaA) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_TENANT_A_FAILED:' + JSON.stringify({
        status: evidenceChunkA.status, body: evidenceChunkA.body,
        headers: evidenceChunkA.headers
      }));
    }
    const persistedChunkA = await owner.query(
      'SELECT COUNT(*)::int AS count FROM public.evidence_upload_chunks WHERE upload_id=$1 AND chunk_index=0',
      [evidenceInitA.body.uploadId]
    );
    if (persistedChunkA.rows[0]?.count !== 1) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_A_NOT_PERSISTED_AFTER_HTTP_COMMIT:' + JSON.stringify(persistedChunkA.rows[0]));
    }
    signedEvidenceRouteProof.chunkTenantA = 'PASS';
    signedEvidenceRouteProof.chunkTenantAPersisted = 'PASS';

    if (!candidateMode) {
      const evidenceChunkPolicies = await owner.query(
        `SELECT policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies
         WHERE schemaname='public' AND tablename='evidence_upload_chunks'
         ORDER BY policyname`
      );
      await runtimeProbe.query('BEGIN READ ONLY');
      const evidenceRuntimeIdentity = await beginReadOnly(runtimeProbe);
      const evidenceRuntimeAssertion = createSignedTenantContext({
        principal: { sessionId: sessionA, userId: userA, tenantId: tenantA },
        backendPid: evidenceRuntimeIdentity.backendPid,
        transactionId: evidenceRuntimeIdentity.transactionId,
        env: { OPSC_TENANT_CONTEXT_HMAC_KEY: keyHex, OPSC_TENANT_CONTEXT_KEY_ID: keyId }
      });
      await bindAssertion(runtimeProbe, evidenceRuntimeAssertion);
      const evidenceRuntimeVisibility = await runtimeProbe.query(
        `SELECT public.opscore_current_tenant() AS signed_tenant,
                (SELECT COUNT(*)::int FROM public.evidence_uploads WHERE id=$1 AND organization_id=$2) AS parent_count,
                (SELECT COUNT(*)::int FROM public.evidence_upload_chunks WHERE upload_id=$1) AS chunk_count`,
        [evidenceInitA.body.uploadId, tenantA]
      );
      await runtimeProbe.query('COMMIT');
      if (evidenceRuntimeVisibility.rows[0]?.signed_tenant !== tenantA
          || evidenceRuntimeVisibility.rows[0]?.parent_count !== 1
          || evidenceRuntimeVisibility.rows[0]?.chunk_count !== 1) {
        throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_RUNTIME_RLS_VISIBILITY_DIAGNOSTIC:' + JSON.stringify({
          visibility: evidenceRuntimeVisibility.rows[0] || null,
          policies: evidenceChunkPolicies.rows
        }));
      }
      signedEvidenceRouteProof.runtimeSignedChunkVisibility = 'PASS';
  
  
    }

    const duplicateEvidenceChunkA = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitA.body.uploadId) + '/chunks/0',
      tokenA,
      { method: 'PUT', body: { contentBase64: evidenceBase64A } }
    );
    if (duplicateEvidenceChunkA.status !== 200
        || duplicateEvidenceChunkA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || duplicateEvidenceChunkA.body?.status !== 'duplicate'
        || duplicateEvidenceChunkA.body?.sha256 !== evidenceShaA) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_IDEMPOTENT_REPLAY_FAILED:' + JSON.stringify({
        status: duplicateEvidenceChunkA.status, body: duplicateEvidenceChunkA.body,
        headers: duplicateEvidenceChunkA.headers
      }));
    }
    signedEvidenceRouteProof.chunkDuplicateReplay = 'PASS';

    const evidenceChunkB = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitB.body.uploadId) + '/chunks/0',
      tokenB,
      { method: 'PUT', body: { contentBase64: evidenceBase64B } }
    );
    if (evidenceChunkB.status !== 200
        || evidenceChunkB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceChunkB.body?.status !== 'ready'
        || evidenceChunkB.body?.sha256 !== evidenceShaB) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_TENANT_B_FAILED:' + JSON.stringify({
        status: evidenceChunkB.status, body: evidenceChunkB.body,
        headers: evidenceChunkB.headers
      }));
    }
    const persistedChunkB = await owner.query(
      'SELECT COUNT(*)::int AS count FROM public.evidence_upload_chunks WHERE upload_id=$1 AND chunk_index=0',
      [evidenceInitB.body.uploadId]
    );
    if (persistedChunkB.rows[0]?.count !== 1) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_CHUNK_B_NOT_PERSISTED_AFTER_HTTP_COMMIT:' + JSON.stringify(persistedChunkB.rows[0]));
    }
    signedEvidenceRouteProof.chunkTenantB = 'PASS';
    signedEvidenceRouteProof.chunkTenantBPersisted = 'PASS';

    const foreignEvidenceComplete = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitB.body.uploadId) + '/complete',
      tokenA,
      { method: 'POST' }
    );
    if (foreignEvidenceComplete.status !== 404
        || foreignEvidenceComplete.body?.error?.code !== 'NOT_FOUND'
        || foreignEvidenceComplete.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_FOREIGN_EVIDENCE_COMPLETE_NOT_DENIED:' + JSON.stringify({
        status: foreignEvidenceComplete.status, body: foreignEvidenceComplete.body,
        headers: foreignEvidenceComplete.headers
      }));
    }
    signedEvidenceRouteProof.crossTenantCompleteDenied = 'PASS';

    const evidenceCompleteA = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitA.body.uploadId) + '/complete',
      tokenA,
      { method: 'POST' }
    );
    if (evidenceCompleteA.status !== 201
        || evidenceCompleteA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceCompleteA.body?.organization_id !== tenantA
        || evidenceCompleteA.body?.sha256 !== evidenceShaA
        || evidenceCompleteA.body?.work_order_id !== synthetic.workOrderIds[0]) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_COMPLETE_TENANT_A_FAILED:' + JSON.stringify({
        status: evidenceCompleteA.status, body: evidenceCompleteA.body,
        headers: evidenceCompleteA.headers
      }));
    }
    synthetic.attachmentIds.push(evidenceCompleteA.body.id);
    signedEvidenceRouteProof.completeTenantA = 'PASS';

    const evidenceCompleteReplayA = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitA.body.uploadId) + '/complete',
      tokenA,
      { method: 'POST' }
    );
    if (evidenceCompleteReplayA.status !== 201
        || evidenceCompleteReplayA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceCompleteReplayA.body?.id !== evidenceCompleteA.body.id) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_COMPLETE_REPLAY_FAILED:' + JSON.stringify({
        status: evidenceCompleteReplayA.status, body: evidenceCompleteReplayA.body,
        headers: evidenceCompleteReplayA.headers
      }));
    }
    signedEvidenceRouteProof.completeIdempotencyReplay = 'PASS';

    const evidenceCompleteB = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(evidenceInitB.body.uploadId) + '/complete',
      tokenB,
      { method: 'POST' }
    );
    if (evidenceCompleteB.status !== 201
        || evidenceCompleteB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || evidenceCompleteB.body?.organization_id !== tenantB
        || evidenceCompleteB.body?.sha256 !== evidenceShaB
        || evidenceCompleteB.body?.work_order_id !== synthetic.workOrderIds[1]) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_COMPLETE_TENANT_B_FAILED:' + JSON.stringify({
        status: evidenceCompleteB.status, body: evidenceCompleteB.body,
        headers: evidenceCompleteB.headers
      }));
    }
    synthetic.attachmentIds.push(evidenceCompleteB.body.id);
    signedEvidenceRouteProof.completeTenantB = 'PASS';

    const mismatchActual = Buffer.from('actual evidence bytes ' + keyId, 'utf8');
    const mismatchExpected = Buffer.from('different expected bytes ' + keyId, 'utf8');
    const mismatchExpectedSha = crypto.createHash('sha256').update(mismatchExpected).digest('hex');
    const mismatchUploadKey = 'signed-context-ci-evidence-mismatch-' + keyId;
    synthetic.idempotencyKeys.push(mismatchUploadKey);
    const mismatchInit = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/evidence-uploads',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': mismatchUploadKey },
        body: { fileName: 'integrity-mismatch.txt', mediaType: 'text/plain', totalBytes: mismatchActual.length, sha256: mismatchExpectedSha }
      }
    );
    if (mismatchInit.status !== 201
        || mismatchInit.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || !mismatchInit.body?.uploadId) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_MISMATCH_INIT_FAILED:' + JSON.stringify({
        status: mismatchInit.status, body: mismatchInit.body, headers: mismatchInit.headers
      }));
    }
    synthetic.evidenceUploadIds.push(mismatchInit.body.uploadId);
    const mismatchChunk = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(mismatchInit.body.uploadId) + '/chunks/0',
      tokenA,
      { method: 'PUT', body: { contentBase64: mismatchActual.toString('base64') } }
    );
    if (mismatchChunk.status !== 200
        || mismatchChunk.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || mismatchChunk.body?.status !== 'ready') {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_MISMATCH_CHUNK_FAILED:' + JSON.stringify({
        status: mismatchChunk.status, body: mismatchChunk.body, headers: mismatchChunk.headers
      }));
    }
    const mismatchComplete = await queryHttp(
      port,
      '/api/v1/evidence-uploads/' + encodeURIComponent(mismatchInit.body.uploadId) + '/complete',
      tokenA,
      { method: 'POST' }
    );
    const mismatchState = await owner.query(
      'SELECT status,last_error FROM public.evidence_uploads WHERE id=$1 AND organization_id=$2',
      [mismatchInit.body.uploadId, tenantA]
    );
    const mismatchTemp = candidateMode ? null : path.join(
      evidenceRoot, tenantA, '.evidence', mismatchInit.body.uploadId, 'assembled.bin'
    );
    if (mismatchComplete.status < 400
        || mismatchComplete.body?.error?.code !== 'EVIDENCE_INTEGRITY_MISMATCH'
        || mismatchComplete.headers?.['x-opscore-signed-tenant-context'] === 'verified'
        || mismatchState.rows[0]?.status !== 'failed'
        || mismatchState.rows[0]?.last_error !== 'EVIDENCE_INTEGRITY_MISMATCH'
        || (!candidateMode && fs.existsSync(mismatchTemp))) {
      throw new Error('SIGNED_CONTEXT_EVIDENCE_MISMATCH_STATE_NOT_COMMITTED:' + JSON.stringify({
        status: mismatchComplete.status, body: mismatchComplete.body,
        headers: mismatchComplete.headers, state: mismatchState.rows[0] || null,
        tempExists: fs.existsSync(mismatchTemp)
      }));
    }
    signedEvidenceRouteProof.integrityMismatchFailureCommitted = 'PASS';

    const directAttachmentBytesA = Buffer.from('tenant A direct attachment ' + keyId, 'utf8');
    const directAttachmentBytesB = Buffer.from('tenant B direct attachment ' + keyId, 'utf8');
    const directAttachmentKeyA = 'signed-context-ci-direct-attachment-a-' + keyId;
    const directAttachmentKeyB = 'signed-context-ci-direct-attachment-b-' + keyId;
    const directAttachmentForeignKey = 'signed-context-ci-direct-attachment-foreign-' + keyId;
    synthetic.idempotencyKeys.push(directAttachmentKeyA, directAttachmentKeyB, directAttachmentForeignKey);

    const foreignDirectAttachment = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/attachments',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': directAttachmentForeignKey },
        body: {
          fileName: 'foreign-attachment.txt',
          mediaType: 'text/plain',
          contentBase64: directAttachmentBytesB.toString('base64')
        }
      }
    );
    if (foreignDirectAttachment.status !== 404
        || foreignDirectAttachment.body?.error?.code !== 'NOT_FOUND'
        || foreignDirectAttachment.headers?.['x-opscore-signed-tenant-context'] === 'verified') {
      throw new Error('SIGNED_CONTEXT_FOREIGN_DIRECT_ATTACHMENT_NOT_DENIED:' + JSON.stringify({
        status: foreignDirectAttachment.status, body: foreignDirectAttachment.body,
        headers: foreignDirectAttachment.headers
      }));
    }
    signedEvidenceRouteProof.crossTenantDirectAttachmentDenied = 'PASS';

    const directAttachmentA = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/attachments',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': directAttachmentKeyA },
        body: {
          fileName: 'tenant-a-direct.txt',
          mediaType: 'text/plain',
          contentBase64: directAttachmentBytesA.toString('base64')
        }
      }
    );
    if (directAttachmentA.status !== 201
        || directAttachmentA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || directAttachmentA.body?.organization_id !== tenantA
        || directAttachmentA.body?.work_order_id !== synthetic.workOrderIds[0]) {
      throw new Error('SIGNED_CONTEXT_DIRECT_ATTACHMENT_TENANT_A_FAILED:' + JSON.stringify({
        status: directAttachmentA.status, body: directAttachmentA.body,
        headers: directAttachmentA.headers
      }));
    }
    synthetic.attachmentIds.push(directAttachmentA.body.id);
    signedEvidenceRouteProof.directAttachmentTenantA = 'PASS';

    const directAttachmentB = await queryHttp(
      port,
      '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/attachments',
      tokenB,
      {
        method: 'POST',
        headers: { 'idempotency-key': directAttachmentKeyB },
        body: {
          fileName: 'tenant-b-direct.txt',
          mediaType: 'text/plain',
          contentBase64: directAttachmentBytesB.toString('base64')
        }
      }
    );
    if (directAttachmentB.status !== 201
        || directAttachmentB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || directAttachmentB.body?.organization_id !== tenantB
        || directAttachmentB.body?.work_order_id !== synthetic.workOrderIds[1]) {
      throw new Error('SIGNED_CONTEXT_DIRECT_ATTACHMENT_TENANT_B_FAILED:' + JSON.stringify({
        status: directAttachmentB.status, body: directAttachmentB.body,
        headers: directAttachmentB.headers
      }));
    }
    synthetic.attachmentIds.push(directAttachmentB.body.id);
    signedEvidenceRouteProof.directAttachmentTenantB = 'PASS';

    if (!candidateMode) {
      // Force a database failure after storeAttachment writes the file and row,
      // but before idempotency persistence. The outer signed transaction must
      // roll back and execute its filesystem compensation callback.
      const rollbackIdempotencyKey = 'signed-context-ci-force-evidence-rollback-' + keyId;
      synthetic.idempotencyKeys.push(rollbackIdempotencyKey);
      await owner.query(`
        CREATE OR REPLACE FUNCTION opscore_security.ci_reject_signed_evidence_rollback()
        RETURNS trigger LANGUAGE plpgsql AS $rollback$
        BEGIN
          IF NEW.idempotency_key = '${rollbackIdempotencyKey}' THEN
            RAISE EXCEPTION 'CI_FORCED_SIGNED_EVIDENCE_ROLLBACK';
          END IF;
          RETURN NEW;
        END
        $rollback$
      `);
      await owner.query('DROP TRIGGER IF EXISTS ci_reject_signed_evidence_rollback ON public.idempotency_records');
      await owner.query(`
        CREATE TRIGGER ci_reject_signed_evidence_rollback
        BEFORE INSERT ON public.idempotency_records
        FOR EACH ROW EXECUTE FUNCTION opscore_security.ci_reject_signed_evidence_rollback()
      `);
      evidenceRollbackTriggerInstalled = true;
  
      const forcedRollback = await queryHttp(
        port,
        '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/attachments',
        tokenA,
        {
          method: 'POST',
          headers: { 'idempotency-key': rollbackIdempotencyKey },
          body: {
            fileName: 'rollback-cleanup.txt',
            mediaType: 'text/plain',
            contentBase64: Buffer.from('must be removed after rollback ' + keyId, 'utf8').toString('base64')
          }
        }
      );
      const rollbackAttachmentRows = await owner.query(
        "SELECT COUNT(*)::int AS count FROM public.attachments WHERE organization_id=$1 AND work_order_id=$2 AND file_name='rollback-cleanup.txt'",
        [tenantA, synthetic.workOrderIds[0]]
      );
      const tenantAStorageRoot = path.join(evidenceRoot, tenantA);
      const rollbackFileExists = fs.existsSync(tenantAStorageRoot)
        && fs.readdirSync(tenantAStorageRoot).some(name => name.endsWith('-rollback-cleanup.txt'));
      await owner.query('DROP TRIGGER IF EXISTS ci_reject_signed_evidence_rollback ON public.idempotency_records');
      await owner.query('DROP FUNCTION IF EXISTS opscore_security.ci_reject_signed_evidence_rollback()');
      evidenceRollbackTriggerInstalled = false;
      if (forcedRollback.status < 400
          || forcedRollback.headers?.['x-opscore-signed-tenant-context'] === 'verified'
          || rollbackAttachmentRows.rows[0]?.count !== 0
          || rollbackFileExists) {
        throw new Error('SIGNED_CONTEXT_EVIDENCE_ROLLBACK_COMPENSATION_FAILED:' + JSON.stringify({
          status: forcedRollback.status, body: forcedRollback.body,
          headers: forcedRollback.headers,
          databaseRows: rollbackAttachmentRows.rows[0]?.count,
          fileExists: rollbackFileExists
        }));
      }
      signedEvidenceRouteProof.outerRollbackRemovedFileAndRow = 'PASS';
  
  
    }

    const attachmentsA = await queryHttp(
      port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[0]) + '/attachments', tokenA
    );
    const attachmentsB = await queryHttp(
      port, '/api/v1/work-orders/' + encodeURIComponent(synthetic.workOrderIds[1]) + '/attachments', tokenB
    );
    if (attachmentsA.status !== 200
        || attachmentsA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || !Array.isArray(attachmentsA.body)
        || attachmentsA.body.some(row => row.organization_id !== undefined && row.organization_id !== tenantA)
        || !attachmentsA.body.some(row => row.id === directAttachmentA.body.id)
        || attachmentsB.status !== 200
        || attachmentsB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || !Array.isArray(attachmentsB.body)
        || attachmentsB.body.some(row => row.organization_id !== undefined && row.organization_id !== tenantB)
        || !attachmentsB.body.some(row => row.id === directAttachmentB.body.id)
        || attachmentsB.body.some(row => row.id === directAttachmentA.body.id || row.id === evidenceCompleteA.body.id)) {
      throw new Error('SIGNED_CONTEXT_ATTACHMENT_LIST_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
        tenantA: { status: attachmentsA.status, body: attachmentsA.body },
        tenantB: { status: attachmentsB.status, body: attachmentsB.body }
      }));
    }
    signedEvidenceRouteProof.attachmentListsTenantIsolated = 'PASS';

    // Remaining fault routes: create, transition and unreachable. The resulting
    // work orders, incident jobs, config entries and audit rows are all tracked
    // for deterministic cleanup in this disposable database.
    const faultCreateKeyA = 'signed-context-fault-create-a-' + keyId;
    const faultCreateKeyB = 'signed-context-fault-create-b-' + keyId;
    const faultTransitionKeyA = 'signed-context-fault-transition-a-' + keyId;
    const faultTransitionKeyB = 'signed-context-fault-transition-b-' + keyId;
    const faultUnreachableKeyA = 'signed-context-fault-unreachable-a-' + keyId;
    const faultUnreachableKeyB = 'signed-context-fault-unreachable-b-' + keyId;
    synthetic.idempotencyKeys.push(
      faultCreateKeyA, faultCreateKeyB,
      faultTransitionKeyA, faultTransitionKeyB,
      faultUnreachableKeyA, faultUnreachableKeyB
    );

    const faultTicketA = await queryHttp(port, '/api/v1/faults', tokenA, {
      method: 'POST',
      headers: { 'idempotency-key': faultCreateKeyA },
      body: {
        title: 'Signed Context Fault Ticket A',
        description: 'Synthetic PostgreSQL acceptance fault for tenant A',
        priority: 'high',
        customerId: synthetic.customerIds[0],
        siteId: createSiteA.body.id,
        assetId: createAssetA.body.id
      }
    });
    if (faultTicketA.body?.workOrder?.id) synthetic.workOrderIds.push(faultTicketA.body.workOrder.id);
    if (faultTicketA.status !== 201
        || faultTicketA.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || faultTicketA.body?.workOrder?.organization_id !== tenantA
        || !String(faultTicketA.body?.workOrder?.title || '').startsWith('[FAULT] ')
        || faultTicketA.body?.workOrder?.status !== 'open'
        || faultTicketA.body?.classification?.organizationId !== tenantA) {
      throw new Error('SIGNED_CONTEXT_FAULT_CREATE_TENANT_A_FAILED:' + JSON.stringify({
        status: faultTicketA.status, body: faultTicketA.body
      }));
    }
    const faultTicketB = await queryHttp(port, '/api/v1/faults', tokenB, {
      method: 'POST',
      headers: { 'idempotency-key': faultCreateKeyB },
      body: {
        title: 'Signed Context Fault Ticket B',
        description: 'Synthetic PostgreSQL acceptance fault for tenant B',
        priority: 'high',
        customerId: synthetic.customerIds[1],
        siteId: createSiteB.body.id,
        assetId: createAssetB.body.id
      }
    });
    if (faultTicketB.body?.workOrder?.id) synthetic.workOrderIds.push(faultTicketB.body.workOrder.id);
    if (faultTicketB.status !== 201
        || faultTicketB.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
        || faultTicketB.body?.workOrder?.organization_id !== tenantB
        || !String(faultTicketB.body?.workOrder?.title || '').startsWith('[FAULT] ')
        || faultTicketB.body?.workOrder?.status !== 'open'
        || faultTicketB.body?.classification?.organizationId !== tenantB) {
      throw new Error('SIGNED_CONTEXT_FAULT_CREATE_TENANT_B_FAILED:' + JSON.stringify({
        status: faultTicketB.status, body: faultTicketB.body
      }));
    }
    signedSessionAutobindHttpProof.faultCreateTenantA = 'PASS';
    signedSessionAutobindHttpProof.faultCreateTenantB = 'PASS';

    const faultTransitionA = await queryHttp(
      port,
      '/api/v1/faults/' + encodeURIComponent(faultTicketA.body.workOrder.id) + '/transition',
      tokenA,
      { method: 'POST', headers: { 'idempotency-key': faultTransitionKeyA }, body: { status: 'in_progress' } }
    );
    const faultTransitionB = await queryHttp(
      port,
      '/api/v1/faults/' + encodeURIComponent(faultTicketB.body.workOrder.id) + '/transition',
      tokenB,
      { method: 'POST', headers: { 'idempotency-key': faultTransitionKeyB }, body: { status: 'in_progress' } }
    );
    for (const [label, response, expectedTenant, expectedId] of [
      ['tenantA', faultTransitionA, tenantA, faultTicketA.body.workOrder.id],
      ['tenantB', faultTransitionB, tenantB, faultTicketB.body.workOrder.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.workOrder?.id !== expectedId
          || response.body?.workOrder?.organization_id !== expectedTenant
          || response.body?.workOrder?.status !== 'in_progress') {
        throw new Error('SIGNED_CONTEXT_FAULT_TRANSITION_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.faultTransitionTenantA = 'PASS';
    signedSessionAutobindHttpProof.faultTransitionTenantB = 'PASS';

    const faultConfigKeyA = 'fault_unreachable:' + faultTicketA.body.workOrder.id;
    const faultConfigKeyB = 'fault_unreachable:' + faultTicketB.body.workOrder.id;
    synthetic.operationalConfigKeys.push(
      faultConfigKeyA, faultConfigKeyB
    );
    const faultUnreachableA = await queryHttp(
      port,
      '/api/v1/faults/' + encodeURIComponent(faultTicketA.body.workOrder.id) + '/unreachable',
      tokenA,
      {
        method: 'POST',
        headers: { 'idempotency-key': faultUnreachableKeyA },
        body: { reasonCode: 'CI_FAULT_UNREACHABLE', detail: 'signed tenant route acceptance' }
      }
    );
    const faultUnreachableB = await queryHttp(
      port,
      '/api/v1/faults/' + encodeURIComponent(faultTicketB.body.workOrder.id) + '/unreachable',
      tokenB,
      {
        method: 'POST',
        headers: { 'idempotency-key': faultUnreachableKeyB },
        body: { reasonCode: 'CI_FAULT_UNREACHABLE', detail: 'signed tenant route acceptance' }
      }
    );
    for (const [label, response, expectedTenant, expectedId] of [
      ['tenantA', faultUnreachableA, tenantA, faultTicketA.body.workOrder.id],
      ['tenantB', faultUnreachableB, tenantB, faultTicketB.body.workOrder.id]
    ]) {
      if (response.status !== 200
          || response.headers?.['x-opscore-signed-tenant-context'] !== 'verified'
          || response.body?.workOrder?.id !== expectedId
          || response.body?.workOrder?.organization_id !== expectedTenant
          || response.body?.workOrder?.status !== 'blocked'
          || response.body?.reasonCode !== 'CI_FAULT_UNREACHABLE'
          || !response.body?.operationalJobId) {
        throw new Error('SIGNED_CONTEXT_FAULT_UNREACHABLE_TENANT_BOUNDARY_FAILED:' + JSON.stringify({
          label, status: response.status, body: response.body
        }));
      }
    }
    signedSessionAutobindHttpProof.faultUnreachableTenantA = 'PASS';
    signedSessionAutobindHttpProof.faultUnreachableTenantB = 'PASS';


    clientA = new Client({ connectionString: runtimeUrl });
    clientB = new Client({ connectionString: runtimeUrl });
    await clientA.connect();
    await clientB.connect();

    if (!candidateMode) {
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
  
  
    }

    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.signed-tenant-context-ci-proof.v1',
      status: 'PASS',
      checks: {
        tenantAHttpSession: 'PASS',
        tenantBHttpSession: 'PASS',
        signedAuthenticatedSessionRoutes: signedSessionAutobindHttpProof,
        signedSecondaryPoolTenantRoutes: secondaryPoolProof,
        signedWorkOrdersTenantA: 'PASS',
        signedWorkOrdersTenantB: 'PASS',
        signedWorkOrderDetailTenantA: 'PASS',
        signedWorkOrderDetailTenantB: 'PASS',
        signedWorkOrderSubresourceReads: signedReadRouteProof,
        signedWorkOrderWrites: signedWriteRouteProof,
        signedEvidenceWrites: signedEvidenceRouteProof,
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
    if (evidenceRollbackTriggerInstalled) {
      try { await owner.query('DROP TRIGGER IF EXISTS ci_reject_signed_evidence_rollback ON public.idempotency_records'); }
      catch (cleanupError) { process.stderr.write('EVIDENCE_ROLLBACK_TRIGGER_CLEANUP_FAILED:' + String(cleanupError.code || cleanupError.message) + '\\n'); }
      try { await owner.query('DROP FUNCTION IF EXISTS opscore_security.ci_reject_signed_evidence_rollback()'); }
      catch (cleanupError) { process.stderr.write('EVIDENCE_ROLLBACK_FUNCTION_CLEANUP_FAILED:' + String(cleanupError.code || cleanupError.message) + '\\n'); }
      evidenceRollbackTriggerInstalled = false;
    }
    if (activeVerifierRole) {
      try { await owner.query('RESET ROLE'); } catch (_) {}
      activeVerifierRole = false;
    }
    if (signedContextPool) { try { await signedContextPool.end(); } catch (_) {} }
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

    try { await owner.query('DELETE FROM public.evidence_upload_chunks WHERE upload_id = ANY($1::text[])', [synthetic.evidenceUploadIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.attachments WHERE id = ANY($1::text[]) OR organization_id = ANY($2::text[])', [synthetic.attachmentIds, synthetic.tenantIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.evidence_uploads WHERE id = ANY($1::text[]) OR organization_id = ANY($2::text[])', [synthetic.evidenceUploadIds, synthetic.tenantIds]); } catch (_) {}
    if (evidenceRoot) { try { fs.rmSync(evidenceRoot, { recursive: true, force: true }); } catch (_) {} }
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
    try {
      await owner.query(
        'DELETE FROM public.technician_location_trail WHERE id = ANY($1::text[]) OR (organization_id = ANY($2::text[]) AND (technician_id = ANY($3::text[]) OR client_event_id = ANY($4::text[])))',
        [synthetic.trailPointIds, synthetic.tenantIds, synthetic.userIds, synthetic.trailClientEventIds]
      );
    } catch (cleanupError) {
      trailCleanupErrors.push('technician_location_trail:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        'SELECT COUNT(*)::int AS trail_rows FROM public.technician_location_trail WHERE id = ANY($1::text[]) OR (organization_id = ANY($2::text[]) AND (technician_id = ANY($3::text[]) OR client_event_id = ANY($4::text[])))',
        [synthetic.trailPointIds, synthetic.tenantIds, synthetic.userIds, synthetic.trailClientEventIds]
      );
      const remaining = Number(residue.rows[0]?.trail_rows || 0);
      if (trailCleanupErrors.length || remaining !== 0) {
        process.stderr.write('SIGNED_CONTEXT_TECHNICIAN_TRAIL_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: trailCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_TECHNICIAN_TRAIL_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_TECHNICIAN_TRAIL_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query(
        "DELETE FROM public.operational_jobs WHERE organization_id = ANY($1::text[]) AND ((entity_type='appointment' AND entity_id = ANY($2::text[])) OR (entity_type='work_order' AND entity_id = ANY($3::text[])))",
        [synthetic.tenantIds, synthetic.appointmentIds, synthetic.workOrderIds]
      );
    } catch (cleanupError) {
      businessCleanupErrors.push('operational_jobs:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        'DELETE FROM public.operational_configs WHERE organization_id = ANY($1::text[]) AND config_key = ANY($2::text[])',
        [synthetic.tenantIds, synthetic.operationalConfigKeys]
      );
    } catch (cleanupError) {
      businessCleanupErrors.push('operational_configs:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.dynamic_geofence_events WHERE id = ANY($1::text[]) OR (organization_id = ANY($2::text[]) AND source_event_id = ANY($3::text[]))",
        [synthetic.dynamicGeofenceIds, synthetic.tenantIds, synthetic.dynamicGeofenceSourceEventIds]
      );
    } catch (cleanupError) {
      businessCleanupErrors.push('dynamic_geofence_events:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND ((entity_type='work_order' AND entity_id = ANY($2::text[])) OR (entity_type='appointment' AND entity_id = ANY($3::text[])))",
        [synthetic.tenantIds, synthetic.workOrderIds, synthetic.appointmentIds]
      );
    } catch (cleanupError) {
      businessCleanupErrors.push('activity_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND ((resource_type='work_order' AND resource_id = ANY($2::text[])) OR (resource_type='appointment' AND resource_id = ANY($3::text[])) OR (resource_type='dynamic_geofence_event' AND resource_id = ANY($4::text[])))",
        [synthetic.tenantIds, synthetic.workOrderIds, synthetic.appointmentIds, synthetic.dynamicGeofenceIds]
      );
    } catch (cleanupError) {
      businessCleanupErrors.push('audit_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.operational_jobs WHERE organization_id = ANY($1::text[]) AND ((entity_type='appointment' AND entity_id = ANY($2::text[])) OR (entity_type='work_order' AND entity_id = ANY($3::text[])))) AS job_rows, " +
        "(SELECT COUNT(*)::int FROM public.operational_configs WHERE organization_id = ANY($1::text[]) AND config_key = ANY($4::text[])) AS config_rows, " +
        "(SELECT COUNT(*)::int FROM public.dynamic_geofence_events WHERE id = ANY($5::text[]) OR (organization_id = ANY($1::text[]) AND source_event_id = ANY($6::text[]))) AS dynamic_event_rows, " +
        "(SELECT COUNT(*)::int FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND ((entity_type='work_order' AND entity_id = ANY($3::text[])) OR (entity_type='appointment' AND entity_id = ANY($2::text[])))) AS activity_rows, " +
        "(SELECT COUNT(*)::int FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND ((resource_type='work_order' AND resource_id = ANY($3::text[])) OR (resource_type='appointment' AND resource_id = ANY($2::text[])) OR (resource_type='dynamic_geofence_event' AND resource_id = ANY($5::text[])))) AS audit_rows",
        [synthetic.tenantIds, synthetic.appointmentIds, synthetic.workOrderIds, synthetic.operationalConfigKeys, synthetic.dynamicGeofenceIds, synthetic.dynamicGeofenceSourceEventIds]
      );
      const remaining = residue.rows[0] || {};
      if (businessCleanupErrors.length
          || Number(remaining.job_rows) !== 0
          || Number(remaining.config_rows) !== 0
          || Number(remaining.dynamic_event_rows) !== 0
          || Number(remaining.activity_rows) !== 0
          || Number(remaining.audit_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_BUSINESS_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: businessCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_BUSINESS_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_BUSINESS_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query('DELETE FROM public.appointments WHERE id = ANY($1::text[]) OR (organization_id = ANY($2::text[]) AND work_order_id = ANY($3::text[]))', [synthetic.appointmentIds, synthetic.tenantIds, synthetic.workOrderIds]);
    } catch (cleanupError) {
      appointmentCleanupErrors.push('appointments:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        'SELECT COUNT(*)::int AS appointment_rows FROM public.appointments WHERE id = ANY($1::text[]) OR (organization_id = ANY($2::text[]) AND work_order_id = ANY($3::text[]))',
        [synthetic.appointmentIds, synthetic.tenantIds, synthetic.workOrderIds]
      );
      const remaining = Number(residue.rows[0]?.appointment_rows || 0);
      if (appointmentCleanupErrors.length || remaining !== 0) {
        process.stderr.write('SIGNED_CONTEXT_APPOINTMENT_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: appointmentCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_APPOINTMENT_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_APPOINTMENT_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query(
        'DELETE FROM public.technician_geofences WHERE organization_id = ANY($1::text[]) AND geofence_id = ANY($2::text[])',
        [synthetic.tenantIds, synthetic.geofenceIds]
      );
    } catch (cleanupError) {
      geofenceCleanupErrors.push('technician_geofences:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query('DELETE FROM public.geofences WHERE id = ANY($1::text[])', [synthetic.geofenceIds]);
    } catch (cleanupError) {
      geofenceCleanupErrors.push('geofences:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.geofences WHERE id = ANY($1::text[])) AS geofence_rows, " +
        "(SELECT COUNT(*)::int FROM public.technician_geofences WHERE organization_id = ANY($2::text[]) AND geofence_id = ANY($1::text[])) AS assignment_rows",
        [synthetic.geofenceIds, synthetic.tenantIds]
      );
      const remaining = residue.rows[0] || {};
      if (geofenceCleanupErrors.length || Number(remaining.geofence_rows) !== 0
          || Number(remaining.assignment_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_GEOFENCE_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: geofenceCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_GEOFENCE_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_GEOFENCE_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try { await owner.query('DELETE FROM public.work_orders WHERE id = ANY($1::text[])', [synthetic.workOrderIds]); } catch (_) {}
    try {
      const eventRows = await owner.query(
        'SELECT id FROM public.asset_events WHERE organization_id = ANY($1::text[]) AND asset_id = ANY($2::text[])',
        [synthetic.tenantIds, synthetic.assetIds]
      );
      syntheticAssetEventIds = eventRows.rows.map(row => row.id);
    } catch (cleanupError) {
      assetCleanupErrors.push('asset_events_select:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='asset' AND entity_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.assetIds]
      );
    } catch (cleanupError) {
      assetCleanupErrors.push('activity_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND ((resource_type='asset' AND resource_id = ANY($2::text[])) OR (resource_type='asset_event' AND resource_id = ANY($3::text[])))",
        [synthetic.tenantIds, synthetic.assetIds, syntheticAssetEventIds]
      );
    } catch (cleanupError) {
      assetCleanupErrors.push('audit_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        'DELETE FROM public.asset_events WHERE organization_id = ANY($1::text[]) AND asset_id = ANY($2::text[])',
        [synthetic.tenantIds, synthetic.assetIds]
      );
    } catch (cleanupError) {
      assetCleanupErrors.push('asset_events:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try { await owner.query('DELETE FROM public.assets WHERE id = ANY($1::text[])', [synthetic.assetIds]); }
    catch (cleanupError) {
      assetCleanupErrors.push('assets:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.assets WHERE id = ANY($1::text[])) AS asset_rows, " +
        "(SELECT COUNT(*)::int FROM public.asset_events WHERE organization_id = ANY($2::text[]) AND asset_id = ANY($1::text[])) AS event_rows, " +
        "(SELECT COUNT(*)::int FROM public.activity_log WHERE organization_id = ANY($2::text[]) AND entity_type='asset' AND entity_id = ANY($1::text[])) AS activity_rows, " +
        "(SELECT COUNT(*)::int FROM public.audit_log WHERE organization_id = ANY($2::text[]) AND ((resource_type='asset' AND resource_id = ANY($1::text[])) OR (resource_type='asset_event' AND resource_id = ANY($3::text[]))) ) AS audit_rows",
        [synthetic.assetIds, synthetic.tenantIds, syntheticAssetEventIds]
      );
      const remaining = residue.rows[0] || {};
      if (assetCleanupErrors.length || Number(remaining.asset_rows) !== 0
          || Number(remaining.event_rows) !== 0 || Number(remaining.activity_rows) !== 0
          || Number(remaining.audit_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_ASSET_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: assetCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_ASSET_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_ASSET_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query(
        "DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='site' AND entity_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.siteIds]
      );
    } catch (cleanupError) {
      siteCleanupErrors.push('activity_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND resource_type='site' AND resource_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.siteIds]
      );
    } catch (cleanupError) {
      siteCleanupErrors.push('audit_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try { await owner.query('DELETE FROM public.sites WHERE id = ANY($1::text[])', [synthetic.siteIds]); }
    catch (cleanupError) {
      siteCleanupErrors.push('sites:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.sites WHERE id = ANY($1::text[])) AS site_rows, " +
        "(SELECT COUNT(*)::int FROM public.activity_log WHERE organization_id = ANY($2::text[]) AND entity_type='site' AND entity_id = ANY($1::text[])) AS activity_rows, " +
        "(SELECT COUNT(*)::int FROM public.audit_log WHERE organization_id = ANY($2::text[]) AND resource_type='site' AND resource_id = ANY($1::text[])) AS audit_rows",
        [synthetic.siteIds, synthetic.tenantIds]
      );
      const remaining = residue.rows[0] || {};
      if (siteCleanupErrors.length || Number(remaining.site_rows) !== 0
          || Number(remaining.activity_rows) !== 0 || Number(remaining.audit_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_SITE_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: siteCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_SITE_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_SITE_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query(
        'DELETE FROM public.customer_service_lines WHERE organization_id = ANY($1::text[]) AND (customer_id = ANY($2::text[]) OR line_id = ANY($3::text[]))',
        [synthetic.tenantIds, synthetic.customerIds, synthetic.serviceLineIds]
      );
    } catch (cleanupError) {
      serviceLineCleanupErrors.push('customer_service_lines:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND resource_type='service_line' AND resource_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.serviceLineIds]
      );
    } catch (cleanupError) {
      serviceLineCleanupErrors.push('audit_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query('DELETE FROM public.service_lines WHERE id = ANY($1::text[])', [synthetic.serviceLineIds]);
    } catch (cleanupError) {
      serviceLineCleanupErrors.push('service_lines:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.service_lines WHERE id = ANY($1::text[])) AS line_rows, " +
        "(SELECT COUNT(*)::int FROM public.customer_service_lines WHERE organization_id = ANY($2::text[]) AND (customer_id = ANY($3::text[]) OR line_id = ANY($1::text[]))) AS assignment_rows, " +
        "(SELECT COUNT(*)::int FROM public.audit_log WHERE organization_id = ANY($2::text[]) AND resource_type='service_line' AND resource_id = ANY($1::text[])) AS audit_rows",
        [synthetic.serviceLineIds, synthetic.tenantIds, synthetic.customerIds]
      );
      const remaining = residue.rows[0] || {};
      if (serviceLineCleanupErrors.length || Number(remaining.line_rows) !== 0
          || Number(remaining.assignment_rows) !== 0 || Number(remaining.audit_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_SERVICE_LINE_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: serviceLineCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_SERVICE_LINE_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_SERVICE_LINE_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try {
      await owner.query(
        "DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='customer' AND entity_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.customerIds]
      );
    } catch (cleanupError) {
      customerCleanupErrors.push('activity_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query(
        "DELETE FROM public.audit_log WHERE organization_id = ANY($1::text[]) AND resource_type='customer' AND resource_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.customerIds]
      );
    } catch (cleanupError) {
      customerCleanupErrors.push('audit_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try { await owner.query('DELETE FROM public.customers WHERE id = ANY($1::text[])', [synthetic.customerIds]); }
    catch (cleanupError) {
      customerCleanupErrors.push('customers:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.customers WHERE id = ANY($1::text[])) AS customer_rows, " +
        "(SELECT COUNT(*)::int FROM public.activity_log WHERE organization_id = ANY($2::text[]) AND entity_type='customer' AND entity_id = ANY($1::text[])) AS activity_rows, " +
        "(SELECT COUNT(*)::int FROM public.audit_log WHERE organization_id = ANY($2::text[]) AND resource_type='customer' AND resource_id = ANY($1::text[])) AS audit_rows",
        [synthetic.customerIds, synthetic.tenantIds]
      );
      const remaining = residue.rows[0] || {};
      if (customerCleanupErrors.length || Number(remaining.customer_rows) !== 0
          || Number(remaining.activity_rows) !== 0 || Number(remaining.audit_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_CUSTOMER_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: customerCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_CUSTOMER_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_CUSTOMER_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try { await owner.query('DELETE FROM public.sessions WHERE id = ANY($1::text[])', [synthetic.sessionIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.memberships WHERE user_id = ANY($1::text[])', [synthetic.userIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.organization_governance WHERE organization_id = ANY($1::text[])', [synthetic.tenantIds]); } catch (_) {}
    try {
      await owner.query(
        "DELETE FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='technician' AND entity_id = ANY($2::text[])",
        [synthetic.tenantIds, synthetic.userIds]
      );
    } catch (cleanupError) {
      technicianCleanupErrors.push('activity_log:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query('DELETE FROM public.technician_skills WHERE organization_id = ANY($1::text[]) AND user_id = ANY($2::text[])', [synthetic.tenantIds, synthetic.userIds]);
    } catch (cleanupError) {
      technicianCleanupErrors.push('technician_skills:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      await owner.query('DELETE FROM public.technician_profiles WHERE organization_id = ANY($1::text[]) AND user_id = ANY($2::text[])', [synthetic.tenantIds, synthetic.userIds]);
    } catch (cleanupError) {
      technicianCleanupErrors.push('technician_profiles:' + String(cleanupError.code || cleanupError.message || cleanupError));
    }
    try {
      const residue = await owner.query(
        "SELECT " +
        "(SELECT COUNT(*)::int FROM public.technician_profiles WHERE organization_id = ANY($1::text[]) AND user_id = ANY($2::text[])) AS profile_rows, " +
        "(SELECT COUNT(*)::int FROM public.technician_skills WHERE organization_id = ANY($1::text[]) AND user_id = ANY($2::text[])) AS skill_rows, " +
        "(SELECT COUNT(*)::int FROM public.activity_log WHERE organization_id = ANY($1::text[]) AND entity_type='technician' AND entity_id = ANY($2::text[])) AS activity_rows",
        [synthetic.tenantIds, synthetic.userIds]
      );
      const remaining = residue.rows[0] || {};
      if (technicianCleanupErrors.length || Number(remaining.profile_rows) !== 0
          || Number(remaining.skill_rows) !== 0 || Number(remaining.activity_rows) !== 0) {
        process.stderr.write('SIGNED_CONTEXT_TECHNICIAN_FIXTURE_CLEANUP_FAILED:' + JSON.stringify({
          errors: technicianCleanupErrors,
          remaining
        }) + '\\n');
        process.exitCode = 1;
      } else {
        process.stdout.write('SIGNED_CONTEXT_TECHNICIAN_FIXTURE_CLEANUP=PASS\\n');
      }
    } catch (cleanupError) {
      process.stderr.write('SIGNED_CONTEXT_TECHNICIAN_FIXTURE_CLEANUP_VERIFICATION_FAILED:' +
        String(cleanupError.code || cleanupError.message || cleanupError).slice(0, 500) + '\\n');
      process.exitCode = 1;
    }
    try { await owner.query('DELETE FROM public.users WHERE id = ANY($1::text[])', [synthetic.userIds]); } catch (_) {}
    try { await owner.query('DELETE FROM public.organizations WHERE id = ANY($1::text[])', [synthetic.tenantIds]); } catch (_) {}
    if (!candidateMode) {
      try { await owner.query('DELETE FROM opscore_security.context_hmac_keys WHERE key_id=$1', [synthetic.keyId]); } catch (_) {}
      try { await owner.query('DROP TABLE IF EXISTS opscore_security.context_probe_rows'); } catch (_) {}
    }
    try { await owner.end(); } catch (_) {}
    if (runtimeProbe) { try { await runtimeProbe.end(); } catch (_) {} }
    if (!candidateMode) {
      if (priorSigningKey === undefined) delete process.env.OPSC_TENANT_CONTEXT_HMAC_KEY;
      else process.env.OPSC_TENANT_CONTEXT_HMAC_KEY = priorSigningKey;
      if (priorSigningKeyId === undefined) delete process.env.OPSC_TENANT_CONTEXT_KEY_ID;
      else process.env.OPSC_TENANT_CONTEXT_KEY_ID = priorSigningKeyId;
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write('SIGNED_CONTEXT_POSTGRES_GATE_FAILED:' + String(error && (error.code || error.message) || error).slice(0, 1200) + '\\n');
    process.exitCode = 1;
  });
}

module.exports = {
  candidateOrigin,
  validateCandidateProbeEnvironment,
  requireLocalAcceptanceUrl,
  queryHttp,
  candidateDatabaseUrl,
  main
};
