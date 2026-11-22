'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('SQLite backup and restore preserve existing data on failed operations', { timeout: 180000 }, () => {
  const script = path.join(__dirname, '..', 'scripts', 'backup-restore-atomic-selftest.js');
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 170000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'atomic recovery selftest failed');
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'PASS');
  assert.ok(report.checks.length >= 8);
});
