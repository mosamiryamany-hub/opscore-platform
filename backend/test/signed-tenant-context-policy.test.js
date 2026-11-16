'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const policy = require('../src/signed-tenant-context-policy');
const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');

const previewRead = {
  VERCEL_ENV: 'preview',
  OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true'
};
const previewWrite = {
  ...previewRead,
  OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true'
};

test('signed work-order GET allowlist remains Preview-only and method-specific', () => {
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'GET', url: '/api/v1/work-orders' }, previewRead), true);
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'GET', url: '/api/v1/work-orders/wo_123/timeline' }, previewRead), true);
  assert.equal(policy.signedWorkOrdersReadEnabled({ method: 'POST', url: '/api/v1/work-orders/wo_123/timeline' }, previewRead), false);
  assert.equal(policy.signedWorkOrdersReadEnabled(
    { method: 'GET', url: '/api/v1/work-orders' },
    { ...previewRead, VERCEL_ENV: 'production' }
  ), false);
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
});
