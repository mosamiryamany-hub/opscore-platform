///usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {DatabaseSync} = require('node:sqlite');
const {openDb} = require('../src/db');
const source = path.resolve(process.argv[2] || process.env.SQLITE_PATH || './data/opscore.sqlite');
if (!fs.existsSync(source)) {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: 'SOURCE_DATABASE_REQUIRED',
    source
  }, null, 2));
  process.exit(2);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-recovery-drill-'));
const backup = path.join(root, 'backup.db');
const restored = path.join(root, 'restored.db');
function inspect(file) {
  const db = new DatabaseSync(file);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' ORDER BY name').all().map(x => x.name);
    const counts = {};
    for (const t of tables)
      counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${ t.replaceAll('"', '""') }"`).get().c;
    return {
      integrity,
      foreignKeys: fk.length,
      tables,
      counts
    };
  } finally {
    db.close();
  }
}
let result;
try {
  const before = inspect(source);
  if (before.integrity !== 'ok')
    throw new Error('SOURCE_DATABASE_INTEGRITY_FAILED');
  if (before.foreignKeys)
    throw new Error('SOURCE_DATABASE_FOREIGN_KEY_CHECK_FAILED');
  const src = new DatabaseSync(source);
  try {
    src.exec(`VACUUM INTO '${ backup.replaceAll('\'', '\'\'') }'`);
  } finally {
    src.close();
  }
  const backupState = inspect(backup);
  if (backupState.integrity !== 'ok')
    throw new Error('BACKUP_INTEGRITY_FAILED');
  if (backupState.foreignKeys)
    throw new Error('BACKUP_FOREIGN_KEY_CHECK_FAILED');
  fs.copyFileSync(backup, restored);
  const restoredState = inspect(restored);
  if (restoredState.integrity !== 'ok')
    throw new Error('RESTORED_DATABASE_INTEGRITY_FAILED');
  if (restoredState.foreignKeys)
    throw new Error('RESTORED_DATABASE_FOREIGN_KEY_CHECK_FAILED');
  const sameTables = JSON.stringify(before.tables) === JSON.stringify(restoredState.tables);
  const sameCounts = JSON.stringify(before.counts) === JSON.stringify(restoredState.counts);
  if (!sameTables || !sameCounts)
    throw new Error('RECOVERY_STATE_MISMATCH');
  result = {
    status: 'PASS',
    source,
    backupSizeBytes: fs.statSync(backup).size,
    applicationTables: before.tables.length,
    sameTables,
    sameCounts,
    sourceIntegrity: 'PASS',
    backupIntegrity: 'PASS',
    restoredIntegrity: 'PASS',
    foreignKeys: 'PASS'
  };
} catch (e) {
  result = {
    status: 'FAIL',
    source,
    error: e.message
  };
  process.exitCode = 1;
} finally {
  try {
    fs.rmSync(root, {
      recursive: true,
      force: true
    });
  } catch {
  }
}
console.log(JSON.stringify(result, null, 2));
