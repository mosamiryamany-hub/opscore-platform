#!/usr/bin/env node
'use strict';

/**
 * Create a commit-bound, temporary Neon branch clone and compare selected table
 * counts in the explicitly configured application database. Only the exact branch
 * created by this invocation is deleted and verified absent before evidence passes.
 * This is not a PITR restore test or row-content integrity proof.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readProductionDeploymentIdentity } = require('./lib/production-deployment-identity');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'docs', 'verification', 'PRODUCTION_RECOVERY_POINT.json');

function sourceCommit() {
  return String(process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
}
async function neon(pathname, opts = {}) {
  const key = String(process.env.NEON_API_KEY || '').trim();
  if (!key) throw new Error('NEON_API_KEY_REQUIRED');
  const response = await fetch('https://console.neon.tech/api/v2' + pathname, {
    method: opts.method || 'GET',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', accept: 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error('NEON_API_' + response.status);
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error('NEON_API_RESPONSE_INVALID'); }
}
async function connectionUri(projectId, branchId, database, role) {
  const query = new URLSearchParams({ branch_id: branchId, database_name: database, role_name: role, pooled: 'false' });
  const data = await neon('/projects/' + encodeURIComponent(projectId) + '/connection_uri?' + query.toString());
  if (!data.uri) throw new Error('NEON_CONNECTION_URI_MISSING');
  let parsed;
  try { parsed = new URL(data.uri); } catch { throw new Error('NEON_CONNECTION_URI_INVALID'); }
  if (parsed.hostname.toLowerCase().includes('-pooler.')) throw new Error('NEON_DIRECT_CONNECTION_REQUIRED');
  return data.uri;
}
function psql(uri, sql) {
  return execFileSync('psql', [uri, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  }).trim();
}
async function listBranches(projectId) {
  const payload = await neon('/projects/' + encodeURIComponent(projectId) + '/branches');
  return Array.isArray(payload.branches) ? payload.branches : [];
}

async function deleteTemporaryRecoveryBranch(projectId, branchId, parentBranchId, expectedName) {
  if (!/^br-[a-z0-9-]{8,80}$/.test(String(branchId || ''))) {
    throw new Error('RECOVERY_BRANCH_ID_INVALID_FOR_CLEANUP');
  }
  const branches = await listBranches(projectId);
  const existing = branches.find(branch => String(branch.id || '') === branchId);
  if (!existing) {
    return { status: 'PASS', recoveryBranchDeleted: true, branchAbsentBeforeCleanup: true };
  }
  if (String(existing.name || '') !== expectedName
      || String(existing.parent_id || '') !== parentBranchId
      || existing.primary === true
      || existing.default === true) {
    throw new Error('RECOVERY_BRANCH_CLEANUP_TARGET_NOT_EXACT_TEMPORARY_CHILD');
  }

  await neon('/projects/' + encodeURIComponent(projectId) + '/branches/' + encodeURIComponent(branchId), {
    method: 'DELETE'
  });

  let absent = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const afterDelete = await listBranches(projectId);
    if (!afterDelete.some(branch => String(branch.id || '') === branchId)) {
      absent = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!absent) throw new Error('RECOVERY_BRANCH_DELETE_NOT_VERIFIED');
  return { status: 'PASS', recoveryBranchDeleted: true, branchAbsentBeforeCleanup: false };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(outPath, body);
  fs.writeFileSync(outPath + '.sha256', crypto.createHash('sha256').update(body).digest('hex') + '  PRODUCTION_RECOVERY_POINT.json\n');
}

async function main() {
  const projectId = String(process.env.NEON_PROJECT_ID || '').trim();
  const parentBranchId = String(process.env.OPSC_PRODUCTION_NEON_BRANCH_ID || '').trim();
  const databaseName = String(process.env.OPSC_PRODUCTION_DATABASE_NAME || '').trim();
  const roleName = String(process.env.OPSC_PRODUCTION_OWNER_ROLE || 'neondb_owner').trim();
  const collectorCommit = sourceCommit();
  const collectorPipelineId = String(process.env.GITHUB_RUN_ID || '').trim();
  if (!/^[a-f0-9]{40}$/.test(collectorCommit)) throw new Error('COLLECTOR_SOURCE_COMMIT_SHA_REQUIRED');
  if (!/^[1-9][0-9]{0,14}$/.test(collectorPipelineId)) throw new Error('COLLECTOR_PIPELINE_ID_REQUIRED');
  if (!projectId || !parentBranchId || !databaseName) throw new Error('PRODUCTION_RECOVERY_TARGET_IDENTITY_REQUIRED');

  // The application database is explicitly selected. A different acceptance or
  // system database is never used as a fallback when this exact database is missing.
  const httpBase = String(process.env.OPSC_PRODUCTION_HTTP_BASE || 'https://opscore-platform.vercel.app').replace(/\/+$/, '');
  const deploymentIdentity = await readProductionDeploymentIdentity(
    httpBase,
    String(process.env.OPSC_EXPECTED_PRODUCTION_COMMIT_SHA || '')
  );
  const commit = deploymentIdentity.commitSha;
  const pipelineId = deploymentIdentity.ciPipelineId;
  const parentUri = await connectionUri(projectId, parentBranchId, databaseName, roleName);
  const sourceIdentity = psql(parentUri,
    "SELECT json_build_object('database',current_database(),'role',current_user,'server_version',current_setting('server_version'),'lsn',pg_current_wal_lsn()::text)::text;");
  const identity = JSON.parse(sourceIdentity);
  if (identity.database !== databaseName || identity.role !== roleName) throw new Error('PRODUCTION_RECOVERY_DATABASE_IDENTITY_MISMATCH');
  const parentLsn = String(identity.lsn || '');
  if (!parentLsn) throw new Error('PRODUCTION_RECOVERY_PARENT_LSN_MISSING');

  const listed = await neon('/projects/' + encodeURIComponent(projectId) + '/branches');
  const branches = Array.isArray(listed.branches) ? listed.branches : [];
  const limitRaw = Number(process.env.OPSC_NEON_BRANCH_LIMIT || 10);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) throw new Error('NEON_BRANCH_LIMIT_INVALID');
  const parentBranch = branches.find(branch => branch.id === parentBranchId);
  if (!parentBranch) throw new Error('PRODUCTION_PARENT_BRANCH_NOT_FOUND');
  if (parentBranch.current_state !== 'ready') throw new Error('PRODUCTION_PARENT_BRANCH_NOT_READY');
  if (branches.length >= limitRaw) {
    const blockedReport = {
      schemaVersion: 'opscore.production-recovery-point.v3',
      status: 'BLOCKED',
      testedAt: new Date().toISOString(),
      projectId,
      parentBranchId,
      databaseName,
      ownerRole: roleName,
      serverVersion: identity.server_version,
      parentLsn,
      branchCount: branches.length,
      branchLimit: limitRaw,
      verificationScope: 'branch-clone-public-table-count-and-core-tenant-row-counts-only',
      blockers: [{ code: 'NEON_BRANCH_CAPACITY_EXHAUSTED', detail: branches.length + '/' + limitRaw + '; no existing recovery branch was deleted' }],
      mismatchCount: null,
      sourceCommitHint: commit,
      pipelineId,
      deploymentId: deploymentIdentity.deploymentId,
      deploymentRef: deploymentIdentity.ref,
      deploymentIdentityObservedAt: deploymentIdentity.observedAt,
      collectorCommit,
      collectorPipelineId,
      evidenceClass: 'PRODUCTION_BRANCH_RECOVERY_POINT'
    };
    writeReport(blockedReport);
    process.stderr.write('PRODUCTION_RECOVERY_POINT_BLOCKED:NEON_BRANCH_CAPACITY_EXHAUSTED:' + branches.length + '/' + limitRaw + '\n');
    process.exitCode = 1;
    return;
  }

  const runId = String(process.env.GITHUB_RUN_ID).replace(/[^0-9]/g, '');
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').replace(/[^0-9]/g, '') || '1';
  const nonce = crypto.randomBytes(4).toString('hex');
  const recoveryBranchName = 'opscore-tmp-recovery-' + commit.slice(0, 12) + '-' + runId + '-' + runAttempt + '-' + nonce;
  const created = await neon('/projects/' + encodeURIComponent(projectId) + '/branches', {
    method: 'POST',
    body: { branch: { name: recoveryBranchName, parent_id: parentBranchId }, endpoints: [{ type: 'read_write' }] }
  });
  const recoveryBranchId = String(created.branch && created.branch.id || created.id || '');
  if (!/^br-[a-z0-9-]{8,80}$/.test(recoveryBranchId)) throw new Error('RECOVERY_BRANCH_CREATE_FAILED');

  let readyBranch = null;
  let tableCounts = {};
  let mismatches = [];
  let publicTableCount = null;
  let operationalError = null;
  let cleanup = { status: 'NOT_RUN', recoveryBranchDeleted: false };

  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      const snapshot = await neon('/projects/' + encodeURIComponent(projectId) + '/branches/' + encodeURIComponent(recoveryBranchId));
      const branch = snapshot.branch || snapshot;
      if (branch.current_state === 'ready') {
        readyBranch = branch;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!readyBranch) throw new Error('RECOVERY_BRANCH_READY_TIMEOUT');
    if (readyBranch.parent_id !== parentBranchId
        || readyBranch.name !== recoveryBranchName
        || readyBranch.primary === true
        || readyBranch.default === true) {
      throw new Error('RECOVERY_BRANCH_PARENT_OR_TEMPORARY_IDENTITY_MISMATCH');
    }

    const recoveryUri = await connectionUri(projectId, recoveryBranchId, databaseName, roleName);
    const coreTables = ['organizations', 'users', 'memberships', 'sessions', 'assets', 'sites', 'work_orders', 'customers'];
    for (const table of coreTables) {
      const parentCount = Number(psql(parentUri, 'SELECT count(*) FROM public.' + table + ';'));
      const recoveryCount = Number(psql(recoveryUri, 'SELECT count(*) FROM public.' + table + ';'));
      tableCounts[table] = { parent: parentCount, recovery: recoveryCount };
      if (parentCount !== recoveryCount) mismatches.push({ table, parent: parentCount, recovery: recoveryCount });
    }
    const parentPublicTables = Number(psql(parentUri,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"));
    const recoveryPublicTables = Number(psql(recoveryUri,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"));
    publicTableCount = parentPublicTables;
    if (parentPublicTables !== recoveryPublicTables) {
      mismatches.push({ table: '__public_table_count__', parent: parentPublicTables, recovery: recoveryPublicTables });
    }
    if (parentPublicTables < 130) throw new Error('RECOVERY_PUBLIC_TABLE_COUNT_BELOW_REQUIRED_BASELINE');
  } catch (error) {
    operationalError = String(error && (error.code || error.message) || 'RECOVERY_PROBE_FAILED')
      .replace(/[^A-Z0-9_:.-]/gi, '_').slice(0, 180);
  }

  try {
    cleanup = await deleteTemporaryRecoveryBranch(projectId, recoveryBranchId, parentBranchId, recoveryBranchName);
  } catch (error) {
    cleanup = {
      status: 'FAIL',
      recoveryBranchDeleted: false,
      reasonCode: String(error && (error.code || error.message) || 'RECOVERY_BRANCH_CLEANUP_FAILED')
        .replace(/[^A-Z0-9_:.-]/gi, '_').slice(0, 180)
    };
  }

  const tableCountsMatch = !operationalError
    && mismatches.length === 0
    && Number.isSafeInteger(publicTableCount)
    && publicTableCount >= 130;
  const status = tableCountsMatch && cleanup.status === 'PASS' && cleanup.recoveryBranchDeleted === true
    ? 'PASS' : 'FAIL';
  const report = {
    schemaVersion: 'opscore.production-recovery-point.v3',
    status,
    testedAt: new Date().toISOString(),
    projectId,
    parentBranchId,
    databaseName,
    ownerRole: roleName,
    serverVersion: identity.server_version,
    recoveryBranchId,
    recoveryBranchName,
    temporaryBranch: true,
    parentLsn,
    tableCountCompared: publicTableCount,
    coreTenantTableRowCountsMatch: tableCountsMatch,
    verificationScope: 'branch-clone-public-table-count-and-core-tenant-row-counts-only',
    mismatchCount: mismatches.length,
    mismatches,
    tableCounts,
    cleanup,
    ...(operationalError ? { failureCode: operationalError } : {}),
    note: 'This is a temporary branch-clone and row-count comparison for the explicitly configured application database only. The exact child branch created by this run is deleted and its absence verified before PASS. It does not compare row contents, certify PITR, or establish RPO/RTO. No pre-existing branch is deleted. A full restore drill remains separate.',
    sourceCommitHint: commit,
    pipelineId,
    deploymentId: deploymentIdentity.deploymentId,
    deploymentRef: deploymentIdentity.ref,
    deploymentIdentitySource: deploymentIdentity.sourceCommitIdentitySource,
    deploymentIdentityObservedAt: deploymentIdentity.observedAt,
    collectorCommit,
    collectorPipelineId,
    evidenceClass: 'PRODUCTION_BRANCH_RECOVERY_POINT'
  };
  writeReport(report);
  process.stdout.write(JSON.stringify({
    status: report.status,
    databaseName,
    recoveryBranchId,
    recoveryBranchName,
    tableCountCompared: publicTableCount,
    mismatchCount: mismatches.length,
    cleanup,
    verificationScope: report.verificationScope,
    sourceCommitHint: commit
  }) + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch(error => {
  console.error('PRODUCTION_RECOVERY_POINT_FAILED', String(error && (error.code || error.message) || error).slice(0, 300));
  process.exit(1);
});
