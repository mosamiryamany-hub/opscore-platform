'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('mobile queue flush is single-flight and releases its lock after completion', () => {
  const source = fs.readFileSync(path.join(root, '..', 'mobile/src/sync.js'), 'utf8');
  assert.match(source, /let flushInFlight = null/);
  assert.match(source, /if \(flushInFlight\)\s*return flushInFlight/);
  assert.match(source, /flushInFlight = flushQueueOnce\(\)\.finally/);
});

test('server shutdown is idempotent and drains HTTP before closing the database', () => {
  const source = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(source, /let shuttingDown = false/);
  assert.match(source, /if \(shuttingDown\) return/);
  assert.match(source, /server\.close\(\(\) => \{/);
  assert.match(source, /server\.close\(\(\) => \{[\s\S]*?db\.close\(\)/);
  assert.match(source, /SIGINT.*gracefulShutdown/);
  assert.match(source, /SIGTERM.*gracefulShutdown/);
});
