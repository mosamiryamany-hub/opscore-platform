const fs = require('node:fs');
const path = require('node:path');
const {openDb} = require('../src/db');
const {DatabaseSync} = require('node:sqlite');
const dbPath = path.resolve(process.env.SQLITE_PATH || './data/opscore.sqlite');
const out = path.resolve(process.argv[2] || `./data/backups/opscore-${ new Date().toISOString().replace(/[:.]/g, '-') }.db`);
const db = openDb(dbPath);
try {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok')
    throw new Error('DATABASE_INTEGRITY_FAILED');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out))
    fs.unlinkSync(out);
  db.exec(`VACUUM INTO '${ out.replaceAll('\'', '\'\'') }'`);
  console.log(`Backup created: ${ out }`);
  console.log('Integrity: PASS');
} finally {
  db.close();
}
