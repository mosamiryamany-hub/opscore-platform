'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const deploy = fs.readFileSync(path.join(root, '.github/workflows/vercel-deploy.yml'), 'utf8');
const postgres = fs.readFileSync(path.join(root, '.github/workflows/digital-twin-postgres-live.yml'), 'utf8');

test('production deploy pins the declared backend Node engine before installing and running tooling', () => {
  const setup = deploy.indexOf('Set up Node.js 22.23.4 for deployment and acceptance tooling');
  const install = deploy.indexOf('Install Vercel CLI');
  const generator = deploy.indexOf('Generate scoped production acceptance v2 evidence');
  assert.ok(setup >= 0 && install > setup && generator > setup);
  assert.match(deploy.slice(setup, install), /node-version: '22\.23\.4'/);
});

test('production acceptance consumes caller-bound CI evidence and never certifies production isolation from an env flag', () => {
  assert.match(deploy, /tenant_matrix_evidence_b64/);
  assert.match(deploy, /restore_drill_evidence_b64/);
  assert.match(deploy, /OPSC_TENANT_MATRIX_EVIDENCE_PATH/);
  assert.match(deploy, /OPSC_RESTORE_DRILL_EVIDENCE_PATH/);
  assert.match(deploy, /OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'NOT_CERTIFIED'/);
  assert.doesNotMatch(deploy, /OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'/);
  assert.doesNotMatch(deploy, /NEON_API_KEY:/);
  assert.match(postgres, /TENANT_MATRIX_EVIDENCE_INCOMPLETE_OR_NOT_CLEAN/);
  assert.match(postgres, /LOGICAL_RESTORE_EVIDENCE_INCOMPLETE_OR_SCOPE_MISMATCH/);
  assert.match(postgres, /DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI/);
});
