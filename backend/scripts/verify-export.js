///usr/bin/env node
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('EXPORT_FILE_REQUIRED');
  process.exit(2);
}
let p;
try {
  p = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  console.error('EXPORT_JSON_INVALID');
  process.exit(1);
}
const errors = [];
if (p.schemaVersion !== 'opscore.organization-export.v1')
  errors.push('SCHEMA_VERSION_INVALID');
if (!p.organizationId)
  errors.push('ORGANIZATION_ID_REQUIRED');
if (!p.tables || typeof p.tables !== 'object')
  errors.push('TABLES_REQUIRED');
const canonical = JSON.stringify(p.tables || {});
const actual = crypto.createHash('sha256').update(canonical).digest('hex');
if (p.sha256 !== actual)
  errors.push('SNAPSHOT_HASH_MISMATCH');
for (const [name, t] of Object.entries(p.tables || {})) {
  if (!Array.isArray(t.columns) || !Array.isArray(t.rows))
    errors.push(`TABLE_SHAPE_INVALID:${ name }`);
  if (t.rows && t.rows.length > Number(p.maxRowsPerTable || 5000))
    errors.push(`TABLE_ROW_LIMIT_EXCEEDED:${ name }`);
}
const result = {
  status: errors.length ? 'FAIL' : 'PASS',
  schemaVersion: p.schemaVersion || null,
  organizationId: p.organizationId || null,
  tableCount: Object.keys(p.tables || {}).length,
  sha256Verified: errors.indexOf('SNAPSHOT_HASH_MISMATCH') === -1 && Boolean(p.sha256),
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length)
  process.exitCode = 1;
