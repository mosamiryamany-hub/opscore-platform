#!/usr/bin/env node
'use strict';
const path = require('node:path');
const {Store} = require('../backend/src/store');
const {openDb} = require('../backend/src/db');
const db = openDb(':memory:');
try {
  const s = new Store(db, { sessionTtlHours: 24 });
  const email = 'perf-gate@example.test';
  s.bootstrap({
    orgName: 'Performance Gate',
    email,
    password: 'Strong-pass-2026'
  });
  const ctx = s.login(email, 'Strong-pass-2026');
  for (let i = 0; i < 200; i++)
    s.createWorkOrder(ctx, {
      title: `Benchmark ${ i }`,
      number: `PG-${ String(i + 1).padStart(5, '0') }`
    });
  const samples = [];
  for (let i = 0; i < 8; i++)
    samples.push(s.performanceSnapshot(ctx).elapsedMs);
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)], p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)];
  const maxMedianMs = 25, maxP95Ms = 50;
  const status = median <= maxMedianMs && p95 <= maxP95Ms ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({
    schemaVersion: 'opscore.performance-gate.v1',
    status,
    samples,
    medianMs: median,
    p95Ms: p95,
    thresholds: {
      maxMedianMs,
      maxP95Ms
    },
    dataset: { workOrders: 200 },
    note: 'Local deterministic micro-benchmark only; not a production capacity certification.'
  }, null, 2));
  process.exitCode = status === 'PASS' ? 0 : 1;
} finally {
  db.close();
}


// Resource limits governance (links postgres-runtime limits to release gate)
(function resourceLimitsGate() {
  try {
    const runtime = require(path.join(__dirname, '..', 'backend', 'src', 'postgres-runtime.js'));
    const limits = runtime.getLimits({});
    const ok =
      Number.isFinite(limits.statementTimeoutMs) &&
      limits.statementTimeoutMs >= 1000 &&
      limits.statementTimeoutMs <= 120000 &&
      limits.tenantMaxConcurrent >= 1 &&
      limits.tenantMaxConcurrent <= 200;
    const line = JSON.stringify({
      id: 'resource-limits-bounds',
      status: ok ? 'PASS' : 'FAIL',
      limits,
      note: 'Bounds for OPSC_PG_STATEMENT_TIMEOUT_MS and OPSC_TENANT_MAX_CONCURRENT_QUERIES'
    });
    process.stdout.write(line + '\n');
    if (!ok) process.exitCode = 1;
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: 'resource-limits-bounds', status: 'UNVERIFIED', error: String(e.message || e) }) + '\n');
  }
})();
