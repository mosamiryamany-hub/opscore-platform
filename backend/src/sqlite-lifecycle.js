'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CONTROL_SUFFIX = '.opscore-lifecycle';

function canonicalDatabasePath(dbPath) {
  if (String(dbPath) === ':memory:') return null;
  const absolute = path.resolve(String(dbPath));
  try {
    if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const parent = fs.realpathSync(path.dirname(absolute));
  return path.join(parent, path.basename(absolute));
}

function lifecyclePaths(dbPath) {
  const databasePath = canonicalDatabasePath(dbPath);
  if (!databasePath) return null;
  const controlDirectory = databasePath + CONTROL_SUFFIX;
  return {
    databasePath,
    controlDirectory,
    leasesDirectory: path.join(controlDirectory, 'leases'),
    maintenanceLockPath: path.join(controlDirectory, 'maintenance.lock')
  };
}

function processIdentity(pid = process.pid) {
  try {
    const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
    const closingParen = stat.lastIndexOf(')');
    if (closingParen < 0) return null;
    const fields = stat.slice(closingParen + 2).trim().split(/\s+/);
    const startTicks = fields[19];
    if (!bootId || !startTicks) return null;
    return { bootId, startTicks };
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM', 'ESRCH'].includes(error?.code)) throw error;
    return null;
  }
}

function ownerIsAlive(metadata) {
  const pid = Number(metadata?.pid);
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    // EPERM is not proof of death; fail closed.
    return true;
  }

  const observed = processIdentity(pid);
  if (observed && metadata.bootId && metadata.startTicks) {
    if (observed.bootId !== metadata.bootId) return false;
    if (observed.startTicks !== String(metadata.startTicks)) return false;
  }
  return true;
}

function readMetadata(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // An unreadable or malformed live lock must never be treated as stale.
    if (error?.code === 'ENOENT' || error instanceof SyntaxError || error?.code === 'EACCES' || error?.code === 'EPERM') return null;
    return null;
  }
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('SQLITE_LIFECYCLE_DIRECTORY_INVALID');
  }
  fs.chmodSync(directory, 0o700);
}

function makeOwnerMetadata(token) {
  return {
    token,
    pid: process.pid,
    hostname: require('node:os').hostname(),
    createdAt: new Date().toISOString(),
    ...(processIdentity(process.pid) || {})
  };
}

function clearStaleMaintenanceLock(lockPath) {
  if (!fs.existsSync(lockPath)) return false;
  const metadata = readMetadata(lockPath);
  if (!metadata || ownerIsAlive(metadata)) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    return false;
  }
}

