'use strict';

// Restore is a Linux-only maintenance operation. It fails closed when process
// descriptor inspection is unavailable or when any process still has the DB open.
process.umask(0o077);

const path = require('node:path');
const { restoreDatabase } = require('./sqlite-restore-core');

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('BACKUP_FILE_REQUIRED');
const destinationPath = path.resolve(process.env.SQLITE_PATH || './data/opscore.sqlite');
const result = restoreDatabase({ sourcePath, destinationPath });

console.log('Restore completed: ' + result.destination);
console.log('Integrity: PASS');
console.log('Foreign keys: PASS');
console.log('Open handles: PASS');
console.log('Rollback protection: PASS');
if (result.safetyCopy) console.log('Safety copy: ' + result.safetyCopy);
console.log('Restored SHA-256: ' + result.restoredSha256);
