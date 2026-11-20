'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readProductionNativePitrEvidence } = require('../src/release-proof');

const SHA = 'bbbee88e34a9b7e1847571367904fa96a3166bcc';
const DIGEST = 'f'.repeat(64);
const env = {
  OPSC_RELEASE_CI_COMMIT: SHA,
  OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
  OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-current-production',
  OPSC_PRODUCTION_DATABASE_NAME: 'opscore_acceptance',
  OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_ProductionFixture123'
};

function validEvidence(overrides = {}) {
  const evidence = {
    schemaVersion: 'opscore.production-native-pitr.v2',
    status: 'PASS',
    environment: 'production',
    mechanism: 'NEON_INSTANT_RESTORE_FROM_HISTORY',
    dataIntegrity: 'PASS',
    verificationScope: 'production-root-historical-branch-full-data-content-hash-and-rls-match',
    targetTimestampUtc: '2026-11-20T20:05:07Z',
    restoreStartedAt: '2026-11-20T20:07:00Z',
    restoreCompletedAt: '2026-11-20T20:10:47Z',
    restoreDurationMs: 227000,
    targetPointAgeAtCompletionMs: 340000,
    restoredBranchId: 'br-restored-production-probe',
    comparisonBranchId: 'br-comparison-production-clone',
    sourceBranchId: 'br-current-production',
    databaseName: 'opscore_acceptance',
    deploymentId: 'dpl_ProductionFixture123',
    sourceCommit: SHA,
    pipelineId: '2978538209',
    cleanup: {
      status: 'PASS',
      restoredBranchDeleted: true,
      comparisonBranchDeleted: true
    },
    contentIntegrity: {
      status: 'PASS',
      algorithm: 'SHA-256',
      tableCountCompared: 135,
      catalogTableCount: 136,
      rowsCompared: 135,
      mismatchCount: 0,
      rlsPolicyTableCount: 135,
      rlsPolicyMismatchCount: 0,
      forceRlsMismatchCount: 0,
      rlsExceptionTables: ['spatial_ref_sys'],
      sourceManifestSha256: DIGEST,
      restoredManifestSha256: DIGEST,
      tableResults: Array.from({ length: 135 }, (_, index) => ({
        schema: 'public',
        table: ['organizations','users','memberships','sessions','assets','sites','work_orders','customers'][index]
          || 'table_' + index,
        status: 'PASS',
        sourceSha256: DIGEST,
        restoredSha256: DIGEST,
        sourceRowCount: 1,
        restoredRowCount: 1
      }))
    }
  };
  const merged = { ...evidence, ...overrides };
  delete merged.evidenceSha256;
  merged.evidenceSha256 = crypto.createHash('sha256')
    .update(JSON.stringify(merged), 'utf8')
    .digest('hex');
  return merged;
}

function withEvidence(evidence, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-native-pitr-release-gate-'));
  const file = path.join(dir, 'native-pitr.json');
  try {
    fs.writeFileSync(file, JSON.stringify(evidence));
    callback(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('native Production PITR requires exact commit, pipeline, database, branch and full-data digest evidence', () => {
  withEvidence(validEvidence(), file => {
    const result = readProductionNativePitrEvidence(file, env);
    assert.equal(result.status, 'PASS');
    assert.equal(result.verificationScope, 'production-root-historical-branch-full-data-content-hash-and-rls-match');
    assert.equal(result.contentIntegrity.manifestMatched, true);
  });
});

test('native PITR refuses PASS if either exact temporary branch is not deleted', () => {
  withEvidence(validEvidence({
    cleanup: {
      status: 'FAIL',
      restoredBranchDeleted: true,
      comparisonBranchDeleted: false
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR measured recovery duration and point-age must match timestamps', () => {
  withEvidence(validEvidence({ restoreDurationMs: 1000 }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
  withEvidence(validEvidence({ targetPointAgeAtCompletionMs: 1 }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR requires exactly the declared non-tenant spatial_ref_sys RLS exception', () => {
  withEvidence(validEvidence({
    contentIntegrity: {
      ...validEvidence().contentIntegrity,
      rlsExceptionTables: ['users']
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR evidence digest detects content mutation after measurement', () => {
  withEvidence(validEvidence(), file => {
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
    evidence.contentIntegrity.rowsCompared += 1;
    fs.writeFileSync(file, JSON.stringify(evidence));
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('legacy schema/catalog-only native PITR evidence cannot satisfy the Production gate', () => {
  withEvidence(validEvidence({
    schemaVersion: 'opscore.production-native-pitr.v1',
    verificationScope: 'production-root-historical-branch-schema-catalog-match-read-only',
    contentIntegrity: undefined
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR rejects a per-table data hash mismatch or duplicate table entry', () => {
  const validTables = validEvidence().contentIntegrity.tableResults;
  withEvidence(validEvidence({
    contentIntegrity: {
      ...validEvidence().contentIntegrity,
      tableResults: validTables.map((row, index) => index === 0
        ? { ...row, restoredSha256: '0'.repeat(64) }
        : row)
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
  withEvidence(validEvidence({
    contentIntegrity: {
      ...validEvidence().contentIntegrity,
      tableResults: [...validTables.slice(0, 134), validTables[0]]
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR RLS policy or FORCE RLS mismatch fails closed', () => {
  withEvidence(validEvidence({
    contentIntegrity: {
      ...validEvidence().contentIntegrity,
      rlsPolicyMismatchCount: 1
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR content manifest mismatch fails closed', () => {
  withEvidence(validEvidence({
    contentIntegrity: {
      ...validEvidence().contentIntegrity,
      restoredManifestSha256: '0'.repeat(64)
    }
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});

test('native PITR rejects wrong database, source branch, commit or pipeline', () => {
  withEvidence(validEvidence(), file => {
    assert.equal(readProductionNativePitrEvidence(file, { ...env, OPSC_PRODUCTION_DATABASE_NAME: 'other_database' }).status, 'NOT_VERIFIED');
    assert.equal(readProductionNativePitrEvidence(file, { ...env, OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-other-production' }).status, 'NOT_VERIFIED');
    assert.equal(readProductionNativePitrEvidence(file, { ...env, OPSC_RELEASE_CI_COMMIT: '0'.repeat(40) }).status, 'NOT_VERIFIED');
    assert.equal(readProductionNativePitrEvidence(file, { ...env, OPSC_RELEASE_CI_PIPELINE_ID: '1234567890' }).status, 'NOT_VERIFIED');
  });
});

test('native PITR rejects incomplete or reversed restore timestamps', () => {
  withEvidence(validEvidence({
    restoreCompletedAt: '2026-11-20T20:06:59Z'
  }), file => {
    assert.equal(readProductionNativePitrEvidence(file, env).status, 'NOT_VERIFIED');
  });
});
