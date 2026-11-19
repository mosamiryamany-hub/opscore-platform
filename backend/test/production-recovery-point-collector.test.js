'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const collector = fs.readFileSync(path.join(root, 'scripts', 'collect-production-recovery-point.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'vercel-deploy.yml'), 'utf8');
const releaseProof = fs.readFileSync(path.join(root, 'src', 'release-proof.js'), 'utf8');
const evidenceWorkflow = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'collect-production-isolation-evidence.yml'), 'utf8');

test('production recovery selects one explicit application database and never falls back to another database', () => {
  assert.match(collector, /OPSC_PRODUCTION_DATABASE_NAME/);
  assert.match(collector, /connectionUri\(projectId, parentBranchId, databaseName, roleName\)/);
  assert.doesNotMatch(collector, /candidateDbs/);
  assert.doesNotMatch(collector, /db_try_fail/);
  assert.match(collector, /PRODUCTION_RECOVERY_DATABASE_IDENTITY_MISMATCH/);
  assert.match(workflow, /OPSC_PRODUCTION_DATABASE_NAME: opscore_acceptance/);
  assert.match(evidenceWorkflow, /OPSC_PRODUCTION_DATABASE_NAME: \$\{\{ inputs\.production_database_name \}\}/);
  assert.match(evidenceWorkflow, /I_AUTHORIZE_PRODUCTION_EVIDENCE_PROBES/);
});

test('recovery collector deletes only its exact temporary child branch and verifies absence', () => {
  assert.match(collector, /NEON_BRANCH_CAPACITY_EXHAUSTED/);
  assert.match(collector, /async function deleteTemporaryRecoveryBranch/);
  assert.match(collector, /String\(existing\.name \|\| ''\) !== expectedName/);
  assert.match(collector, /String\(existing\.parent_id \|\| ''\) !== parentBranchId/);
  assert.match(collector, /existing\.primary === true/);
  assert.match(collector, /existing\.default === true/);
  assert.match(collector, /method: 'DELETE'/);
  assert.match(collector, /RECOVERY_BRANCH_DELETE_NOT_VERIFIED/);
  assert.match(collector, /recoveryBranchDeleted: true/);
  assert.match(collector, /temporaryBranch: true/);
  assert.match(collector, /no pre-existing branch is deleted/i);
  assert.doesNotMatch(collector, /pruned_branch/);
});

test('recovery evidence declares its row-count-only scope and does not claim PITR or content equality', () => {
  assert.match(collector, /coreTenantTableRowCountsMatch/);
  assert.match(collector, /branch-clone-public-table-count-and-core-tenant-row-counts-only/);
  assert.match(collector, /does not compare row contents, certify PITR, or establish RPO\/RTO/);
  assert.match(collector, /opscore.production-recovery-point.v3/);
});

test('release certification requires the exact application database and explicit recovery scope', () => {
  assert.match(releaseProof, /evidence.schemaVersion === 'opscore.production-recovery-point.v3'/);
  assert.match(releaseProof, /evidence.databaseName === expectedDatabaseName/);
  assert.match(releaseProof, /evidence.coreTenantTableRowCountsMatch === true/);
  assert.match(releaseProof, /branch-clone-public-table-count-and-core-tenant-row-counts-only/);
  assert.match(releaseProof, /deploymentIdBound/);
  assert.match(releaseProof, /evidence\.temporaryBranch === true/);
  assert.match(releaseProof, /evidence\.cleanup\.recoveryBranchDeleted === true/);
});


test('recovery collector parses as a Node.js program', () => {
  const file = path.join(root, 'scripts', 'collect-production-recovery-point.js');
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('recovery collector requires the parent branch to exist and be ready', () => {
  assert.match(collector, /const parentBranch = branches\.find/);
  assert.match(collector, /PRODUCTION_PARENT_BRANCH_NOT_FOUND/);
  assert.match(collector, /PRODUCTION_PARENT_BRANCH_NOT_READY/);
});
