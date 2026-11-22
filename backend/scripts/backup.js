'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {openDb} = require('../src/db');
const {DatabaseSync} = require('node:sqlite');

function assertRegularFile(file, code) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(code);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code);
}

function assertNoSidecars(file, code) {
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(file + suffix)) throw new Error(code);
  }
}

function assertIntegrity(db, prefix) {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity?.integrity_check !== 'ok') throw new Error(prefix + '_INTEGRITY_FAILED');
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length) throw new Error(prefix + '_FOREIGN_KEY_CHECK_FAILED');
}

const dbPath = path.resolve(process.env.SQLITE_PATH || './data/opscore.sqlite');
const outputPath = path.resolve(process.argv[2] || `./data/backups/opscore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);

assertRegularFile(dbPath, 'SOURCE_DATABASE_REQUIRED');
if (fs.statSync(dbPath).size === 0) throw new Error('SOURCE_DATABASE_EMPTY');
const sourceRealPath = fs.realpathSync(dbPath);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const outputDirectory = fs.realpathSync(path.dirname(outputPath));
const out = path.join(outputDirectory, path.basename(outputPath));
if (sourceRealPath === out) throw new Error('BACKUP_SOURCE_EQUALS_DESTINATION');
if (fs.existsSync(out)) {
  const targetStat = fs.lstatSync(out);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error('BACKUP_DESTINATION_NOT_REGULAR_FILE');
}
assertNoSidecars(out, 'BACKUP_DESTINATION_HAS_SQLITE_SIDECARS');

const temp = path.join(outputDirectory, `.${path.basename(out)}.${process.pid}.${crypto.randomUUID()}.tmp`);
let sourceDb;
try {
  sourceDb = openDb(sourceRealPath);
  assertIntegrity(sourceDb, 'SOURCE_DATABASE');
  sourceDb.exec(`VACUUM INTO '${temp.replaceAll("'", "''")}'`);
  sourceDb.close();
  sourceDb = null;

  assertRegularFile(temp, 'BACKUP_TEMP_FILE_MISSING');
  fs.chmodSync(temp, 0o600);
  const verify = new DatabaseSync(temp, { readOnly: true });
  try { assertIntegrity(verify, 'BACKUP'); }
  finally { verify.close(); }

  // The temporary database is in the same directory/filesystem. On POSIX,
  // rename atomically replaces an existing regular destination; failures leave
  // the previous backup untouched.
  fs.renameSync(temp, out);
  console.log(`Backup created: ${out}`);
  console.log('Integrity: PASS');
  console.log('Foreign keys: PASS');
} finally {
  if (sourceDb) sourceDb.close();
  try { fs.rmSync(temp, { force: true }); } catch {}
}
