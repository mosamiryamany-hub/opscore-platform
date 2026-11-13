'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'scripts', 'generate-production-acceptance-v1.js');

test('generator script is present and documents fail-closed behavior', () => {
  const src = fs.readFileSync(script, 'utf8');
  assert.match(src, /opscore\.production-acceptance\.v1/);
  assert.match(src, /failClosed: true/);
  assert.match(src, /Never writes status=PASS unless/);
});

test('generator fails closed without database URL and pipeline identity', () => {
  const res = spawnSync(process.execPath, [script], {
    env: { ...process.env, OPSC_PG_ACCEPTANCE_URL: '', OPSC_DATABASE_URL: '', DATABASE_URL: '', GITHUB_SHA: '', GITHUB_RUN_ID: '' },
    encoding: 'utf8'
  });
  assert.notEqual(res.status, 0);
});
