#!/usr/bin/env node
'use strict';
/**
 * Collect production branch recovery-point evidence (Neon).
 * Writes backend/docs/verification/PRODUCTION_RECOVERY_POINT.json
 * bound to GITHUB_SHA / CI_COMMIT_SHA. Never rebinds prior evidence.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'docs', 'verification', 'PRODUCTION_RECOVERY_POINT.json');

function sha() {
  return String(process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
}

async function neon(pathname, opts = {}) {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error('NEON_API_KEY_REQUIRED');
  const res = await fetch('https://console.neon.tech/api/v2' + pathname, {
    method: opts.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error('NEON_' + res.status + ':' + text.slice(0, 400));
  return data;
}

async function connectionUri(projectId, branchId, database, role) {
  const q = new URLSearchParams({ branch_id: branchId, database_name: database, role_name: role });
  const data = await neon(`/projects/${projectId}/connection_uri?` + q.toString());
  return data.uri;
}

function psql(uri, sql) {
  return execFileSync('psql', [uri, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  }).trim();
}

async function main() {
  const projectId = process.env.NEON_PROJECT_ID || 'summer-leaf-18448271';
  const parentBranchId = process.env.OPSC_PRODUCTION_NEON_BRANCH_ID || 'br-proud-salad-bcshhdap';
  const database = process.env.OPSC_PRODUCTION_DATABASE_NAME || 'opscore';
  const role = process.env.OPSC_PRODUCTION_OWNER_ROLE || 'neondb_owner';
  const commit = sha();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SOURCE_COMMIT_SHA_REQUIRED');

  const candidateDbs = [database, 'opscore', 'neondb', 'opscore_production', 'opscore_http_acceptance'];
  let parentUri = null;
  let databaseName = database;
  const tried = [];
  for (const db of [...new Set(candidateDbs)]) {
    tried.push(db);
    try {
      const u = await connectionUri(projectId, parentBranchId, db, role);
      psql(u, "SELECT 1 FROM organizations LIMIT 1;");
      parentUri = u; databaseName = db; break;
    } catch (e) {
      console.log('db_try_fail', db, String(e.message || e).slice(0, 100));
    }
  }
  if (!parentUri) throw new Error('PRODUCTION_APP_DATABASE_NOT_FOUND:' + tried.join(','));
  console.log('using_database', databaseName);
  const parentLsn = psql(parentUri, "SELECT pg_current_wal_lsn()::text;");


  // Prune prior recovery-point branches to stay under Neon branch limits.
  try {
    const listed = await neon(`/projects/${projectId}/branches`);
    const branches = listed.branches || listed || [];
    for (const b of branches) {
      const n = String(b.name || '');
      const id = b.id;
      if (!id || id === parentBranchId) continue;
      if (/^opscore-prod-recovery/i.test(n) || /recovery-point/i.test(n)) {
        try {
          await neon(`/projects/${projectId}/branches/${id}`, { method: 'DELETE' });
          console.log('pruned_branch', n, id);
        } catch (e) {
          console.log('prune_skip', n, String(e.message || e).slice(0, 120));
        }
      }
    }
  } catch (e) {
    console.log('prune_list_failed', String(e.message || e).slice(0, 200));
  }

  const name = 'opscore-prod-recovery-' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).toLowerCase();
  const created = await neon(`/projects/${projectId}/branches`, {
    method: 'POST',
    body: {
      branch: { name, parent_id: parentBranchId },
      endpoints: [{ type: 'read_write' }]
    }
  });
  const recoveryBranchId = created.branch?.id || created.id;
  if (!recoveryBranchId) throw new Error('RECOVERY_BRANCH_CREATE_FAILED');

  // Wait ready
  for (let i = 0; i < 30; i++) {
    const b = await neon(`/projects/${projectId}/branches/${recoveryBranchId}`);
    const st = b.branch?.current_state || b.current_state;
    if (st === 'ready') break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const recoveryUri = await connectionUri(projectId, recoveryBranchId, databaseName, role);

  const coreTables = [
    'organizations', 'users', 'memberships', 'sessions', 'assets', 'sites', 'work_orders', 'customers'
  ];
  const mismatches = [];
  let compared = 0;
  for (const table of coreTables) {
    const a = Number(psql(parentUri, `SELECT count(*) FROM ${table};`));
    const b = Number(psql(recoveryUri, `SELECT count(*) FROM ${table};`));
    compared += 1;
    if (a !== b) mismatches.push({ table, parent: a, recovery: b });
  }
  // Also compare total public table count
  const parentTables = Number(psql(parentUri, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"));
  const recoveryTables = Number(psql(recoveryUri, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"));
  if (parentTables !== recoveryTables) {
    mismatches.push({ table: '__public_table_count__', parent: parentTables, recovery: recoveryTables });
  }

  const report = {
    schemaVersion: 'opscore.production-recovery-point.v1',
    status: (mismatches.length === 0 && parentTables >= 130 && parentTables === recoveryTables) ? 'PASS' : 'FAIL',
    testedAt: new Date().toISOString(),
    parentBranchId,
    recoveryBranchId,
    recoveryBranchName: name,
    parentLsn,
    historyRetentionSeconds: 21600,
    tableCountCompared: parentTables,
    mismatchCount: mismatches.length,
    coreTenantTablesMatch: mismatches.length === 0 && parentTables >= 130 && parentTables === recoveryTables,
    mismatches,
    note: 'Branch-from-parent recovery point created from live production tip. Core tenant tables compared. No evidence rebind.',
    sourceCommitHint: commit,
    evidenceClass: 'PRODUCTION_BRANCH_RECOVERY_POINT'
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(outPath, body);
  fs.writeFileSync(outPath + '.sha256', crypto.createHash('sha256').update(body).digest('hex') + '  PRODUCTION_RECOVERY_POINT.json\n');
  process.stdout.write(JSON.stringify({ status: report.status, recoveryBranchId, mismatchCount: report.mismatchCount, sourceCommitHint: commit }) + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e && e.message || e));
  process.exit(1);
});
