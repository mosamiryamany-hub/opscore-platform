'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const policy = require('../src/production-api-route-acceptance-policy');

const inventoryBytes = fs.readFileSync(path.join(__dirname, '..', 'docs', 'API_INVENTORY.json'));
const inventory = JSON.parse(inventoryBytes.toString('utf8'));
const NOW = new Date('2026-11-21T00:00:00.000Z');
const COMMIT = 'a'.repeat(40);
const UNKNOWN = { statusCode: 404, responseCode: 'NOT_FOUND' };

function passingObservation(route) {
  const contract = policy.probeContractForRoute(route);
  const output = {
    probeContract: contract.id,
    contentType: 'application/json; charset=utf-8',
    statusCode: 401,
    responseCode: 'UNAUTHENTICATED',
    bodyAssertion: false
  };
  if (contract.kind === 'public') {
    output.statusCode = 200;
    output.responseCode = null;
  } else if (contract.id === 'logout-without-session-noop') {
    output.statusCode = 200;
    output.responseCode = null;
    output.bodyAssertion = true;
  } else {
    output.statusCode = contract.statusCodes[0];
    output.responseCode = contract.responseCodes[0] || null;
  }
  return output;
}

function passingRows() {
  return inventory.routes.map((route, index) => ({
    method: route.method,
    route: route.route,
    path: policy.materializeRoutePath(route.route, COMMIT, index),
    auth: route.auth,
    probeContract: policy.probeContractForRoute(route).id,
    ...passingObservation(route),
    testedAt: NOW.toISOString(),
    verdict: 'PASS',
    reason: null
  }));
}

function passingFlowCoverage() {
  return {
    status: 'PASS',
    testedFlows: policy.BUSINESS_FLOW_INVENTORY.length,
    inventoryFlowCount: policy.BUSINESS_FLOW_INVENTORY.length,
    passed: policy.BUSINESS_FLOW_INVENTORY.length,
    failed: 0,
    businessFlowInventorySha256: policy.businessFlowInventorySha256(),
    flows: policy.BUSINESS_FLOW_INVENTORY.map(flow => ({
      id: flow.id,
      status: 'PASS',
      routeKeys: flow.routeKeys,
      tenantAStatus: 'PASS',
      tenantBStatus: 'PASS',
      crossTenantDenialStatus: 'PASS',
      cleanupStatus: 'PASS',
      signedRouteEvidenceSha256: 'b'.repeat(64),
      candidateFixtureEvidenceSha256: 'c'.repeat(64),
      ...(flow.id === 'same-tenant-asset-event-lifecycle'
        ? { sessionIsolationEvidenceSha256: 'd'.repeat(64) }
        : {})
    }))
  };
}

function passingEvidence() {
  return {
    schemaVersion: 'opscore.api-route-acceptance.v2',
    engine: 'postgres',
    environment: 'production',
    verificationScope: 'PRODUCTION_POSTGRESQL_HTTP_FULL_ROUTE_AND_BUSINESS_FLOW_INVENTORY',
    status: 'PASS',
    testedAt: NOW.toISOString(),
    commitSha: COMMIT,
    pipelineId: '44850000000',
    deploymentId: 'dpl_ProductionRoute123',
    databaseName: 'opscore_acceptance',
    databaseBranchId: 'br-proud-salad-bcshhdap',
    inventorySha256: crypto.createHash('sha256').update(inventoryBytes).digest('hex'),
    testedRoutes: 358,
    inventoryRouteCount: 358,
    passed: 358,
    failed: 0,
    unknownRouteProbe: {
      path: policy.buildUnknownRoutePath(COMMIT),
      statusCode: UNKNOWN.statusCode,
      responseCode: UNKNOWN.responseCode
    },
    routes: passingRows(),
    businessFlowCoverage: passingFlowCoverage()
  };
}

test('source-derived Production route plan is exact, unique, and safe for all scoped writes', () => {
  const plan = policy.buildRouteProbePlan(inventory);
  assert.equal(plan.length, 358);
  assert.equal(new Set(plan.map(row => row.key)).size, 358);
  assert.equal(Object.keys(policy.SAFE_SCOPED_ROUTE_PROBES).length, 13);
  const bootstrap = plan.find(row => row.key === 'POST /api/v1/auth/bootstrap');
  assert.ok(bootstrap);
  assert.equal(bootstrap.contract.body, null, 'production bootstrap is never given a payload');
  for (const row of plan.filter(item => item.auth === 'public/scoped' && item.method !== 'GET')) {
    assert.ok(row.contract, 'every scoped write has a route-specific safe probe');
  }
});

