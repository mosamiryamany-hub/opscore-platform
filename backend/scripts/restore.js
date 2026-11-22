'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

function assertIntegrity(file, prefix) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') throw new Error(prefix + '_INTEGRITY_FAILED');
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length) throw new Error(prefix + '_FOREIGN_KEY_CHECK_FAILED');
  } finally {
    db.close();
  }
}

function assertNoSidecars(file, code) {
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(file + suffix)) throw new Error(code);
  }
}

const sourceArgument = process.argv[2];
if (!sourceArgument) throw new Error('BACKUP_FILE_REQUIRED');
const sourceArgumentPath = path.resolve(sourceArgument);
assertRegularFile(sourceArgumentPath, 'BACKUP_FILE_REQUIRED');
const src = fs.realpathSync(sourceArgumentPath);
const dstArgumentPath = path.resolve(process.env.SQLITE_PATH || './data/opscore.sqlite');
fs.mkdirSync(path.dirname(dstArgumentPath), { recursive: true });
const destinationDirectory = fs.realpathSync(path.dirname(dstArgumentPath));
const dst = path.join(destinationDirectory, path.basename(dstArgumentPath));

if (src === dst || (fs.existsSync(dst) && fs.realpathSync(dst) === src)) {
  throw new Error('RESTORE_SOURCE_EQUALS_DESTINATION');
}
assertNoSidecars(src, 'RESTORE_SOURCE_HAS_SQLITE_SIDECARS');
assertNoSidecars(dst, 'RESTORE_DESTINATION_HAS_SQLITE_SIDECARS');

let destinationExists = false;
if (fs.existsSync(dst)) {
  const stat = fs.lstatSync(dst);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('RESTORE_DESTINATION_NOT_REGULAR_FILE');
  destinationExists = true;
}
const beforeRestore = dst + '.before-restore';
if (fs.existsSync(beforeRestore)) {
  const stat = fs.lstatSync(beforeRestore);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('RESTORE_SAFETY_COPY_NOT_REGULAR_FILE');
}
assertNoSidecars(beforeRestore, 'RESTORE_SAFETY_COPY_HAS_SQLITE_SIDECARS');

const token = `${process.pid}.${crypto.randomUUID()}`;
const staged = path.join(destinationDirectory, `.${path.basename(dst)}.${token}.restore.tmp`);
const safetyStage = path.join(destinationDirectory, `.${path.basename(dst)}.${token}.safety.tmp`);
const rollbackStage = path.join(destinationDirectory, `.${path.basename(dst)}.${token}.rollback.tmp`);
try {
  // Validate the exact bytes that will be installed, not just the source path.
  fs.copyFileSync(src, staged, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(staged, 0o600);
  assertRegularFile(staged, 'RESTORE_STAGING_FILE_MISSING');
  assertIntegrity(staged, 'BACKUP');

  // Preserve the current destination only after the incoming file is proven valid.
  if (destinationExists) {
    fs.copyFileSync(dst, safetyStage, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(safetyStage, 0o600);
    fs.renameSync(safetyStage, beforeRestore);
  }

  // Staging is on the destination filesystem, so the replacement is a single
  // rename operation on POSIX. No partial database bytes are copied over dst.
  fs.renameSync(staged, dst);

  try {
    assertIntegrity(dst, 'RESTORED_DATABASE');
  } catch (verificationError) {
    try {
      if (destinationExists) {
        fs.copyFileSync(beforeRestore, rollbackStage, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(rollbackStage, 0o600);
        fs.renameSync(rollbackStage, dst);
      } else {
        fs.rmSync(dst, { force: true });
      }
    } catch (rollbackError) {
      throw new Error('RESTORE_ROLLBACK_FAILED', { cause: rollbackError });
    }
    throw verificationError;
  }

  console.log(`Restore completed: ${dst}`);
  console.log('Integrity: PASS');
  console.log('Foreign keys: PASS');
  if (destinationExists) console.log(`Safety copy: ${beforeRestore}`);
} finally {
  for (const file of [staged, safetyStage, rollbackStage]) {
    try { fs.rmSync(file, { force: true }); } catch {}
  }
}
