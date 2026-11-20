'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const collectorPath = path.join(root, 'scripts', 'collect-production-recovery-point.js');
const collector = fs.readFileSync(collectorPath, 'utf8');
const releaseProof = fs.readFileSync(path.join(root, 'src', 'release-proof.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'collect-production-isolation-evidence.yml'), 'utf8');

test('collector binds the exact Production deployment, root branch, database, role, commit and pipeline', () => {
  assert.match(collector, /OPSC_PRODUCTION_DATABASE_NAME/);
  assert.match(collector, /OPSC_PRODUCTION_NEON_BRANCH_ID/);
  assert.match(collector, /OPSC_EXPECTED_PRODUCTION_COMMIT_SHA/);
  assert.match(collector, /deploymentIdentity\.deploymentId/);
  assert.match(collector, /readProductionDeploymentIdentity/);
  assert.match(collector, /PRODUCTION_RECOVERY_DATABASE_IDENTITY_MISMATCH/);
  assert.match(collector, /PRODUCTION_DEPLOYMENT_IDENTITY_NOT_EXACT/);
  assert.match(collector, /COLLECTOR_PIPELINE_ID_REQUIRED/);
  assert.doesNotMatch(collector, /candidateDbs/);
  assert.doesNotMatch(collector, /db_try_fail/);
});

test('native PITR uses two independent timestamped sibling branches from the exact Production root', () => {
  assert.match(collector, /parent_timestamp/);
  assert.match(collector, /OPSC_PRODUCTION_PITR_LOOKBACK_SECONDS/);
  assert.match(collector, /createTemporaryBranch\(projectId, reference\.name, parentBranchId, targetTimestampUtc\)/);
  assert.match(collector, /createTemporaryBranch\(projectId, recovery\.name, parentBranchId, targetTimestampUtc\)/);
  assert.match(collector, /const recovery = \{ id: null, name: prefix \+ '-clone', parentBranchId \}/);
  assert.doesNotMatch(collector, /recovery\.parentBranchId = reference\.id/);
  assert.match(collector, /endpoints: \[\{ type: 'read_write' \}\]/);
  assert.match(collector, /TEMPORARY_BRANCH_IDENTITY_MISMATCH/);
  assert.match(collector, /branches\.length \+ 2 > limit/);
  assert.match(collector, /NEON_BRANCH_CAPACITY_INSUFFICIENT/);
});

test('all SQL probes run in explicit read-only transactions, including streamed COPY', () => {
  assert.match(collector, /default_transaction_read_only=on/);
  assert.match(collector, /BEGIN TRANSACTION READ ONLY/);
  assert.match(collector, /\\) TO STDOUT;/);
  assert.match(collector, /'COMMIT;'/);
});

test('every physical public table is content-hashed with duplicate-preserving deterministic row hashes', () => {
  assert.match(collector, /COPY \(/);
  assert.match(collector, /pg_catalog\.to_jsonb\(t\)::text/);
  assert.match(collector, /public\.digest/);
  assert.match(collector, /ORDER BY 1/);
  assert.match(collector, /const physicalTableNames = referenceCatalog\.tables/);
  assert.match(collector, /filter\(row => row\.relation_kind === 'r'\)/);
  assert.match(collector, /for \(let index = 0; index < physicalTableNames\.length; index\+\+\)/);
  assert.match(collector, /sourceData\.sha256 === restoredData\.sha256/);
  assert.match(collector, /sourceData\.rowCount === restoredData\.rowCount/);
  assert.match(collector, /c\.relkind IN \('r','p'\)/);
  assert.match(collector, /Partitioned parents/);
  assert.match(collector, /physical leaf partitions/);
  assert.match(collector, /RECOVERY_PHYSICAL_TABLE_COUNT_BELOW_REQUIRED_BASELINE/);
});

test('catalog and RLS evidence compares every public table/partition and makes the sole exception explicit', () => {
  assert.match(collector, /pg_catalog\.pg_class/);
  assert.match(collector, /pg_catalog\.pg_policies/);
  assert.match(collector, /relrowsecurity/);
  assert.match(collector, /relforcerowsecurity/);
  assert.match(collector, /allowedRlsExceptions = \['spatial_ref_sys'\]/);
  assert.match(collector, /rlsExceptionsExact/);
  assert.match(collector, /rlsPolicyMismatchCount/);
  assert.match(collector, /forceRlsMismatchCount/);
  assert.match(collector, /catalogTableCount/);
  assert.match(collector, /rlsExceptionTables/);
});

test('recovery and PITR evidence are both v2/v4, source-bound, content-bound and cleanup-bound', () => {
  assert.match(collector, /opscore\.production-recovery-point\.v4/);
  assert.match(collector, /opscore\.production-native-pitr\.v2/);
  assert.match(collector, /sourceManifestSha256/);
  assert.match(collector, /recoveryManifestSha256/);
  assert.match(collector, /restoredManifestSha256/);
  assert.match(collector, /evidenceSha256/);
  assert.match(collector, /restoreDurationMs/);
  assert.match(collector, /targetPointAgeAtCompletionMs/);
  assert.match(collector, /comparisonBranchDeleted/);
  assert.match(collector, /restoredBranchDeleted/);
  assert.match(releaseProof, /PASS_PRODUCTION_FULL_DATA_RECOVERY_SCOPE/);
  assert.match(releaseProof, /PASS_PRODUCTION_FULL_DATA_PITR_SCOPE/);
  assert.match(releaseProof, /pitrCleanupVerified/);
  assert.match(releaseProof, /recoveryRlsExceptionsExact/);
  assert.match(releaseProof, /pitrRlsExceptionsExact/);
});

test('capacity and probe failure never prune or delete any pre-existing branch', () => {
  assert.match(collector, /NEON_BRANCH_CAPACITY_INSUFFICIENT/);
  assert.match(collector, /Only the two exact branches created by this invocation may be deleted/);
  assert.match(collector, /CLEANUP_TARGET_NOT_EXACT_UNPROTECTED_TEMPORARY_CHILD/);
  assert.match(collector, /TEMPORARY_BRANCH_DELETE_NOT_VERIFIED/);
  assert.match(collector, /if \(recoveryCreated\)/);
  assert.match(collector, /if \(referenceCreated\)/);
  assert.doesNotMatch(collector, /prune_ephemeral/);
  assert.doesNotMatch(collector, /pruned_branch/);
});

test('manual workflow requires explicit production-probe authorization and uploads both evidence records', () => {
  assert.match(workflow, /confirm_production_probe/);
  assert.match(workflow, /I_AUTHORIZE_PRODUCTION_EVIDENCE_PROBES/);
  assert.match(workflow, /expected_production_deployment_id/);
  assert.match(workflow, /OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID/);
  assert.doesNotMatch(workflow, /OPSC_EVIDENCE_ALLOW_MISSING_DEPLOYMENT_ID/);
  assert.match(workflow, /DO_NOT_RUN/);
  assert.match(workflow, /if: github\.event\.inputs\.confirm_production_probe == 'I_AUTHORIZE_PRODUCTION_EVIDENCE_PROBES'/);
  assert.match(workflow, /node backend\/scripts\/collect-production-recovery-point\.js/);
  assert.match(workflow, /PRODUCTION_RECOVERY_POINT\.json/);
  assert.match(workflow, /PRODUCTION_NATIVE_PITR_EVIDENCE\.json/);
  assert.match(workflow, /PRODUCTION_NATIVE_PITR_EVIDENCE\.json\.sha256/);
  assert.doesNotMatch(workflow, /MODE=prune_ephemeral/);
});

test('the collector does not claim that content equality by itself certifies application recovery or RPO/RTO', () => {
  assert.match(collector, /not an application-level recovery rehearsal or an RPO\/RTO guarantee/);
  assert.match(collector, /RPO\/RTO guarantee/);
});

test('recovery collector parses as a Node.js program', () => {
  const result = spawnSync(process.execPath, ['--check', collectorPath], {
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