test('all regex and parameter routes materialize to deterministic safe paths', () => {
  const plan = policy.buildRouteProbePlan(inventory);
  for (let index = 0; index < plan.length; index += 1) {
    const pathname = policy.materializeRoutePath(plan[index].route, COMMIT, index);
    assert.ok(pathname.startsWith('/api/') || pathname === '/metrics');
    assert.doesNotMatch(pathname, /[()[\]{}\\]/);
  }
  assert.equal(
    policy.materializeRoutePath('/api/v1/contact-center/conversations/([A-Za-z0-9_-]+)', COMMIT, 0),
    '/api/v1/contact-center/conversations/opscore-probe-aaaaaaaaaaaa-1'
  );
  assert.equal(
    policy.materializeRoutePath('/api/v1/evidence-uploads/{id}/chunks/(\\d+)', COMMIT, 1),
    '/api/v1/evidence-uploads/opscore-probe-aaaaaaaaaaaa-2/chunks/1'
  );
});

test('route plan fails closed on inventory count drift and duplicate entries', () => {
  assert.throws(() => policy.buildRouteProbePlan({ routeCount: 357, routes: inventory.routes.slice(0, 357) }), /COUNT_MISMATCH/);
  const duplicate = { routeCount: 358, routes: inventory.routes.slice(0, 357).concat(inventory.routes[0]) };
  assert.throws(() => policy.buildRouteProbePlan(duplicate), /DUPLICATE_INVENTORY_ROUTE/);
});

test('anonymous auth probes require actual denial and reject route-missing responses', () => {
  const route = inventory.routes.find(row => row.auth === 'required');
  assert.ok(route);
  const good = {
    ...passingObservation(route),
    probeContract: 'anonymous-auth-boundary',
    statusCode: 401,
    responseCode: 'UNAUTHENTICATED'
  };
  assert.deepEqual(policy.evaluateRouteObservation(route, good, UNKNOWN), { ok: true, reason: null });
  assert.equal(policy.evaluateRouteObservation(route, { ...good, statusCode: 200 }, UNKNOWN).ok, false);
  assert.equal(policy.evaluateRouteObservation(route, { ...good, statusCode: 404, responseCode: 'NOT_FOUND' }, UNKNOWN).ok, false);
  assert.equal(policy.evaluateRouteObservation(route, { ...good, statusCode: 429 }, UNKNOWN).reason, 'HTTP_RATE_LIMITED');
});

test('metrics route is either authenticated or explicitly disabled, never anonymously readable', () => {
  const route = inventory.routes.find(row => row.route === '/metrics');
  assert.ok(route);
  const contract = policy.probeContractForRoute(route);
  assert.equal(contract.id, 'metrics-auth-or-explicitly-disabled');
  assert.deepEqual(
    policy.evaluateRouteObservation(route, {
      probeContract: contract.id,
      statusCode: 401,
      responseCode: 'UNAUTHENTICATED'
    }, UNKNOWN),
    { ok: true, reason: null }
  );
  assert.deepEqual(
    policy.evaluateRouteObservation(route, {
      probeContract: contract.id,
      statusCode: 404,
      responseCode: 'METRICS_NOT_CONFIGURED'
    }, UNKNOWN),
    { ok: true, reason: null }
  );
  assert.equal(policy.evaluateRouteObservation(route, {
    probeContract: contract.id,
    statusCode: 200,
    responseCode: null
  }, UNKNOWN).ok, false);
  assert.equal(policy.evaluateRouteObservation(route, {
    probeContract: contract.id,
    statusCode: 404,
    responseCode: 'NOT_FOUND'
  }, UNKNOWN).ok, false);
});

test('public routes require a live JSON success and no unknown-route marker', () => {
  const route = inventory.routes.find(row => row.auth === 'public');
  assert.ok(route);
  const good = { ...passingObservation(route), probeContract: 'public-json-read' };
  assert.deepEqual(policy.evaluateRouteObservation(route, good, UNKNOWN), { ok: true, reason: null });
  assert.equal(policy.evaluateRouteObservation(route, { ...good, statusCode: 404 }, UNKNOWN).ok, false);
  assert.equal(policy.evaluateRouteObservation(route, { ...good, contentType: 'text/plain' }, UNKNOWN).ok, false);
});

