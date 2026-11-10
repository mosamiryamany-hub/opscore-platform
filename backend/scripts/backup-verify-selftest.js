const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openDb } = require('../src/db');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-backup-verify-'));
const source = path.join(dir, 'source.sqlite');
const backup = path.join(dir, 'backup.sqlite');
try {
  const db = openDb(source);
  try {
    db.prepare('PRAGMA user_version').get();
  } finally {
    db.close();
  }
  const create = spawnSync(process.execPath, [path.join(__dirname, 'backup.js'), backup], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, SQLITE_PATH: source },
    encoding: 'utf8'
  });
  if (create.status !== 0) {
    process.stderr.write(create.stderr || create.stdout || 'BACKUP_CREATE_FAILED\n');
    process.exit(create.status || 1);
  }
  const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-backup.js'), backup], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  });
  process.stdout.write(verify.stdout || '');
  if (verify.status !== 0) {
    process.stderr.write(verify.stderr || 'BACKUP_VERIFY_FAILED\n');
    process.exit(verify.status || 1);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
