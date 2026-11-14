'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('operational worker refuses PostgreSQL mode before opening its SQLite database', () => {
  const sqlitePath = path.join(os.tmpdir(), `opscore-worker-must-not-create-${process.pid}-${Date.now()}.sqlite`);
  try { fs.unlinkSync(sqlitePath); } catch (_) { /* test path is expected to be absent */ }

  const script = path.resolve(__dirname, '../scripts/operational-worker.js');
  const result = spawnSync(process.execPath, [script], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_ENGINE: 'postgres',
      OPSC_DATABASE_URL: 'postgres://unit-test.invalid/opscore',
      DATABASE_URL: 'postgres://unit-test.invalid/opscore',
      SQLITE_PATH: sqlitePath
    }
  });

  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OPSC_POSTGRES_WORKER_NOT_IMPLEMENTED/);
  assert.equal(fs.existsSync(sqlitePath), false, 'the worker must exit before opening or creating SQLite');
});
