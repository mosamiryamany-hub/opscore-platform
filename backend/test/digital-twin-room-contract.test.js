'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const web = path.join(backend, 'web');

test('digital twin room is wired to server-defined authenticated operational twin routes', () => {
  const html = fs.readFileSync(path.join(web, 'digital-twin-room.html'), 'utf8');
  const js = fs.readFileSync(path.join(web, 'digital-twin-room.js'), 'utf8');
  const server = fs.readFileSync(path.join(backend, 'src', 'server.js'), 'utf8');

  for (const route of [
    '/api/v1/me',
    '/api/v1/platform/twin',
    '/api/v1/platform/twin/snapshots',
    '/api/v1/platform/twin/integrity'
  ]) {
    assert.ok(js.includes(route), 'browser client must call ' + route);
    assert.ok(server.includes(route), 'server must define ' + route);
  }

  assert.match(server, /requireCtx\(req,\s*res\)/);
  assert.match(server, /requireScope\(c,\s*'read'\)/);
  assert.match(server, /requireScope\(c,\s*'write'\)/);
  assert.match(server, /store\.platformTwin\(c/);
  assert.match(server, /store\.verifyPlatformTwinChain\(c\)/);
  assert.match(server, /store\.verifyPlatformTwinSnapshot\(c/);

  assert.match(js, /credentials:\s*'same-origin'/);
  assert.match(js, /cache:\s*'no-store'/);
  assert.match(js, /crypto\.randomUUID\(\)/);
  assert.match(html, /Evidence boundary/);
  assert.match(html, /does not claim a physical-world synchronized 3D twin/);
  assert.doesNotMatch(js, /Math\.random|faker|mock|demo data|sample telemetry/i);
});
