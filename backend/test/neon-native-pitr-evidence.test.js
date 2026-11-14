'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const evidencePath = path.join(
  repositoryRoot,
  'docs',
  'verification',
  'NEON_NATIVE_PITR_CANARY_RESULT.json'
);
const sidecarPath = evidencePath + '.sha256';

function readEvidence() {
  return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
}

test('Neon native PITR canary evidence is explicitly limited to a disposable free PostgreSQL 18 project', () => {
  const evidence = readEvidence();

  assert.equal(evidence.schemaVersion, 'opscore.neon-native-pitr-canary.v1');
  assert.equal(evidence.status, 'PASS_TEST_SCOPE');
  assert.equal(evidence.evidenceScope, 'DISPOSABLE_NEON_FREE_CANARY_POSTGRESQL_18');
  assert.equal(evidence.project.production, false);
  assert.match(evidence.project.name, /canary/i);
  assert.equal(evidence.project.subscriptionType, 'free_v3');
  assert.equal(evidence.project.postgresMajorVersion, 18);
  assert.equal(evidence.project.historyRetentionSeconds, 21600);
  assert.equal(evidence.project.defaultCompute.minCu, 0.25);
  assert.equal(evidence.project.defaultCompute.maxCu, 0.25);
  assert.equal(evidence.project.defaultCompute.suspendTimeoutSeconds, 0);
});

test('native restore evidence binds the same root branch to its own historical timestamp', () => {
  const evidence = readEvidence();
  const restore = evidence.restore;

  assert.equal(restore.mechanism, 'NEON_INSTANT_RESTORE_FROM_HISTORY');
  assert.equal(restore.snapshotRestoreUsed, false);
  assert.equal(restore.targetBranch.nativePitrEligibleBeforeRestore, true);
  assert.equal(restore.sourceBranchId, restore.targetBranch.id);
  assert.equal(restore.targetTimestampUtc, '2026-11-14T07:51:00Z');
  assert.match(restore.consoleSuccessBanner, /successfully restored to their state on 2026-11-14T07:51:00\.000Z/);
});

test('Time Travel Assist and post-restore main state contain only the pre-restore baseline marker', () => {
  const evidence = readEvidence();
  const baseline = evidence.markers.baseline;
  const postBaseline = evidence.markers.postBaseline;
  const target = Date.parse(evidence.restore.targetTimestampUtc);
  const baselineTime = Date.parse(baseline.writtenAtUtc);
  const postBaselineTime = Date.parse(postBaseline.writtenAtUtc);

  assert.ok(baselineTime < target, 'baseline must exist before the restore point');
  assert.ok(postBaselineTime > target, 'post-baseline marker must be later than the restore point');

  const timeTravel = evidence.checks.timeTravelAssistBeforeRestore;
  assert.equal(timeTravel.status, 'PASS');
  assert.equal(timeTravel.readOnly, true);
  assert.equal(timeTravel.timestampUtc, evidence.restore.targetTimestampUtc);
  assert.deepEqual(timeTravel.rows.map(row => row.marker), [baseline.marker]);
  assert.equal(timeTravel.postBaselineMarkerAbsent, true);

  const restoredMain = evidence.checks.restoredMainState;
  assert.equal(restoredMain.status, 'PASS');
  assert.deepEqual(restoredMain.rows.map(row => row.marker), [baseline.marker]);
  assert.equal(restoredMain.postBaselineMarkerAbsent, true);
});

test('Neon automatically retained the pre-restore state in a separate backup branch', () => {
  const evidence = readEvidence();
  const baseline = evidence.markers.baseline;
  const postBaseline = evidence.markers.postBaseline;
  const backup = evidence.checks.automaticPreRestoreBackup;

  assert.equal(backup.status, 'PASS');
  assert.match(backup.branchName, /^main_old_/);
  assert.notEqual(backup.branchId, evidence.restore.targetBranch.id);
  assert.equal(backup.state, 'ready');
  assert.deepEqual(backup.rows.map(row => row.marker), [baseline.marker, postBaseline.marker]);
  assert.equal(backup.postBaselineMarkerPreserved, true);
  assert.equal(evidence.cleanup.restoreBackupBranchRetained, true);
});

test('canary evidence cannot promote production Neon PITR or production isolation certification', () => {
  const evidence = readEvidence();
  assert.equal(evidence.productionGateDisposition.neonPointInTimeRecovery, 'NOT_VERIFIED');
  assert.equal(evidence.productionGateDisposition.productionIsolationCertification, 'NOT_CERTIFIED');
  assert.equal(evidence.productionGateDisposition.productionCertification, false);
  assert.ok(evidence.limitations.some(item => /does not prove PITR execution.*production Neon project/i.test(item)));
});

test('Neon native PITR evidence SHA-256 sidecar matches the exact committed JSON bytes', () => {
  const raw = fs.readFileSync(evidencePath);
  const sidecar = fs.readFileSync(sidecarPath, 'utf8');
  const match = /^([a-f0-9]{64})  NEON_NATIVE_PITR_CANARY_RESULT\.json\n$/.exec(sidecar);

  assert.ok(match, 'sidecar must use the canonical filename and SHA-256 format');
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), match[1]);
});
