const fs = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const path = require('node:path');
const src = path.resolve(process.argv[2] || '');
if (!src || !fs.existsSync(src)) {
  console.error('BACKUP_FILE_REQUIRED');
  process.exit(2);
}
const db = new DatabaseSync(src);
try {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok')
    throw new Error('BACKUP_INTEGRITY_FAILED');
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length)
    throw new Error('BACKUP_FOREIGN_KEY_CHECK_FAILED');
  const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' ORDER BY name').all().map(x => x.name);
  console.log(JSON.stringify({
    backup: src,
    integrity: 'PASS',
    foreignKeys: 'PASS',
    applicationTables: tables.length,
    tables
  }, null, 2));
} finally {
  db.close();
}
