const {openDb, CURRENT_SCHEMA_VERSION} = require('../src/db');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const dbPath = require('../src/config').sqlitePath;
let rawVersion = 0;
if (fs.existsSync(dbPath)) {
  const raw = new DatabaseSync(dbPath);
  rawVersion = Number(raw.prepare('PRAGMA user_version').get().user_version || 0);
  raw.close();
}
if (rawVersion && rawVersion !== CURRENT_SCHEMA_VERSION) {
  console.error(JSON.stringify({
    status: 'FAIL',
    reason: 'DB_SCHEMA_VERSION_MISMATCH',
    dbVersion: rawVersion,
    codeVersion: CURRENT_SCHEMA_VERSION
  }));
  process.exit(1);
}
const db = openDb();
const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name').all().map(x => x.name);
const required = [
  'organizations',
  'users',
  'memberships',
  'work_orders',
  'attachments',
  'webhook_endpoints',
  'webhook_deliveries',
  'sync_events',
  'org_units',
  'unit_memberships'
];
const result = {
  driver: 'sqlite',
  status: 'PASS',
  node: process.versions.node,
  schemaVersion: {
    db: CURRENT_SCHEMA_VERSION,
    code: CURRENT_SCHEMA_VERSION,
    status: 'PASS'
  },
  requiredTables: Object.fromEntries(required.map(t => [
    t,
    tables.includes(t) ? 'PASS' : 'FAIL'
  ])),
  tables
};
if (required.some(t => !tables.includes(t)))
  result.status = 'FAIL';
if (process.env.DATABASE_URL)
  result.postgresql = 'CONFIGURED_BUT_NOT_RUNTIME_VERIFIED';
else
  result.postgresql = 'UNVERIFIED';
result.postgis = process.env.DATABASE_URL ? 'UNVERIFIED' : 'NOT_CONFIGURED';
result.authMode = process.env.AUTH_MODE || 'local';
result.productionCertification = 'NOT_ESTABLISHED';
console.log(JSON.stringify(result, null, 2));
db.close();
