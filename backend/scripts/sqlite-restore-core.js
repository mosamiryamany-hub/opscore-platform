'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { acquireDatabaseMaintenanceLock } = require('../src/sqlite-lifecycle');

function assertRegularFile(file, code) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error(code);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code);
}

function assertNoSidecars(file, code) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (fs.existsSync(file + suffix)) throw new Error(code);
  }
}

function assertDatabaseIntegrity(file, prefix) {
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

function syncFile(file) {
  const fd = fs.openSync(file, 'r');
  try { fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function restoreDatabase({
  sourcePath,
  destinationPath,
  verifyDatabase = assertDatabaseIntegrity,
  acquireMaintenance = acquireDatabaseMaintenanceLock
} = {}) {
  if (!sourcePath) throw new Error('BACKUP_FILE_REQUIRED');
  if (!destinationPath) throw new Error('RESTORE_DESTINATION_REQUIRED');

  const sourceArgument = path.resolve(String(sourcePath));
  assertRegularFile(sourceArgument, 'BACKUP_FILE_REQUIRED');
  const source = fs.realpathSync(sourceArgument);

  const destinationArgument = path.resolve(String(destinationPath));
  fs.mkdirSync(path.dirname(destinationArgument), { recursive: true });
  const destinationDirectory = fs.realpathSync(path.dirname(destinationArgument));
  const destination = path.join(destinationDirectory, path.basename(destinationArgument));

  if (source === destination || (fs.existsSync(destination) && fs.realpathSync(destination) === source)) {
    throw new Error('RESTORE_SOURCE_EQUALS_DESTINATION');
  }
  assertNoSidecars(source, 'RESTORE_SOURCE_HAS_SQLITE_SIDECARS');

  const beforeRestore = destination + '.before-restore';
  if (fs.existsSync(beforeRestore)) {
    const stat = fs.lstatSync(beforeRestore);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('RESTORE_SAFETY_COPY_NOT_REGULAR_FILE');
    throw new Error('RESTORE_SAFETY_COPY_ALREADY_EXISTS');
  }
  assertNoSidecars(beforeRestore, 'RESTORE_SAFETY_COPY_HAS_SQLITE_SIDECARS');

  const token = process.pid + '.' + crypto.randomUUID();
  const staged = path.join(destinationDirectory, '.' + path.basename(destination) + '.' + token + '.restore.tmp');
  const safetyStage = path.join(destinationDirectory, '.' + path.basename(destination) + '.' + token + '.safety.tmp');
  const rollbackStage = path.join(destinationDirectory, '.' + path.basename(destination) + '.' + token + '.rollback.tmp');
  let maintenance = null;
  let retainMaintenanceFence = false;

  try {
    // Validate the exact incoming bytes before asking the application to quiesce.
    fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(staged, 0o600);
    syncFile(staged);
    assertRegularFile(staged, 'RESTORE_STAGING_FILE_MISSING');
    verifyDatabase(staged, 'BACKUP');

    // Fences new app opens, rejects every live openDb lease across processes,
    // and scans /proc/self/fd for raw handles in this restorer process.
    maintenance = acquireMaintenance(destination);

    assertNoSidecars(destination, 'RESTORE_DESTINATION_HAS_SQLITE_SIDECARS');
    let destinationExists = false;
    let destinationHash = null;
    if (fs.existsSync(destination)) {
      const stat = fs.lstatSync(destination);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('RESTORE_DESTINATION_NOT_REGULAR_FILE');
      destinationExists = true;
      destinationHash = sha256File(destination);
    }

    if (fs.existsSync(beforeRestore)) throw new Error('RESTORE_SAFETY_COPY_ALREADY_EXISTS');

    // Keep an exact, private pre-restore copy. It is never overwritten by this command.
    if (destinationExists) {
      fs.copyFileSync(destination, safetyStage, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(safetyStage, 0o600);
      syncFile(safetyStage);
      fs.renameSync(safetyStage, beforeRestore);
      syncDirectory(destinationDirectory);
      if (sha256File(beforeRestore) !== destinationHash) {
        throw new Error('RESTORE_SAFETY_COPY_CONTENT_MISMATCH');
      }
    }

    // Same-filesystem rename is the only operation that changes the live path.
    fs.renameSync(staged, destination);

    try {
      syncDirectory(destinationDirectory);
      verifyDatabase(destination, 'RESTORED_DATABASE');
    } catch (verificationError) {
      try {
        if (destinationExists) {
          fs.copyFileSync(beforeRestore, rollbackStage, fs.constants.COPYFILE_EXCL);
          fs.chmodSync(rollbackStage, 0o600);
          syncFile(rollbackStage);
          fs.renameSync(rollbackStage, destination);
          syncDirectory(destinationDirectory);
          verifyDatabase(destination, 'ROLLBACK_DATABASE');
          if (sha256File(destination) !== destinationHash) {
            throw new Error('RESTORE_ROLLBACK_CONTENT_MISMATCH');
          }
        } else {
          fs.rmSync(destination, { force: true });
          syncDirectory(destinationDirectory);
          if (fs.existsSync(destination)) throw new Error('RESTORE_ROLLBACK_DESTINATION_REMAINS');
        }
      } catch (rollbackError) {
        // The live database path is now of uncertain state. Keep the fence in
        // place so no application connection can reopen it until an operator
        // inspects the database and explicitly resolves the maintenance lock.
        retainMaintenanceFence = true;
        throw new Error('RESTORE_ROLLBACK_FAILED', { cause: rollbackError });
      }
      throw new Error('RESTORE_POST_SWAP_VERIFICATION_FAILED_ROLLED_BACK', { cause: verificationError });
    }

    return {
      status: 'PASS',
      destination,
      safetyCopy: destinationExists ? beforeRestore : null,
      restoredSha256: sha256File(destination),
      rollbackProtection: 'PASS',
      restorerProcessOpenHandleCheck: 'PASS'
    };
  } finally {
    try { fs.rmSync(staged, { force: true }); } catch {}
    try { fs.rmSync(safetyStage, { force: true }); } catch {}
    try { fs.rmSync(rollbackStage, { force: true }); } catch {}
    if (maintenance && !retainMaintenanceFence) maintenance.release();
  }
}

module.exports = {
  restoreDatabase,
  assertDatabaseIntegrity,
  assertNoSidecars,
  sha256File
};
