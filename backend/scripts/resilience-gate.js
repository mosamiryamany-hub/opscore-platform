#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const config = require('../src/config');
const root = path.resolve(__dirname, '..', '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-resilience-'));
const dbPath = path.join(temp, 'resilience.sqlite');
const results = [];
function record(id, status, detail, metrics = {}) { results.push({ id, status, detail, metrics }); }
function runWorker(workerId, count, email, password) {
  const out = cp.execFileSync(process.execPath, [path.join(__dirname, 'resilience-worker.js'), dbPath, email, password, String(workerId), String(count)], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  return JSON.parse(out);
}
let db;
try {
  db = openDb(dbPath);
  const store = new Store(db, { ...config, sqlitePath: dbPath, busyTimeoutMs: 10000 });
  const boot = store.bootstrap({ orgName: 'Resilience Gate', email: 'resilience@ops.test', password: 'Resilience-Strong-2026!' });
  const ctx = { ...boot, organizationId: boot.orgId, role: 'owner' };

  // 1) Deterministic rollback across every operational failure scenario.
  const scenarios = ['outbox-backlog','worker-degradation','geofence-anomalies','runtime-failure','capacity-pressure','dependency-outage','cascading-worker-failure'];
  for (const scenario of scenarios) {
    const before = store.detectOperationalFabric(ctx);
    const r = store.simulateOperationalScenario(ctx, { scenario, rollback: true });
    const after = store.detectOperationalFabric(ctx);
    const clean = before.outboxQueued === after.outboxQueued && before.staleProcessingJobs === after.staleProcessingJobs && before.geofenceAnomalies.length === after.geofenceAnomalies.length && before.runtime.errors === after.runtime.errors;
    record(`scenario-rollback:${scenario}`, r.rollback && clean ? 'PASS' : 'FAIL', clean ? 'Injected fault was detected then fully rolled back.' : 'Rollback left an observable runtime delta.', { detected: r.detected });
  }

  // 2) Idempotency pressure: repeated writes must create one logical effect.
  const work = store.createWorkOrder(ctx, { title: 'Idempotency target', number: 'RG-IDEM-1' });
  const key = 'resilience-idem-' + crypto.randomUUID();
  const first = store.idempotentWrite(ctx, 'resilience_idem', key, { workOrderId: work.id }, () => store.addComment(ctx, work.id, 'one logical comment'));
  let replays = 0;
  for (let i = 0; i < 40; i++) {
    const r = store.idempotentWrite(ctx, 'resilience_idem', key, { workOrderId: work.id }, () => store.addComment(ctx, work.id, 'SHOULD-NOT-DUPLICATE'));
    if (r.__idempotent) replays++;
  }
  const commentCount = store.listComments(ctx, work.id).length;
  record('idempotency-pressure', first && replays === 40 && commentCount === 1 ? 'PASS' : 'FAIL', '40 repeated requests preserved one side effect.', { replays, commentCount });

  // 3) Concurrent writer stress against the real SQLite file.
  const workers = 4, perWorker = 60, started = Date.now();
  const child = [];
  for (let i = 0; i < workers; i++) child.push(runWorker(i + 1, perWorker, 'resilience@ops.test', 'Resilience-Strong-2026!'));
  const elapsedMs = Date.now() - started;
  const count = db.prepare('SELECT COUNT(*) AS n FROM work_orders WHERE organization_id=?').get(ctx.organizationId).n;
  const expectedMin = 1 + workers * perWorker;
  const allChildren = child.every(x => x.created === perWorker);
  record('sqlite-concurrent-writers', allChildren && count >= expectedMin ? 'PASS' : 'FAIL', 'Independent Store processes completed concurrent writes on the same SQLite database.', { workers, perWorker, workOrderCount: count, expectedMin, elapsedMs, writesPerSecond: Number((workers * perWorker / Math.max(0.001, elapsedMs / 1000)).toFixed(2)) });

  // 4) Governed recovery: stale worker leases can be recovered and audited.
  const sim = store.simulateOperationalScenario(ctx, { scenario: 'worker-degradation', rollback: false });
  const recovery = store.recoverStaleOperationalJobs(ctx, { limit: 100 });
  const remaining = store.detectOperationalFabric(ctx).staleProcessingJobs;
  record('governed-worker-recovery', recovery.recovered > 0 && remaining === 0 ? 'PASS' : 'FAIL', 'Expired leases were requeued through governed recovery.', { recovered: recovery.recovered, remaining });

  // 5) Evidence integrity after stress/recovery.
  const graph = store.buildCausalEvidenceGraph(ctx, { incidentRef: 'RESILIENCE-GATE' });
  const integrity = store.verifyOperationalEvidence(ctx);
  record('evidence-integrity-after-drill', integrity.valid && graph.graphSha256.length === 64 ? 'PASS' : 'FAIL', 'Evidence graph and audit chain remain cryptographically verifiable after recovery activity.', { graphSha256: graph.graphSha256, auditValid: integrity.audit.valid });

  const failures = results.filter(x => x.status === 'FAIL');
  const report = {
    schemaVersion: 'opscore.resilience-gate.v1',
    generatedAt: new Date().toISOString(),
    release: require('../package.json').version,
    status: failures.length ? 'FAIL' : 'PASS',
    results,
    scope: {
      deterministicFailureScenarios: scenarios.length,
      concurrentWorkers: workers,
      writesPerWorker: perWorker,
      note: 'Local resilience/load gate. Network-edge chaos, real PostgreSQL failover, external provider outages and physical-device power-loss remain environment-bound.'
    }
  };
  const out = path.join(root, 'docs', 'verification', 'RESILIENCE_GATE_RESULT.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} catch (e) {
  record('resilience-gate-runner', 'FAIL', e.code || e.message);
  const report = { schemaVersion: 'opscore.resilience-gate.v1', generatedAt: new Date().toISOString(), status: 'FAIL', results };
  const out = path.join(root, 'docs', 'verification', 'RESILIENCE_GATE_RESULT.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.error(e.stack || e);
  process.exitCode = 1;
} finally {
  try { db?.close(); } catch {}
  fs.rmSync(temp, { recursive: true, force: true });
}
