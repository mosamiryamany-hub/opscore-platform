'use strict';

process.umask(0o077);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

const MAGIC = Buffer.from('OPSCORE-BACKUP-AESGCM-V1\n', 'utf8');
const KEY_ENV = 'OPSC_BACKUP_ENCRYPTION_KEY';

function parseDatabaseUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('BACKUP_DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      !url.pathname || url.username === '' || !url.password ||
      url.searchParams.has('sslkey') || url.searchParams.has('sslcert')) {
    throw new Error('BACKUP_DATABASE_URL_INVALID');
  }
  return url;
}
function readKey(value) {
  let key;
  try { key = Buffer.from(String(value || ''), 'base64'); } catch { throw new Error('BACKUP_KEY_INVALID'); }
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== String(value || '').replace(/=+$/, '')) {
    throw new Error('BACKUP_KEY_MUST_BE_BASE64_32_BYTES');
  }
  return key;
}
function pgPassEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/[\r\n]/g, '');
}
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { if (stderr.length < 12000) stderr += chunk.toString('utf8'); });
    child.once('error', () => reject(new Error('BACKUP_TOOL_START_FAILED:' + path.basename(command))));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('BACKUP_TOOL_FAILED:' + path.basename(command) + ':' + String(code) + ':' + stderr.replace(/password\s*=\s*\S+/ig, 'password=[REDACTED]').slice(0, 1000))));
  });
}
async function encryptFile(input, output, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const out = fs.createWriteStream(output, { flags: 'wx', mode: 0o600 });
  out.write(MAGIC);
  out.write(nonce);
  await pipeline(fs.createReadStream(input), cipher, out);
  const tag = cipher.getAuthTag();
  fs.appendFileSync(output, tag, { mode: 0o600 });
  return { nonce, tag };
}
async function decryptFile(input, output, key) {
  const handle = await fs.promises.open(input, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size < MAGIC.length + 12 + 16) throw new Error('BACKUP_CIPHERTEXT_TRUNCATED');
    const header = Buffer.alloc(MAGIC.length + 12);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('BACKUP_FORMAT_INVALID');
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, stat.size - 16);
    const nonce = header.subarray(MAGIC.length);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const source = fs.createReadStream(input, { start: header.length, end: stat.size - 17 });
    await pipeline(source, decipher, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  } finally { await handle.close(); }
}
async function main() {
  const rawUrl = process.env.OPSC_BACKUP_DATABASE_URL || process.env.OPSC_DATABASE_URL;
  const url = parseDatabaseUrl(rawUrl);
  const key = readKey(process.env[KEY_ENV]);
  const outputDir = path.resolve(process.env.OPSC_BACKUP_DIR || './data/backups');
  const retention = Number(process.env.OPSC_BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) throw new Error('BACKUP_RETENTION_INVALID');
  await fs.promises.mkdir(outputDir, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(outputDir, 0o700);
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opscore-pg-backup-'));
  await fs.promises.chmod(work, 0o700);
  const dump = path.join(work, 'database.dump');
  const verified = path.join(work, 'verified.dump');
  const passFile = path.join(work, '.pgpass');
  const host = url.hostname;
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  await fs.promises.writeFile(passFile, [host, port, database, username, password].map(pgPassEscape).join(':') + '\n', { mode: 0o600, flag: 'wx' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const finalPath = path.join(outputDir, 'opscore-' + stamp + '.pgdump.aesgcm');
  const tempPath = finalPath + '.tmp';
  const sslMode = String(process.env.PGSSLMODE || (String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? 'verify-full' : 'require')).toLowerCase();
  if (!['require', 'verify-full'].includes(sslMode) || (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && sslMode !== 'verify-full')) throw new Error('BACKUP_POSTGRES_TLS_VERIFICATION_REQUIRED');
  const env = { ...process.env, PGPASSFILE: passFile, PGSSLMODE: sslMode };
  delete env.PGPASSWORD;
  try {
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dump, '--host', host, '--port', port, '--username', username, '--dbname', database], env);
    await encryptFile(dump, tempPath, key);
    await decryptFile(tempPath, verified, key);
    await run('pg_restore', ['--list', verified], env);
    const digest = await sha256File(tempPath);
    await fs.promises.rename(tempPath, finalPath);
    const now = Date.now();
    for (const name of await fs.promises.readdir(outputDir)) {
      if (!/^opscore-.*\.pgdump\.aesgcm$/.test(name)) continue;
      const file = path.join(outputDir, name);
      const stat = await fs.promises.lstat(file);
      if (stat.isFile() && !stat.isSymbolicLink() && now - stat.mtimeMs > retention * 86400000) await fs.promises.unlink(file);
    }
    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.encrypted-postgres-backup.v1',
      status: 'PASS',
      file: path.basename(finalPath),
      bytes: (await fs.promises.stat(finalPath)).size,
      sha256: digest,
      encryption: 'AES-256-GCM',
      restoreListValidation: 'PASS',
      retentionDays: retention,
      warning: 'pg_restore --list validates archive readability, not a full database restore. Perform scheduled isolated restore drills.'
    }, null, 2) + '\n');
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
    await fs.promises.rm(tempPath, { force: true });
  }
}
if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ schemaVersion: 'opscore.encrypted-postgres-backup.v1', status: 'FAIL', code: error.message }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { parseDatabaseUrl, readKey, encryptFile, decryptFile, MAGIC };
