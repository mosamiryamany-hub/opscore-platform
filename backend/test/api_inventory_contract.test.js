const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
}

test('source-derived API inventory and OpenAPI include all known regex-backed operational routes', () => {
  const inventory = load('docs/API_INVENTORY.json');
  const openapi = load('docs/openapi.json');
  const operations = inventory.routes.map(r => `${r.method} ${r.route}`);
  assert.ok(inventory.routeCount >= 345);
  for (const route of [
    'GET /api/v1/work-orders/{id}/why-blocked',
    'GET /api/v1/work-orders/{id}/work-pack',
    'GET /api/v1/work-orders/{id}/verified-job-record',
    'GET /api/v1/work-orders/{id}/changelog',
    'POST /api/v1/appointments/{id}/reschedule',
    'GET /api/v1/platform/twin/snapshots',
    'POST /api/v1/platform/twin/snapshots',
    'GET /api/v1/platform/twin/snapshots/{id}/verify'
  ]) {
    assert.ok(operations.includes(route), route);
    const [, pathName] = route.split(' ');
    assert.ok(openapi.paths[pathName], `OpenAPI path missing: ${pathName}`);
    assert.ok(openapi.paths[pathName][route.split(' ')[0].toLowerCase()], `OpenAPI method missing: ${route}`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(openapi.paths['/api/v1/platform/twin/snapshots/{id}/verify'], 'post'), false, 'verification endpoint is GET-only');
  for (const route of ['/api/verify/database','/api/verify/database-security','/api/verify/deployment']) {
    const entry = inventory.routes.find(r => r.method === 'GET' && r.route === route);
    assert.equal(entry?.auth, 'public', `public verification route classification: ${route}`);
    assert.equal(openapi.paths[route]?.get?.security, undefined, `public verification route must not require bearer auth: ${route}`);
  }
  const metrics = inventory.routes.find(r => r.method === 'GET' && r.route === '/metrics');
  assert.equal(metrics?.auth, 'required', 'metrics remains protected by its bearer token');
  assert.deepEqual(openapi.paths['/metrics']?.get?.security, [{ bearerAuth: [] }]);
});
