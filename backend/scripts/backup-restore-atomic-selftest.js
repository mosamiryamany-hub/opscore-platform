'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { openDb } = require('../src/db');
const { DatabaseSync } = require('node:sqlite');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-atomic-recovery-'));
const source = path.join(root, 'source.sqlite');
const backup = path.join(root, 'backup.sqlite');
const destination = path.join(root, 'destination.sqlite');
const corrupt = path.join(root, 'corrupt.sqlite');
const backupScript = path.join(__dirname, 'backup.js');
const restoreScript = path.join(__dirname, 'restore.js');
const verifyScript = path.join(__dirname, 'verify-backup.js');

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000
  });
}

function expectFailure(result, code) {
  assert.notEqual(result.status, 0, result.stdout || 'command unexpectedly succeeded');
  assert.match((result.stderr || '') + (result.stdout || ''), new RegExp(code));
}

try {
  const sourceDb = openDb(source);
  try {
    sourceDb.exec('CREATE TABLE recovery_marker (value TEXT NOT NULL)');
    sourceDb.prepare('INSERT INTO recovery_marker(value) VALUES(?)').run('from-backup');
  } finally {
    sourceDb.close();
  }

  const create = run(backupScript, [backup], { SQLITE_PATH: source });
  assert.equal(create.status, 0, create.stderr || create.stdout);
  const backupBeforeVerify = hash(backup);
  const verify = run(verifyScript, [backup], {});
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  assert.equal(hash(backup), backupBeforeVerify, 'read-only verification must not mutate the backup file');
  const report = JSON.parse(verify.stdout);
  assert.equal(report.integrity, 'PASS');
  assert.equal(report.foreignKeys, 'PASS');
  assert.equal(fs.statSync(backup).mode & 0o077, 0, 'backup must not grant group/other file access');

  // A failed new backup must not truncate or delete a valid prior backup.
  fs.writeFileSync(corrupt, 'this is deliberately not a SQLite database');
  const priorBackupHash = hash(backup);
  const failedBackup = run(backupScript, [backup], { SQLITE_PATH: corrupt });
  assert.notEqual(failedBackup.status, 0, 'corrupt source must fail closed');
  assert.equal(hash(backup), priorBackupHash, 'previous backup must remain byte-for-byte unchanged');

  fs.writeFileSync(backup + '-journal', 'sidecar sentinel');
  const blockedBackup = run(backupScript, [backup], { SQLITE_PATH: source });
  expectFailure(blockedBackup, 'BACKUP_DESTINATION_HAS_SQLITE_SIDECARS');
  assert.equal(hash(backup), priorBackupHash, 'backup sidecars must block replacement without touching the destination');
  fs.rmSync(backup + '-journal', { force: true });

  // Source and destination equality must be rejected before any mutation.
  const samePathHash = hash(backup);
  const samePath = run(backupScript, [backup], { SQLITE_PATH: backup });
  expectFailure(samePath, 'BACKUP_SOURCE_EQUALS_DESTINATION');
  assert.equal(hash(backup), samePathHash);

  const destinationDb = openDb(destination);
  try {
    destinationDb.exec('CREATE TABLE recovery_marker (value TEXT NOT NULL)');
    destinationDb.prepare('INSERT INTO recovery_marker(value) VALUES(?)').run('before-restore');
  } finally {
    destinationDb.close();
  }

  const restored = run(restoreScript, [backup], { SQLITE_PATH: destination });
  assert.equal(restored.status, 0, restored.stderr || restored.stdout);
  assert.ok(fs.existsSync(destination + '.before-restore'), 'restore must preserve a pre-restore safety copy');
  assert.equal(fs.statSync(destination).mode & 0o077, 0, 'restored database must not grant group/other file access');
  assert.equal(fs.statSync(destination + '.before-restore').mode & 0o077, 0, 'safety copy must not grant group/other file access');

  const liveDb = new DatabaseSync(destination);
  try {
    assert.equal(liveDb.prepare('SELECT value FROM recovery_marker').get().value, 'from-backup');
  } finally {
    liveDb.close();
  }
  const safetyDb = new DatabaseSync(destination + '.before-restore');
  try {
    assert.equal(safetyDb.prepare('SELECT value FROM recovery_marker').get().value, 'before-restore');
  } finally {
    safetyDb.close();
  }

  // Invalid incoming bytes must be rejected before touching the live destination.
  const destinationHash = hash(destination);
  const invalidRestore = run(restoreScript, [corrupt], { SQLITE_PATH: destination });
  assert.notEqual(invalidRestore.status, 0, 'corrupt restore source must fail closed');
  assert.equal(hash(destination), destinationHash, 'invalid restore must not mutate the live database');

  const sameRestoreHash = hash(destination);
  const sameRestore = run(restoreScript, [destination], { SQLITE_PATH: destination });
  expectFailure(sameRestore, 'RESTORE_SOURCE_EQUALS_DESTINATION');
  assert.equal(hash(destination), sameRestoreHash);

  const priorSafetyPath = destination + '.before-restore';
  fs.writeFileSync(priorSafetyPath, 'preserve previous safety artifact');
  const priorSafetyHash = hash(priorSafetyPath);
  const destinationBeforeSafetyGuard = hash(destination);
  const safetyGuard = run(restoreScript, [backup], { SQLITE_PATH: destination });
  expectFailure(safetyGuard, 'RESTORE_SAFETY_COPY_ALREADY_EXISTS');
  assert.equal(hash(destination), destinationBeforeSafetyGuard, 'existing destination must remain unchanged when prior safety copy exists');
  assert.equal(hash(priorSafetyPath), priorSafetyHash, 'existing safety copy must never be overwritten');
  fs.rmSync(priorSafetyPath, { force: true });

  // An active WAL/SHM pair is an explicit operational stop condition.
  fs.writeFileSync(destination + '-wal', 'wal sentinel');
  fs.writeFileSync(destination + '-journal', 'journal sentinel');
  const sidecarHash = hash(destination);
  const sidecarRestore = run(restoreScript, [backup], { SQLITE_PATH: destination });
  expectFailure(sidecarRestore, 'RESTORE_DESTINATION_HAS_SQLITE_SIDECARS');
  assert.equal(hash(destination), sidecarHash);
  fs.rmSync(destination + '-wal', { force: true });
  fs.rmSync(destination + '-journal', { force: true });

  console.log(JSON.stringify({
    status: 'PASS',
    checks: [
      'backup integrity and foreign-key verification',
      'failed backup preserves the prior backup byte-for-byte',
      'backup refuses WAL/SHM/journal sidecars without replacing the prior file',
      'backup rejects source/destination identity',
      'restore stages and validates before replacement',
      'restore preserves a pre-restore safety copy',
      'invalid restore leaves the live database byte-for-byte unchanged',
      'restore rejects source/destination identity',
      'restore refuses to overwrite an existing pre-restore safety copy',
      'restore refuses active SQLite WAL/SHM sidecars'
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
