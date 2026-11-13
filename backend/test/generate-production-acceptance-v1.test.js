'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  validateTenantMatrixEnvelope,
  validateRestoreDrillEnvelope,
  verifyRouteInventory
} = require('../scripts/generate-production-acceptance-v1');

const script = path.join(__dirname, '..', 'scripts', 'generate-production-acceptance-v1.js');
const commit = 'a'.repeat(40);
const pipelineId = '43496152530';

function tenantMatrixEnvelope(overrides = {}) {
  const evidence = {
    schemaVersion: 'opscore.tenant-isolation-matrix.v1',
    sourceCommit: commit,
    status: 'PASS',
    productionCertification: false,
    isolationCertification: 'NOT_CERTIFIED',
    fullEvidenceSha256: 'b'.repeat(64),
    discovered: { totalRoutes: 30, tenantDataRoutes: 3, foreignIdRoutes: 3 },
    tested: {
      unauthenticated: { checks: 3, pass: 3, fail: 0 },
      foreignIdProbe: { checks: 3, pass: 3, fail: 0 },
      crossTenantFixture: { checks: 5, pass: 5, fail: 0 }
    },
    skippedCount: 0,
    cleanupErrorsCount: 0,
    ...overrides
  };
  return {
    schemaVersion: 'opscore.caller-bound-ci-evidence.v1',
    evidenceType: 'tenant-matrix',
    binding: { commit, pipelineId, scope: 'DISPOSABLE_POSTGRESQL_18_CI' },
    evidence
  };
}

function restoreEnvelope(overrides = {}) {
  const evidence = {
    schemaVersion: 'opscore.postgres-logical-restore-drill.v1',
    status: 'PASS',
    evidenceClass: 'CI_DISPOSABLE_DATABASE_LOGICAL_RESTORE',
    productionCertification: false,
    ownershipAndAclRestored: false,
    verificationScope: 'DATA_SCHEMA_CATALOG_RLS_AND_TABLE_CONTENT',
    fullEvidenceSha256: 'c'.repeat(64),
    checks: [{ name: 'dump', status: 'PASS' }, { name: 'restore', status: 'PASS' }],
    cleanup: { status: 'PASS', errors: [] },
    archive: { bytes: 4096, sha256: 'd'.repeat(64) },
    tableCount: 22,
    limitations: ['This does not validate Neon point-in-time restore or production backup retention.'],
    ...overrides
  };
  return {
    schemaVersion: 'opscore.caller-bound-ci-evidence.v1',
    evidenceType: 'postgres-logical-restore',
    binding: { commit, pipelineId, scope: 'DISPOSABLE_POSTGRESQL_18_LOGICAL_RESTORE_CI' },
    evidence
  };
}

test('production acceptance generator is read-only against production and fails closed', () => {
  const src = fs.readFileSync(script, 'utf8');
  assert.match(src, /opscore\.production-acceptance\.v2/);
  assert.match(src, /failClosed: true/);
  assert.match(src, /writesProductionData: false/);
  assert.match(src, /BEGIN READ ONLY/);
  assert.match(src, /full source-to-ledger checksum parity/);
  assert.doesNotMatch(src, /NEON_API_KEY|console\.neon\.tech|DELETE FROM|INSERT INTO organizations/);
});

test('production acceptance does not run when live DB credentials and pipeline identity are absent', () => {
  const res = spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      OPSC_PRODUCTION_RUNTIME_URL: '',
      OPSC_DATABASE_URL: '',
      OPSC_OWNER_DATABASE_URL: '',
      GITHUB_SHA: '',
      GITHUB_RUN_ID: '',
      OPSC_WRITE_EVIDENCE: '0'
    },
    encoding: 'utf8'
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /PRODUCTION_RUNTIME_OWNER_COMMIT_PIPELINE_AND_ENVIRONMENT_REQUIRED/);
});

test('tenant matrix requires every tenant route, both authorization probes and verified cleanup', () => {
  const valid = validateTenantMatrixEnvelope(tenantMatrixEnvelope(), commit, pipelineId);
  assert.equal(valid.ok, true);
  assert.equal(valid.tenantDataRoutes, 3);
  assert.equal(valid.unauthenticatedChecks, 3);
  assert.equal(valid.foreignIdRoutes, 3);
  assert.equal(valid.foreignIdChecks, 3);
  assert.equal(valid.crossTenantChecks, 5);

  const incomplete = validateTenantMatrixEnvelope(
    tenantMatrixEnvelope({ skippedCount: 1 }), commit, pipelineId
  );
  assert.equal(incomplete.ok, false);
  const incompleteForeignId = validateTenantMatrixEnvelope(
    tenantMatrixEnvelope({ discovered: { totalRoutes: 30, tenantDataRoutes: 3, foreignIdRoutes: 2 } }),
    commit, pipelineId
  );
  assert.equal(incompleteForeignId.ok, false);

  const stale = validateTenantMatrixEnvelope(
    { ...tenantMatrixEnvelope(), binding: { ...tenantMatrixEnvelope().binding, pipelineId: '1' } },
    commit, pipelineId
  );
  assert.equal(stale.ok, false);
});

test('restore evidence requires a real archive, full check set, and successful cleanup', () => {
  assert.equal(validateRestoreDrillEnvelope(restoreEnvelope(), commit, pipelineId).ok, true);
  assert.equal(validateRestoreDrillEnvelope(
    restoreEnvelope({ cleanup: { status: 'FAIL', errors: ['fixture'] } }), commit, pipelineId
  ).ok, false);
  assert.equal(validateRestoreDrillEnvelope(
    restoreEnvelope({ evidenceClass: 'FRESH_BRANCH_CREATE_DELETE' }), commit, pipelineId
  ).ok, false);
});

test('API inventory integrity confirms the source-derived method/path inventory without HTTP status shortcuts', () => {
  const result = verifyRouteInventory();
  assert.equal(result.ok, true);
  assert.equal(result.declaredRoutes, result.sourceRoutes);
  assert.ok(result.sourceRoutes > 0);
});
