'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, 'dependency-upgrade-gate.js');

test('mobile dependency gate validates the current SDK 58 / React Native lockfile', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'PASS');
  assert.equal(report.current.expo, '58.0.23');
  assert.equal(report.current.reactNative, '0.88.1');
  assert.equal(report.current.react, '19.3.0');
  assert.equal(report.current.reactDom, '19.3.0');
  assert.deepEqual(report.current.nodeForge, ['1.4.3']);
  assert.deepEqual(report.current.glob, ['14.0.4']);
  assert.deepEqual(report.current.minimatch, ['11.0.5']);
  assert.ok(report.checks.every(check => check.status === 'PASS'));
});
