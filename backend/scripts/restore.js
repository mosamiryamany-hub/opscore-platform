const fs = require('node:fs');
const path = require('node:path');
const {openDb} = require('../src/db');
const {DatabaseSync} = require('node:sqlite');
const src = path.resolve(process.argv[2] || '');
const dst = path.resolve(process.env.SQLITE_PATH || './data/opscore.sqlite');
if (!src || !fs.existsSync(src))
  throw new Error('BACKUP_FILE_REQUIRED');
const probe = new DatabaseSync(src);
try {
  const integrity = probe.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok')
    throw new Error('BACKUP_INTEGRITY_FAILED');
} finally {
  probe.close();
}
if (fs.existsSync(dst))
  fs.copyFileSync(dst, dst + '.before-restore');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
const db = openDb(dst);
try {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok')
    throw new Error('RESTORED_DATABASE_INTEGRITY_FAILED');
  console.log(`Restore completed: ${ dst }`);
  console.log('Integrity: PASS');
} finally {
  db.close();
}