test('only the three SSO-protected public verification routes accept JSON 401', () => {
  for (const routePath of [
    '/api/verify/database',
    '/api/verify/database-security',
    '/api/verify/deployment'
  ]) {
    const route = inventory.routes.find(row => row.route === routePath);
    assert.ok(route);
    assert.deepEqual(policy.evaluateRouteObservation(route, {
      probeContract: 'public-json-read',
      contentType: 'application/json; charset=utf-8',
      statusCode: 401,
      responseCode: 'UNAUTHENTICATED'
    }, UNKNOWN), { ok: true, reason: null });
  }
  const health = inventory.routes.find(row => row.route === '/api/health');
  assert.equal(policy.evaluateRouteObservation(health, {
    probeContract: 'public-json-read', contentType: 'application/json',
    statusCode: 401, responseCode: 'UNAUTHENTICATED'
  }, UNKNOWN).reason, 'PUBLIC_JSON_ROUTE_NOT_AVAILABLE');
});

test('required routes accept numeric response codes only when status is contract-allowed', () => {
  const route = inventory.routes.find(row => row.auth === 'required');
  const contract = policy.probeContractForRoute(route);
  const statusCode = contract.statusCodes[0];
  assert.deepEqual(policy.evaluateRouteObservation(route, {
    probeContract: contract.id, statusCode, responseCode: String(statusCode)
  }, UNKNOWN), { ok: true, reason: null });
  assert.equal(policy.evaluateRouteObservation(route, {
    probeContract: contract.id, statusCode: 200, responseCode: '200'
  }, UNKNOWN).reason, 'HTTP_STATUS_OUTSIDE_SAFE_CONTRACT');
});

test('scoped write probes require their exact no-token guard rather than arbitrary 4xx', () => {
  const route = inventory.routes.find(row => row.route === '/api/v1/auth/bootstrap');
  const contract = policy.probeContractForRoute(route);
  assert.equal(contract.body, null);
  const good = {
    probeContract: contract.id,
    statusCode: 404,
    responseCode: 'BOOTSTRAP_CLI_REQUIRED',
    bodyAssertion: false
  };
  assert.deepEqual(policy.evaluateRouteObservation(route, good, UNKNOWN), { ok: true, reason: null });
  assert.equal(policy.evaluateRouteObservation(route, { ...good, responseCode: 'NOT_FOUND' }, UNKNOWN).ok, false);
});

test('full evidence accepts exactly 358 real route result records and exact flow inventory', () => {
  const evidence = passingEvidence();
  const result = policy.validateProductionApiRouteAcceptanceEvidence(
    evidence, inventory, inventoryBytes, NOW
  );
  assert.equal(result.valid, true);
  assert.equal(result.routesValid, true);
  assert.equal(result.flowsValid, true);
});

test('full evidence rejects missing, duplicate, stale, and changed-inventory route results', () => {
  const evidence = passingEvidence();
  const missing = { ...evidence, routes: evidence.routes.slice(1) };
  assert.equal(policy.validateProductionApiRouteAcceptanceEvidence(missing, inventory, inventoryBytes, NOW).valid, false);

  const duplicate = { ...evidence, routes: evidence.routes.slice(0, 357).concat(evidence.routes[0]) };
  assert.equal(policy.validateProductionApiRouteAcceptanceEvidence(duplicate, inventory, inventoryBytes, NOW).valid, false);

  const staleRows = evidence.routes.map(row => ({ ...row, testedAt: '2026-11-20T00:00:00.000Z' }));
  const stale = { ...evidence, routes: staleRows, testedAt: '2026-11-20T00:00:00.000Z' };
  assert.equal(policy.validateProductionApiRouteAcceptanceEvidence(stale, inventory, inventoryBytes, NOW).valid, false);

  const changedHash = { ...evidence, inventorySha256: 'e'.repeat(64) };
  assert.equal(policy.validateProductionApiRouteAcceptanceEvidence(changedHash, inventory, inventoryBytes, NOW).valid, false);
});

