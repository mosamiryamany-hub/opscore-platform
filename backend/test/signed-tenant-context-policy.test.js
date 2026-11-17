'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const policy = require('../src/signed-tenant-context-policy');
const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');

const apiInventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'API_INVENTORY.json'), 'utf8'));

test('signed route evidence policy is derived from actual Preview runtime allowlists', () => {
  const readPostPaths = new Set([
    'POST /api/v1/faults/classify',
    'POST /api/v1/geofences/assert-access',
    'POST /api/v1/geofences/evaluate'
  ]);
  const covered = apiInventory.routes.filter((route) => policy.isSignedTenantContextRouteDefinition(
    route.method,
    route.route,
    route.method === 'GET' || readPostPaths.has(route.method + ' ' + route.route) ? 'read' : 'write'
  ));
  assert.equal(covered.length, 67, '67 route inventory rows must be admitted by the real Preview runtime signed policy');
  assert.equal(policy.isSignedTenantContextRouteDefinition('GET', '/api/v1/assets', 'read'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('GET', '/api/v1/customers', 'read'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('POST', '/api/v1/faults/classify', 'read'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('POST', '/api/v1/geofences/evaluate', 'read'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('POST', '/api/v1/customers', 'write'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('PATCH', '/api/v1/assets/{id}', 'write'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('POST', '/api/v1/technicians/trail', 'write'), true);
  assert.equal(policy.isSignedTenantContextRouteDefinition('GET', '/api/v1/work-orders/{id}/evidence-package', 'read'), false);
  assert.equal(policy.isSignedTenantContextRouteDefinition('POST', '/api/v1/faults/offline-sync', 'write'), false);
  assert.equal(policy.isSignedTenantContextRouteDefinition('GET', '/api/v1/autopilot/decision-memory', 'read'), false);
  const evidenceChunkRoute = apiInventory.routes.find((route) => route.method === 'PUT' && route.route.includes('/evidence-uploads/') && route.route.includes('/chunks/'));
  assert.ok(evidenceChunkRoute, 'the evidence chunk route must exist in the API inventory');
  assert.equal(policy.isSignedTenantContextRouteDefinition('PUT', evidenceChunkRoute.route, 'write'), true);
});


const previewRead = {
  VERCEL_ENV: 'preview',
  OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true'
};
const previewWrite = {
  ...previewRead,
  OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true'
};



test('67-route source manifest is inventory-bound while Production route evidence remains unverified', () => {
  const manifestPath = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
  const inventoryPath = path.join(__dirname, '..', 'docs', 'API_INVENTORY.json');
  const productionEvidencePath = path.join(__dirname, '..', 'docs', 'verification', 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json');
  const embeddedEvidencePath = path.join(__dirname, '..', 'src', 'embedded-evidence', 'SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const inventoryBytes = fs.readFileSync(inventoryPath);
  const inventoryHash = crypto.createHash('sha256').update(inventoryBytes).digest('hex');

  assert.equal(manifest.schemaVersion, 'opscore.signed-tenant-context-route-manifest.v1');
  assert.equal(manifest.routeCount, 67);
  assert.equal(manifest.routes.length, 67);
  assert.equal(manifest.routeInventorySha256, inventoryHash);
  assert.equal(manifest.sourceCommit, '362e7cd5b6665003479a185358d0bcccbf9135af');
  assert.equal(new Set(manifest.routes.map((route) => route.method + ' ' + route.path)).size, 67);

  for (const route of manifest.routes) {
    const inventoryRow = apiInventory.routes.find((candidate) => candidate.method === route.method && candidate.route === route.path);
    assert.ok(inventoryRow, route.method + ' ' + route.path + ' must exist in API inventory');
    assert.notEqual(inventoryRow.auth, 'public', route.method + ' ' + route.path + ' must require authentication');
    assert.ok(policy.isSignedTenantContextRouteDefinition(route.method, route.path, route.operation));
  }

  assert.equal(fs.existsSync(productionEvidencePath), false, 'no fabricated Production coverage file may be checked in');
  assert.equal(fs.existsSync(embeddedEvidencePath), false, 'no embedded Production coverage file may be checked in');

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-signed-route-manifest-'));
  try {
    const evidencePath = path.join(temporaryDirectory, 'evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify({
      schemaVersion: 'opscore.signed-tenant-context-production-coverage.v1',
      sourceCommitHint: manifest.sourceCommit,
      pipelineId: '123456789',
      parentBranchId: 'br-proud-salad-bcshhdap',
      routes: []
    }));
    const { readProductionSignedTenantRouteCoverageEvidence } = require('../src/release-proof');
    const result = readProductionSignedTenantRouteCoverageEvidence(evidencePath, {
      OPSC_RELEASE_CI_COMMIT: manifest.sourceCommit,
      OPSC_RELEASE_CI_PIPELINE_ID: '123456789',
      OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-proud-salad-bcshhdap'
    }, manifestPath, inventoryPath);
    assert.equal(result.manifestBound, true, 'the 67-route manifest must validate against source policy and inventory');
    assert.equal(result.inventoryBound, true);
    assert.equal(result.routeResultsValid, false);
    assert.equal(result.status, 'NOT_VERIFIED', 'a source manifest alone must never certify Production');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('all 39 operational extensions route through the signed read or write transaction wrapper', () => {
  const contracts = [
    ["if (req.method === 'GET' && url.pathname === '/api/v1/customers')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/sites')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/appointments')", 'sendWorkOrderRead', false],
    ["const apt = url.pathname.match", 'sendWorkOrderRead', true],
    ["if(req.method==='GET'&&url.pathname==='/api/v1/geofences')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/technicians')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/technicians/availability')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/technicians/skills')", 'sendWorkOrderRead', false],
    ["const gtl=url.pathname.match", 'sendWorkOrderRead', true],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/technicians/trail')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/technicians/trail.geojson')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/geofences/role-polygons')", 'sendWorkOrderRead', false],
    ["if (req.method === 'GET' && url.pathname === '/api/v1/map/viewport')", 'sendWorkOrderRead', false],
    ["const csl=url.pathname.match", 'sendWorkOrderRead', true],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/faults/classify')", 'sendWorkOrderRead', false],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/geofences/assert-access')", 'sendWorkOrderRead', false],
    ["if(req.method==='POST'&&url.pathname==='/api/v1/geofences/evaluate')", 'sendWorkOrderRead', false],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/assets')", 'runSignedRouteWrite', false],
    ["const asr = url.pathname.match", 'runSignedRouteWrite', true],
    ["const ae = url.pathname.match", 'runSignedRouteWrite', true],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/customers')", 'runSignedRouteWrite', false],
    ["const cur = url.pathname.match", 'runSignedRouteWrite', true],
    ["const csl=url.pathname.match", 'runSignedRouteWrite', true],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/sites')", 'runSignedRouteWrite', false],
    ["const sir = url.pathname.match", 'runSignedRouteWrite', true],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/faults')", 'runSignedRouteWrite', false],
    ["const ftrans = url.pathname.match", 'runSignedRouteWrite', true],
    ["const funr = url.pathname.match", 'runSignedRouteWrite', true],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/appointments')", 'runSignedRouteWrite', false],
    ["if (apt && req.method === 'PATCH')", 'runSignedRouteWrite', false],
    ["const aw = url.pathname.match", 'runSignedRouteWrite', true],
    ["const apptReschedule = url.pathname.match", 'runSignedRouteWrite', true],
    ["if (req.method === 'POST' && aun)", 'runSignedRouteWrite', false],
    ["if(req.method==='POST'&&url.pathname==='/api/v1/geofences')", 'runSignedRouteWrite', false],
    ["const gta=url.pathname.match", 'runSignedRouteWrite', true],
    ["if(req.method==='POST'&&url.pathname==='/api/v1/geofences/dynamic-events')", 'runSignedRouteWrite', false],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/technicians')", 'runSignedRouteWrite', false],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/technicians/skills')", 'runSignedRouteWrite', false],
    ["if (req.method === 'POST' && url.pathname === '/api/v1/technicians/trail')", 'runSignedRouteWrite', false]
  ];

  const sectionAfter = (anchor, isDynamic) => {
    const start = server.indexOf(anchor);
    assert.notEqual(start, -1, 'missing route source anchor: ' + anchor);
    const next = isDynamic
      ? server.indexOf('\n  const ', start + anchor.length)
      : server.indexOf('\n  if ', start + anchor.length);
    return server.slice(start, next < 0 ? Math.min(server.length, start + 2600) : next);
  };

  assert.equal(contracts.length, 39);
  for (const [anchor, wrapper, isDynamic] of contracts) {
    const section = sectionAfter(anchor, isDynamic);
    assert.ok(section.includes(wrapper), anchor + ' must use ' + wrapper);
  }
});

test('signed work-order GET allowlist remains Preview-only and method-specific', () => {
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'GET', url: '/api/v1/work-orders' }, previewRead), true);
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'GET', url: '/api/v1/work-orders/wo_123/timeline' }, previewRead), true);
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'POST', url: '/api/v1/work-orders/wo_123/timeline' }, previewRead), false);
  assert.equal(policy.signedWorkOrdersReadEnabled(
    { method: 'GET', url: '/api/v1/work-orders' },
    { ...previewRead, VERCEL_ENV: 'production' }
  ), false);
});

