'use strict';
// Regression coverage for the fault-fix pass on v0.11.61 (see inline comments at each fix site).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('log and error redaction never mangles IPv4 addresses or short numbers', () => {
  const { redactString } = require('../src/observability');
  const egress = require('../src/egress-guard');
  assert.equal(redactString('listening on 127.0.0.1:4500'), 'listening on 127.0.0.1:4500');
  assert.equal(redactString('host 10.0.0.1 port 8080'), 'host 10.0.0.1 port 8080');
  assert.match(redactString('call +20 100 123 4567 now'), /\[REDACTED_PHONE\]/);
  assert.equal(egress.redactString('ip 192.168.1.10'), 'ip 192.168.1.10');
  assert.match(egress.redactString('tel +1 (555) 123-4567 ok'), /^tel \[redacted-phone\] ok$/);
});

test('gateway circuit snapshot is tenant-scoped in memory mode', async () => {
  const { GatewayCircuitBreaker } = require('../src/gateway-circuit-breaker');
  const b = new GatewayCircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  await assert.rejects(b.execute('billing:alpha', async () => { throw new Error('boom'); }, 'org_a'));
  assert.ok(b.snapshot('org_a')['billing:alpha']);
  assert.equal(b.snapshot('org_b')['billing:alpha'], undefined);
});

test('gateway deferred-handler failures are recorded instead of silently swallowed', async () => {
  const { GatewayCircuitBreaker } = require('../src/gateway-circuit-breaker');
  const b = new GatewayCircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  b.setDeferredHandler(async () => { throw new Error('queue down'); });
  await assert.rejects(b.execute('maps:osrm', async () => { throw new Error('x'); }, 'org_a'));
  await assert.rejects(b.execute('maps:osrm', async () => 'ok', 'org_a'), /GATEWAY_CIRCUIT_OPEN/);
  assert.equal(b.deferredHandlerErrors, 1);
  assert.equal(b.lastDeferredHandlerError, 'queue down');
});

test('postgres tenant session is destroyed, not pooled, when it cannot be reset', async () => {
  const { withTenantClient } = require('../src/adapters/postgres');
  const make = (failReset) => {
    const events = [];
    const client = {
      query: async sql => {
        if (/RESET ALL/.test(sql) && failReset) throw new Error('reset failed');
        if (/set_config/.test(sql) && /''/.test(sql) && failReset) throw new Error('clear failed');
        return { rows: [] };
      },
      release: arg => events.push(arg === undefined ? 'pooled' : 'destroyed')
    };
    return { pool: { connect: async () => client }, events };
  };
  const clean = make(false);
  await withTenantClient(clean.pool, 'org_a', async () => {});
  assert.deepEqual(clean.events, ['pooled']);
  const dirty = make(true);
  await withTenantClient(dirty.pool, 'org_a', async () => {});
  assert.deepEqual(dirty.events, ['destroyed']);
  await assert.rejects(withTenantClient(make(false).pool, '', async () => {}), /TENANT_CONTEXT_REQUIRED/);
});

test('migration preflight API reports the real migration set (same result as the release gate)', () => {
  const { Store } = require('../src/store');
  const api = Store.prototype.releaseMigrationPreflight.call({}, { role: 'admin' });
  assert.ok(api.migrationCount >= 27, `expected migrations, got ${api.migrationCount}`);
  assert.equal(api.files[0], '000_canonical_schema.sql');
  assert.equal(api.contiguous, true);
  assert.deepEqual(api.gaps, []);
  assert.deepEqual(api.duplicateNumbers, [], 'no duplicate numeric migration identifiers are permitted');
  assert.ok(api.files.includes('044_system_tables_rls.sql'));
  assert.equal(api.files.includes('040_system_tables_rls.sql'), false);
  const gate = JSON.parse(cp.execFileSync(process.execPath, ['scripts/migration-preflight.js'], { cwd: root, encoding: 'utf8' }));
  assert.equal(api.sha256, gate.sha256);
});

test('firewall blocks Windows-style and POSIX path traversal in request URLs', () => {
  const { inspectRequest } = require('../src/firewall');
  const config = { maxUrlLength: 8192, maxBodyBytes: 2000000, trustProxy: false, trustedProxyCidrs: [] };
  assert.throws(() => inspectRequest({ method: 'GET', url: '/api/v1/x/..\\..\\secret', headers: {} }, config));
  assert.throws(() => inspectRequest({ method: 'GET', url: '/api/v1/x/../../secret', headers: {} }, config));
  assert.doesNotThrow(() => inspectRequest({ method: 'GET', url: '/api/v1/work-orders?limit=5', headers: {} }, config));
});

test('business calendar exception date validation accepts ISO dates', () => {
  assert.match(read('src/enterprise-extensions.js'), /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(date\)/);
});

test('2026 intelligence gateway calls use the shared circuit breaker', () => {
  const src = read('src/2026-intelligence.js');
  assert.match(src, /const \{breaker\}=require\('\.\/enterprise-value-additions'\)/);
});

test('audit-chain governance route has verifyAuditChain in scope', () => {
  assert.match(read('src/server.js'), /const \{verifyAuditChain\} = require\('\.\/audit'\)/);
});

test('web base paths do not depend on the launch directory', () => {
  const server = read('src/server.js');
  assert.doesNotMatch(server, /process\.cwd\(\)/);
  assert.match(server, /const webRoot = path\.resolve\(__dirname, '\.\.', 'web'\)/);
});

test('geomap breadcrumb trails paint without referencing an undeclared context', () => {
  const src = read('web/geomap.js');
  const start = src.indexOf('// Breadcrumb trails (path history)');
  const end = src.indexOf('for (const t of this.techs)', start);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(src.slice(start, end), /\bctx\./);
});

test('release gates that ship with the package pass on this tree', () => {
  const runs = [
    { cwd: root, script: path.join(root, 'scripts', 'release-hardening-gate.js') },
    { cwd: path.join(root, '..'), script: path.join(root, '..', 'scripts', 'release-doc-gate.js') }
  ];
  for (const { cwd, script } of runs) {
    const r = cp.spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `${path.basename(script)}\n${r.stdout}\n${r.stderr}`);
  }
});