test('business flow evidence rejects omitted flows, changed route sets, and missing tenant denials', () => {
  const good = passingFlowCoverage();
  assert.equal(policy.validateBusinessFlowCoverage(good).valid, true);

  const missing = { ...good, flows: good.flows.slice(0, 2) };
  assert.equal(policy.validateBusinessFlowCoverage(missing).valid, false);

  const changed = {
    ...good,
    flows: good.flows.map(row => row.id === 'same-tenant-customer-lifecycle'
      ? { ...row, routeKeys: ['GET /api/v1/customers'] }
      : row)
  };
  assert.equal(policy.validateBusinessFlowCoverage(changed).valid, false);

  const noCrossTenant = {
    ...good,
    flows: good.flows.map(row => row.id === 'same-tenant-work-order-lifecycle'
      ? { ...row, crossTenantDenialStatus: 'NOT_VERIFIED' }
      : row)
  };
  assert.equal(policy.validateBusinessFlowCoverage(noCrossTenant).valid, false);
});

test('portal appointment read accepts the authentication boundary denial only for itself', () => {
  const read = inventory.routes.find(row => row.method === 'GET' && row.route === '/api/v1/portal/appointments/{id}');
  assert.ok(read);
  const contract = policy.probeContractForRoute(read);
  assert.equal(contract.id, 'portal-appointment-read-without-token');
  assert.deepEqual(contract.statusCodes, [401]);
  assert.deepEqual(contract.responseCodes.slice().sort(), ['PORTAL_TOKEN_INVALID', 'UNAUTHENTICATED']);
  assert.deepEqual(
    policy.evaluateRouteObservation(read, {
      probeContract: contract.id,
      contentType: 'application/json; charset=utf-8',
      statusCode: 401,
      responseCode: 'UNAUTHENTICATED',
      bodyAssertion: false
    }, UNKNOWN),
    { ok: true, reason: null }
  );
  assert.deepEqual(
    policy.evaluateRouteObservation(read, {
      probeContract: contract.id,
      statusCode: 401,
      responseCode: 'PORTAL_TOKEN_INVALID'
    }, UNKNOWN),
    { ok: true, reason: null }
  );
  assert.equal(policy.evaluateRouteObservation(read, {
    probeContract: contract.id, statusCode: 403, responseCode: 'UNAUTHENTICATED'
  }, UNKNOWN).ok, false);
  assert.equal(policy.evaluateRouteObservation(read, {
    probeContract: contract.id, statusCode: 503, responseCode: 'UNAUTHENTICATED'
  }, UNKNOWN).reason, 'HTTP_SERVER_ERROR');
  assert.equal(policy.evaluateRouteObservation(read, {
    probeContract: contract.id, statusCode: 401, responseCode: 'NOT_FOUND'
  }, UNKNOWN).ok, false);
});

test('the portal appointment exception is route-local and never widens sibling scoped contracts', () => {
  for (const key of [
    'PATCH /api/v1/portal/appointments/{id}',
    'POST /api/v1/portal/exchange',
    'POST /api/v1/portal/self-scheduling/{id}/book'
  ]) {
    const [method, route] = key.split(' ');
    const sibling = inventory.routes.find(row => row.method === method && row.route === route);
    assert.ok(sibling, key + ' must exist in the inventory');
    const scoped = policy.probeContractForRoute(sibling);
    assert.equal(scoped.responseCodes.includes('UNAUTHENTICATED'), false, key + ' must not accept UNAUTHENTICATED');
    assert.equal(
      policy.evaluateRouteObservation(sibling, {
        probeContract: scoped.id, statusCode: 401, responseCode: 'UNAUTHENTICATED'
      }, UNKNOWN).ok,
      false,
      key + ' must stay outside the portal appointment exception'
    );
  }
  const required = inventory.routes.find(row => row.auth === 'required');
  assert.ok(required);
  assert.equal(policy.probeContractForRoute(required).id, 'anonymous-auth-boundary');
  const stripe = inventory.routes.find(row => row.method === 'POST' && row.route === '/api/v1/billing/stripe/webhook');
  assert.ok(stripe);
  assert.equal(
    policy.evaluateRouteObservation(stripe, {
      probeContract: policy.probeContractForRoute(stripe).id,
      statusCode: 503,
      responseCode: 'STRIPE_WEBHOOK_NOT_CONFIGURED'
    }, UNKNOWN).reason,
    'HTTP_SERVER_ERROR',
    'an unconfigured Stripe webhook must keep failing the acceptance gate'
  );
});