test('signed assets list read is exact-path, GET-only, and Preview-only', () => {
  const enabled = {
    VERCEL_ENV: 'preview',
    OPSC_SIGNED_TENANT_CONTEXT_ASSETS_READ_ENABLED: 'true'
  };
  assert.equal(policy.signedAssetsReadEnabled({ method: 'GET', url: '/api/v1/assets' }, enabled), true);
  assert.equal(policy.signedAssetsReadEnabled({ method: 'POST', url: '/api/v1/assets' }, enabled), false);
  assert.equal(policy.signedAssetsReadEnabled({ method: 'GET', url: '/api/v1/assets?limit=10' }, enabled), true);
  assert.equal(policy.signedAssetsReadEnabled({ method: 'GET', url: '/api/v1/assets/ast_123' }, enabled), false);
  assert.equal(policy.signedAssetsReadEnabled(
    { method: 'GET', url: '/api/v1/assets' },
    { ...enabled, VERCEL_ENV: 'production' }
  ), false);
  assert.equal(policy.signedTenantContextRouteError(
    { method: 'GET', url: '/api/v1/assets' },
    { ...enabled, OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true' }
  ), null);
});

test('signed work-order and evidence writes require the separate Preview write flag', () => {
  assert.equal(policy.signedWorkOrdersWriteEnabled({ method: 'POST', url: '/api/v1/work-orders' }, previewRead), false);
  assert.equal(policy.signedWorkOrdersWriteEnabled({ method: 'POST', url: '/api/v1/work-orders' }, previewWrite), true);
  assert.equal(policy.signedWorkOrdersWriteEnabled({ method: 'PATCH', url: '/api/v1/work-orders/wo_123' }, previewWrite), true);
  assert.equal(policy.signedWorkOrdersWriteEnabled({ method: 'PUT', url: '/api/v1/evidence-uploads/up_123/chunks/0' }, previewWrite), true);
  assert.equal(policy.signedWorkOrdersWriteEnabled(
    { method: 'POST', url: '/api/v1/work-orders' },
    { ...previewWrite, VERCEL_ENV: 'production' }
  ), false);
});

test('required signed context blocks routes that do not have a signed request path before unsigned GUC binding', () => {
  const requiredWithoutAutobind = {
    VERCEL_ENV: 'preview',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true'
  };
  assert.equal(
    policy.signedTenantContextRouteError({ method: 'GET', url: '/api/v1/assets' }, requiredWithoutAutobind),
    'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
  );
  assert.equal(
    policy.signedTenantContextRouteError({ method: 'GET', url: '/api/v1/work-orders' }, requiredWithoutAutobind),
    null
  );
  assert.equal(
    policy.signedTenantContextRouteError({ method: 'POST', url: '/api/v1/work-orders' }, requiredWithoutAutobind),
    null
  );
});


test('operational signed routes pass the required-context gate only when their Preview policy is enabled', () => {
  const previewRead = {
    VERCEL_ENV: 'preview',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'true'
  };
  const previewWrite = {
    ...previewRead,
    OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_WRITE_ENABLED: 'true'
  };
  assert.equal(policy.signedContextRequested({ method: 'GET', url: '/api/v1/customers' }, previewRead), true);
  assert.equal(policy.signedTenantContextRouteError({ method: 'GET', url: '/api/v1/customers' }, previewRead), null);
  assert.equal(policy.signedContextRequested({ method: 'POST', url: '/api/v1/customers' }, previewWrite), true);
  assert.equal(policy.signedTenantContextRouteError({ method: 'POST', url: '/api/v1/customers' }, previewWrite), null);
  assert.equal(
    policy.signedTenantContextRouteError(
      { method: 'GET', url: '/api/v1/customers' },
      { ...previewRead, OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'false' }
    ),
    'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
  );
  assert.equal(
    policy.signedTenantContextRouteError(
      { method: 'GET', url: '/api/v1/customers' },
      { ...previewRead, VERCEL_ENV: 'production' }
    ),
    'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
  );
  assert.equal(
    policy.signedTenantContextRouteError(
      { method: 'GET', url: '/api/v1/autopilot/decision-memory' },
      previewWrite
    ),
    'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
  );
});

test('global session autobind remains Preview-only and satisfies the route requirement only when enabled', () => {
  const enabled = {
    VERCEL_ENV: 'preview',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true'
  };
  assert.equal(policy.signedSessionAutobindEnabled(enabled), true);
  assert.equal(policy.signedTenantContextRouteError({ method: 'GET', url: '/api/v1/assets' }, enabled), null);
  const production = { ...enabled, VERCEL_ENV: 'production' };
  assert.equal(policy.signedSessionAutobindEnabled(production), false);
  assert.equal(
    policy.signedTenantContextRouteError({ method: 'GET', url: '/api/v1/assets' }, production),
    'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
  );
});

test('server checks the route gate before its legacy unsigned field-context fallback', () => {
  const guardAt = server.indexOf('const routeError = signedTenantContextRouteError(req);');
  const unsignedBindAt = server.indexOf("store.db.setSession({ tenantId: c.organizationId", guardAt);
  assert.ok(guardAt >= 0, 'server must call the signed route guard');
  assert.ok(unsignedBindAt > guardAt, 'signed route guard must run before legacy unsigned field binding');
  assert.match(server, /SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED/);
  assert.match(server, /if \(signedAssetsReadEnabled\(req\)\)\s*\{\s*return runSignedWorkOrdersRead\(res, c, \(\) => store\.listAssets\(c\)\);/);
});