function acquireDatabaseLease(dbPath) {
  const paths = lifecyclePaths(dbPath);
  if (!paths) return { release() {} };

  if (fs.existsSync(paths.maintenanceLockPath)) {
    clearStaleMaintenanceLock(paths.maintenanceLockPath);
  }
  if (fs.existsSync(paths.maintenanceLockPath)) {
    throw new Error('SQLITE_DATABASE_MAINTENANCE_IN_PROGRESS');
  }

  ensurePrivateDirectory(paths.controlDirectory);
  ensurePrivateDirectory(paths.leasesDirectory);

  const token = crypto.randomUUID();
  const leasePath = path.join(paths.leasesDirectory, process.pid + '.' + token + '.json');
  const metadata = makeOwnerMetadata(token);
  const fd = fs.openSync(leasePath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(metadata) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Close the race with a maintenance operation that began after the first check.
  if (fs.existsSync(paths.maintenanceLockPath)) {
    try { fs.unlinkSync(leasePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    throw new Error('SQLITE_DATABASE_MAINTENANCE_IN_PROGRESS');
  }

  let released = false;
  return {
    path: leasePath,
    release() {
      if (released) return;
      released = true;
      try { fs.unlinkSync(leasePath); } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  };
}

function scanOpenDatabaseHandles(databasePath) {
  if (process.platform !== 'linux') {
    throw new Error('SQLITE_OPEN_HANDLE_SCAN_UNSUPPORTED');
  }

  const effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  if (effectiveUid === null) throw new Error('SQLITE_DATABASE_OWNER_MISMATCH');

  let targetStat;
  let canonicalTarget;
  let directoryStat;
  try {
    const canonicalDirectory = fs.realpathSync(path.dirname(databasePath));
    canonicalTarget = path.join(canonicalDirectory, path.basename(databasePath));
    directoryStat = fs.statSync(canonicalDirectory);
    targetStat = fs.statSync(canonicalTarget);
  } catch (error) {
    if (error?.code === 'ENOENT' && fs.existsSync(path.dirname(databasePath))) {
      // A missing database is allowed only after its containing directory has
      // been resolved and validated below.
      targetStat = null;
    } else {
      throw new Error('SQLITE_DATABASE_IDENTITY_UNAVAILABLE', { cause: error });
    }
  }

  if (!directoryStat || !directoryStat.isDirectory()) {
    throw new Error('SQLITE_DATABASE_DIRECTORY_INVALID');
  }
  // Shared writable directories are accepted only with the sticky bit (for
  // example /tmp). This prevents other UIDs from unlinking/replacing a file
  // they do not own; the database itself must still be owner-only (0600).
  if ((directoryStat.mode & 0o022) !== 0 && (directoryStat.mode & 0o1000) === 0) {
    throw new Error('SQLITE_DATABASE_DIRECTORY_SHARED_WRITABLE');
  }
  if (!targetStat) return [];
  if (targetStat.uid !== effectiveUid) throw new Error('SQLITE_DATABASE_OWNER_MISMATCH');
  if ((targetStat.mode & 0o077) !== 0) throw new Error('SQLITE_DATABASE_PERMISSIONS_NOT_PRIVATE');

  const matches = [];
  const seen = new Set();
  const inspectFdDirectory = (pidText, fdDirectory) => {
    let descriptors;
    try { descriptors = fs.readdirSync(fdDirectory); }
    catch (error) {
      if (error?.code === 'ENOENT') return;
      throw new Error('SQLITE_OPEN_HANDLE_SCAN_INCOMPLETE', { cause: error });
    }

    for (const descriptor of descriptors) {
      if (!/^\d+$/.test(descriptor)) continue;
      const key = pidText + ':' + descriptor;
      if (seen.has(key)) continue;
      seen.add(key);
      const descriptorPath = path.join(fdDirectory, descriptor);
      let openedStat;
      let linkTarget;
      try {
        openedStat = fs.statSync(descriptorPath);
        linkTarget = fs.readlinkSync(descriptorPath);
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'EBADF') continue;
        throw new Error('SQLITE_OPEN_HANDLE_SCAN_INCOMPLETE', { cause: error });
      }

      const normalizedTarget = linkTarget.endsWith(' (deleted)')
        ? linkTarget.slice(0, -10)
        : linkTarget;
      const sameInode = openedStat.dev === targetStat.dev && openedStat.ino === targetStat.ino;
      const samePath = path.isAbsolute(normalizedTarget) && path.resolve(normalizedTarget) === canonicalTarget;
      if (!sameInode && !samePath) continue;

      let command = 'unknown';
      try { command = fs.readFileSync('/proc/' + pidText + '/comm', 'utf8').trim() || command; }
      catch (error) {
        if (!['ENOENT', 'EACCES', 'EPERM'].includes(error?.code)) {
          throw new Error('SQLITE_OPEN_HANDLE_SCAN_INCOMPLETE', { cause: error });
        }
      }
      matches.push({ pid: pidText === 'self' ? process.pid : Number(pidText), command, descriptor: Number(descriptor) });
    }
  };

  // Processes running as this database's owning UID are scanned in full. The
  // database file is owner-only (0600); unrelated UIDs cannot open it through
  // normal filesystem permissions. Root/privileged host processes and
  // other PID namespaces remain outside this application's supported SQLite
  // concurrency boundary; operators must stop those external actors separately.
  const processCanAccessPrivateDatabase = pidText => {
    let status;
    try {
      status = fs.readFileSync('/proc/' + pidText + '/status', 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw new Error('SQLITE_OPEN_HANDLE_SCAN_INCOMPLETE', { cause: error });
    }
    const uidLine = status.split('\n').find(line => line.startsWith('Uid:'));
    const uids = uidLine ? uidLine.trim().split(/\s+/).slice(1, 5).map(Number) : [];
    if (uids.length !== 4 || uids.some(uid => !Number.isSafeInteger(uid))) {
      throw new Error('SQLITE_OPEN_HANDLE_SCAN_INCOMPLETE');
    }
    // Root is privileged and may bypass DAC; its open handles are an explicit
    // operator stop condition rather than silently claimed as covered by /proc.
    if (uids.every(uid => uid === 0)) return false;
    return uids.includes(effectiveUid);
  };

  // Inspect this process explicitly; /proc/self works even when other PIDs are
  // hidden by a container's procfs policy.
  inspectFdDirectory('self', '/proc/self/fd');
  let entries;
  try { entries = fs.readdirSync('/proc'); }
  catch (error) { throw new Error('SQLITE_OPEN_HANDLE_SCAN_UNAVAILABLE', { cause: error }); }

  for (const pidText of entries) {
    if (!/^\d+$/.test(pidText) || Number(pidText) === process.pid) continue;
    if (!processCanAccessPrivateDatabase(pidText)) continue;
    inspectFdDirectory(pidText, '/proc/' + pidText + '/fd');
  }
  return matches;
}

function acquireDatabaseMaintenanceLock(dbPath) {
  const paths = lifecyclePaths(dbPath);
  if (!paths) throw new Error('SQLITE_MAINTENANCE_REQUIRES_FILE_DATABASE');
  ensurePrivateDirectory(paths.controlDirectory);
  ensurePrivateDirectory(paths.leasesDirectory);

  if (fs.existsSync(paths.maintenanceLockPath)) {
    clearStaleMaintenanceLock(paths.maintenanceLockPath);
  }

  const token = crypto.randomUUID();
  const metadata = makeOwnerMetadata(token);
  let fd;
  try {
    fd = fs.openSync(paths.maintenanceLockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('SQLITE_DATABASE_MAINTENANCE_LOCKED');
    throw error;
  }

  try {
    fs.writeFileSync(fd, JSON.stringify(metadata) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const current = readMetadata(paths.maintenanceLockPath);
    if (current?.token !== token) {
      throw new Error('SQLITE_MAINTENANCE_LOCK_OWNERSHIP_LOST');
    }
    fs.unlinkSync(paths.maintenanceLockPath);
  };

  try {
    const activeLeases = [];
    for (const name of fs.readdirSync(paths.leasesDirectory)) {
      if (!name.endsWith('.json')) continue;
      const leasePath = path.join(paths.leasesDirectory, name);
      const lease = readMetadata(leasePath);
      if (!lease) {
        activeLeases.push({ file: name, reason: 'invalid_lease_metadata' });
        continue;
      }
      if (ownerIsAlive(lease)) {
        activeLeases.push({ pid: lease.pid, hostname: lease.hostname || null });
      } else {
        try { fs.unlinkSync(leasePath); } catch (error) {
          if (error?.code !== 'ENOENT') activeLeases.push({ file: name, reason: 'stale_lease_cleanup_failed' });
        }
      }
    }
    if (activeLeases.length) {
      throw new Error('SQLITE_DATABASE_IN_USE:' + JSON.stringify(activeLeases));
    }

    const openHandles = scanOpenDatabaseHandles(paths.databasePath);
    if (openHandles.length) {
      throw new Error('SQLITE_DATABASE_OPEN_HANDLE_PRESENT:' + JSON.stringify(openHandles));
    }

    return {
      ...paths,
      release
    };
  } catch (error) {
    try { release(); } catch (releaseError) { throw new Error('SQLITE_MAINTENANCE_LOCK_RELEASE_FAILED', { cause: releaseError }); }
    throw error;
  }
}

module.exports = {
  acquireDatabaseLease,
  acquireDatabaseMaintenanceLock,
  canonicalDatabasePath,
  lifecyclePaths,
  scanOpenDatabaseHandles
};
