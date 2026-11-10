'use strict';
const crypto = require('node:crypto');

const LINEAGE_VERSION = 'opscore.data-lineage.v1';
function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function makeLineage({ organizationId, metric, sourceTables, filters = [], transformation, evidence = [], generatedAt }) {
  if (!organizationId || !metric || !Array.isArray(sourceTables) || !transformation || !generatedAt)
    throw new Error('LINEAGE_REQUIRED_FIELDS');
  const row = {
    schemaVersion: LINEAGE_VERSION,
    organizationId,
    metric,
    sourceTables: [...new Set(sourceTables.map(String))].sort(),
    filters: filters.map(String),
    transformation: String(transformation),
    evidence: evidence.map(String),
    generatedAt
  };
  return Object.freeze({ ...row, lineageSha256: sha(row) });
}
module.exports = { LINEAGE_VERSION, makeLineage, sha };
