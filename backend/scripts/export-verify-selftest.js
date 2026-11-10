const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-export-verify-'));
const dbPath = path.join(dir, 'source.sqlite');
const exportPath = path.join(dir, 'export.json');
let db;
try {
  db = openDb(dbPath);
  const store = new Store(db, { sessionTtlHours: 24 });
  store.bootstrap({ orgName: 'Export Verify', email: 'verify-export@example.test', password: 'Strong-pass-2026' });
  const owner = store.login('verify-export@example.test', 'Strong-pass-2026');
  store.createCustomer(owner, { name: 'Portable Verification Customer', externalRef: 'EXPORT-VERIFY-1' });
  fs.writeFileSync(exportPath, JSON.stringify(store.exportOrganizationSnapshot(owner)));
} finally {
  try { db?.close(); } catch {}
}
try {
  const verify = spawnSync(process.execPath, [path.join(__dirname, 'verify-export.js'), exportPath], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  process.stdout.write(verify.stdout || '');
  if (verify.status !== 0) {
    process.stderr.write(verify.stderr || 'EXPORT_VERIFY_FAILED\n');
    process.exit(verify.status || 1);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
