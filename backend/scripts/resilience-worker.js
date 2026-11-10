#!/usr/bin/env node
'use strict';
const { openDb } = require('../src/db');
const { Store } = require('../src/store');
const config = require('../src/config');
const [dbPath, email, password, workerId, countText] = process.argv.slice(2);
if (!dbPath || !email || !password || !workerId || !countText) throw new Error('RESILIENCE_WORKER_ARGS_REQUIRED');
const count = Number(countText);
if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('RESILIENCE_WORKER_COUNT_INVALID');
const db = openDb(dbPath);
const started = process.hrtime.bigint();
try {
  const store = new Store(db, { ...config, sqlitePath: dbPath });
  const ctx = store.login(email, password);
  const created = [];
  for (let i = 0; i < count; i++) {
    const r = store.createWorkOrder(ctx, {
      title: `Resilience worker ${workerId} item ${i}`,
      number: `RG-${workerId}-${String(i).padStart(4, '0')}`
    });
    created.push(r.id);
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  process.stdout.write(JSON.stringify({ workerId, created: created.length, elapsedMs }));
} finally {
  db.close();
}
