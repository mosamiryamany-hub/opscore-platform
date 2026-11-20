#!/usr/bin/env node
'use strict';

/**
 * Collect full-data recovery and native Neon PITR evidence without modifying
 * the Production root branch or deleting any pre-existing branch.
 *
 * Two independent temporary, read-only sibling branches are created from the
 * exact Production root branch at the same explicit historical timestamp. Their
 * full data, schema, and RLS manifests are compared independently.
 *
 * Every public base/partitioned root table is compared using a deterministic
 * SHA-256 stream of row hashes. Column catalogs, RLS/FORCE RLS flags and the
 * complete pg_policies inventory are compared as separate manifests.
 *
 * Only the two exact branches created by this invocation may be deleted.
 * A successful row-count-only or schema-only comparison is never emitted.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { readProductionDeploymentIdentity } = require('./lib/production-deployment-identity');

const root = path.resolve(__dirname, '..');
const recoveryPath = path.join(root, 'docs', 'verification', 'PRODUCTION_RECOVERY_POINT.json');
const pitrPath = path.join(root, 'docs', 'verification', 'PRODUCTION_NATIVE_PITR_EVIDENCE.json');

function sourceCommit() {
  return String(process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
}

function safeToken(value, pattern, code) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) throw new Error(code);
  return normalized;
}

async function neon(pathname, opts = {}) {
  const key = String(process.env.NEON_API_KEY || '').trim();
  if (!key) throw new Error('NEON_API_KEY_REQUIRED');
  const response = await fetch('https://console.neon.tech/api/v2' + pathname, {
    method: opts.method || 'GET',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', accept: 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('NEON_API_' + response.status);
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw new Error('NEON_API_RESPONSE_INVALID'); }
}

async function connectionUri(projectId, branchId, database, role) {
  const query = new URLSearchParams({
    branch_id: branchId,
    database_name: database,
    role_name: role,
    pooled: 'false'
  });
  const data = await neon('/projects/' + encodeURIComponent(projectId) + '/connection_uri?' + query.toString());
  if (!data.uri) throw new Error('NEON_CONNECTION_URI_MISSING');
  let parsed;
  try { parsed = new URL(data.uri); }
  catch { throw new Error('NEON_CONNECTION_URI_INVALID'); }
  if (parsed.hostname.toLowerCase().includes('-pooler.')) throw new Error('NEON_DIRECT_CONNECTION_REQUIRED');
  return data.uri;
}

function psqlEnv() {
  const env = { ...process.env };
  env.PGOPTIONS = [String(env.PGOPTIONS || '').trim(), '-c timezone=UTC'].filter(Boolean).join(' ');
  return env;
}

function psql(uri, sql) {
  return execFileSync('psql', [uri, '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], {
    encoding: 'utf8',
    env: psqlEnv(),
    maxBuffer: 32 * 1024 * 1024
  }).trim();
}

function psqlJson(uri, sql, code) {
  const raw = psql(uri, sql);
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error('NOT_ARRAY');
    return parsed;
  } catch {
    throw new Error(code || 'PSQL_JSON_RESULT_INVALID');
  }
}

function quoteIdentifier(value) {
  const name = String(value || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) throw new Error('DATABASE_IDENTIFIER_INVALID');
  return '"' + name.replace(/"/g, '""') + '"';
}

/**
 * Stream sorted SHA-256 row hashes from COPY STDOUT. The application process
 * never materializes full table contents; duplicate rows are preserved because
 * every row hash is included in the sorted stream.
 */
function streamTableDigest(uri, tableName) {
  const table = quoteIdentifier(tableName);
  const sql = [
    'COPY (',
    '  SELECT encode(public.digest(pg_catalog.convert_to(pg_catalog.to_jsonb(t)::text, \'UTF8\'), \'sha256\'), \'hex\')',
    '  FROM public.' + table + ' AS t',
    '  ORDER BY 1',
    ') TO STDOUT'
  ].join('\n');

  return new Promise((resolve, reject) => {
    const child = spawn('psql', [uri, '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], {
      env: psqlEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const digest = crypto.createHash('sha256');
    let pending = '';
    let rowCount = 0;
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        finish(new Error('PSQL_TABLE_DIGEST_TIMEOUT'));
      }
    }, 15 * 60 * 1000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    }

    function addLine(line) {
      const normalized = String(line || '').replace(/\r$/, '');
      if (!/^[a-f0-9]{64}$/.test(normalized)) {
        finish(new Error('PSQL_TABLE_DIGEST_OUTPUT_INVALID'));
        child.kill('SIGKILL');
        return;
      }
      digest.update(normalized + '\n', 'utf8');
      rowCount += 1;
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (settled) return;
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        addLine(line);
        if (settled) return;
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (stderr.length < 4096) stderr += chunk.slice(0, 4096 - stderr.length);
    });
    child.on('error', () => finish(new Error('PSQL_TABLE_DIGEST_PROCESS_ERROR')));
    child.on('close', code => {
      if (settled) return;
      if (pending.length) addLine(pending);
      if (settled) return;
      if (code !== 0) return finish(new Error('PSQL_TABLE_DIGEST_FAILED_' + String(code)));
      finish(null, { rowCount, sha256: digest.digest('hex') });
    });
  });
}

const TABLE_CATALOG_SQL = `
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.table_name), '[]'::json)::text
FROM (
  SELECT
    c.relname AS table_name,
    c.relkind AS relation_kind,
    c.relrowsecurity AS row_security_enabled,
    c.relforcerowsecurity AS force_row_security,
    COALESCE((
      SELECT json_agg(json_build_object(
        'column_name', a.attname,
        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull,
        'generated', a.attgenerated,
        'identity', a.attidentity
      ) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    ), '[]'::json) AS columns
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p')
  ORDER BY c.relname
) AS t;
`;

const POLICY_CATALOG_SQL = `
SELECT COALESCE(json_agg(row_to_json(p) ORDER BY p.tablename, p.policyname, p.cmd), '[]'::json)::text
FROM (
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname, cmd
) AS p;
`;

async function readCatalog(uri) {
  const tables = psqlJson(uri, TABLE_CATALOG_SQL, 'PUBLIC_TABLE_CATALOG_INVALID');
  const policies = psqlJson(uri, POLICY_CATALOG_SQL, 'PUBLIC_RLS_POLICY_CATALOG_INVALID');
  if (tables.length < 130) throw new Error('RECOVERY_PUBLIC_TABLE_COUNT_BELOW_REQUIRED_BASELINE');
  const names = new Set();
  for (const row of tables) {
    if (!row || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(String(row.table_name || '')) || names.has(row.table_name)) {
      throw new Error('PUBLIC_TABLE_CATALOG_DUPLICATE_OR_INVALID');
    }
    names.add(row.table_name);
  }
  return { tables, policies };
}

function manifestDigest(catalog) {
  return crypto.createHash('sha256').update(JSON.stringify({
    tables: catalog.tables,
    policies: catalog.policies
  }), 'utf8').digest('hex');
}

async function readFullDataManifest(uri, catalog) {
  const results = [];
  let rowsCompared = 0;
  // Hash physical base tables only. Partitioned parents are catalog/policy checked;
  // their physical leaf partitions are hashed separately, avoiding duplicate rows.
  const physicalTables = catalog.tables.filter(table => table.relation_kind === 'r');
  for (const table of physicalTables) {
    const result = await streamTableDigest(uri, table.table_name);
    if (!Number.isSafeInteger(result.rowCount) || !Number.isSafeInteger(rowsCompared + result.rowCount)) {
      throw new Error('RECOVERY_ROW_COUNT_OUT_OF_SAFE_RANGE');
    }
    rowsCompared += result.rowCount;
    results.push({
      schema: 'public',
      table: table.table_name,
      rowSecurityEnabled: table.row_security_enabled === true,
      forceRowSecurity: table.force_row_security === true,
      rowCount: result.rowCount,
      sha256: result.sha256
    });
  }
  return { results, rowsCompared };
}

async function listBranches(projectId) {
  const payload = await neon('/projects/' + encodeURIComponent(projectId) + '/branches');
  return Array.isArray(payload.branches) ? payload.branches : [];
}

async function createTemporaryBranch(projectId, name, parentBranchId, parentTimestamp = null) {
  const branch = { name, parent_id: parentBranchId };
  if (parentTimestamp) branch.parent_timestamp = parentTimestamp;
  const created = await neon('/projects/' + encodeURIComponent(projectId) + '/branches', {
    method: 'POST',
    body: { branch, endpoints: [{ type: 'read_only' }] }
  });
  const id = String(created.branch && created.branch.id || created.id || '');
  if (!/^br-[a-z0-9-]{8,80}$/.test(id)) throw new Error('TEMPORARY_BRANCH_CREATE_FAILED');
  return { id, name, parentBranchId };
}

async function waitForBranch(projectId, expected) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const payload = await neon('/projects/' + encodeURIComponent(projectId) + '/branches/' + encodeURIComponent(expected.id));
    const branch = payload.branch || payload;
    if (branch.current_state === 'ready') {
      if (String(branch.id || '') !== expected.id
          || String(branch.name || '') !== expected.name
          || String(branch.parent_id || '') !== expected.parentBranchId
          || branch.primary === true
          || branch.default === true) {
        throw new Error('TEMPORARY_BRANCH_IDENTITY_MISMATCH');
      }
      return branch;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('TEMPORARY_BRANCH_READY_TIMEOUT');
}

async function deleteTemporaryBranch(projectId, branch) {
  const branches = await listBranches(projectId);
  const existing = branches.find(item => String(item.id || '') === branch.id);
  if (!existing) return { status: 'PASS', deleted: true, absentBeforeCleanup: true };
  if (String(existing.name || '') !== branch.name
      || String(existing.parent_id || '') !== branch.parentBranchId
      || existing.primary === true
      || existing.default === true
      || existing.protected === true) {
    throw new Error('CLEANUP_TARGET_NOT_EXACT_UNPROTECTED_TEMPORARY_CHILD');
  }
  await neon('/projects/' + encodeURIComponent(projectId) + '/branches/' + encodeURIComponent(branch.id), { method: 'DELETE' });
  for (let attempt = 0; attempt < 15; attempt++) {
    const afterDelete = await listBranches(projectId);
    if (!afterDelete.some(item => String(item.id || '') === branch.id)) {
      return { status: 'PASS', deleted: true, absentBeforeCleanup: false };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('TEMPORARY_BRANCH_DELETE_NOT_VERIFIED');
}

function writeEvidence(filePath, evidence) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(evidence, null, 2) + '\n';
  fs.writeFileSync(filePath, body);
  fs.writeFileSync(filePath + '.sha256', crypto.createHash('sha256').update(body).digest('hex')
    + '  ' + path.basename(filePath) + '\n');
}

function safeReason(error) {
  return String(error && (error.code || error.message) || 'RECOVERY_PROBE_FAILED')
    .replace(/[^A-Z0-9_:.-]/gi, '_').slice(0, 180);
}

async function main() {
  const projectId = safeToken(process.env.NEON_PROJECT_ID, /^[a-z0-9-]{8,80}$/, 'NEON_PROJECT_ID_REQUIRED');
  const parentBranchId = safeToken(process.env.OPSC_PRODUCTION_NEON_BRANCH_ID, /^br-[a-z0-9-]{8,80}$/, 'PRODUCTION_PARENT_BRANCH_ID_REQUIRED');
  const databaseName = safeToken(process.env.OPSC_PRODUCTION_DATABASE_NAME, /^[A-Za-z_][A-Za-z0-9_]{0,62}$/, 'PRODUCTION_DATABASE_NAME_REQUIRED');
  const roleName = safeToken(process.env.OPSC_PRODUCTION_OWNER_ROLE || 'neondb_owner', /^[A-Za-z_][A-Za-z0-9_]{0,62}$/, 'PRODUCTION_OWNER_ROLE_INVALID');
  const collectorCommit = safeToken(sourceCommit(), /^[a-f0-9]{40}$/, 'COLLECTOR_SOURCE_COMMIT_SHA_REQUIRED');
  const collectorPipelineId = safeToken(process.env.GITHUB_RUN_ID, /^[1-9][0-9]{0,14}$/, 'COLLECTOR_PIPELINE_ID_REQUIRED');
  const runAttempt = safeToken(process.env.GITHUB_RUN_ATTEMPT || '1', /^[1-9][0-9]{0,5}$/, 'COLLECTOR_RUN_ATTEMPT_INVALID');
  const limit = Number(process.env.OPSC_NEON_BRANCH_LIMIT || 10);
  if (!Number.isInteger(limit) || limit < 2 || limit > 100) throw new Error('NEON_BRANCH_LIMIT_INVALID');

  const httpBase = String(process.env.OPSC_PRODUCTION_HTTP_BASE || 'https://opscore-platform.vercel.app').replace(/\/+$/, '');
  const deploymentIdentity = await readProductionDeploymentIdentity(
    httpBase,
    String(process.env.OPSC_EXPECTED_PRODUCTION_COMMIT_SHA || '')
  );
  if (deploymentIdentity.environment !== 'production'
      || deploymentIdentity.ref !== 'main'
      || deploymentIdentity.commitSha !== String(process.env.OPSC_EXPECTED_PRODUCTION_COMMIT_SHA || '').toLowerCase()) {
    throw new Error('PRODUCTION_DEPLOYMENT_IDENTITY_NOT_EXACT');
  }

  const parentUri = await connectionUri(projectId, parentBranchId, databaseName, roleName);
  const sourceIdentity = JSON.parse(psql(parentUri,
    "SELECT json_build_object('database',current_database(),'role',current_user,'server_version',current_setting('server_version'),'lsn',pg_current_wal_lsn()::text)::text;"));
  if (sourceIdentity.database !== databaseName || sourceIdentity.role !== roleName) {
    throw new Error('PRODUCTION_RECOVERY_DATABASE_IDENTITY_MISMATCH');
  }

  const branches = await listBranches(projectId);
  const parent = branches.find(item => item.id === parentBranchId);
  if (!parent || parent.current_state !== 'ready' || parent.primary !== true) {
    throw new Error('PRODUCTION_PARENT_BRANCH_NOT_READY_OR_NOT_PRIMARY');
  }
  if (branches.length + 2 > limit) {
    const blocked = {
      schemaVersion: 'opscore.production-recovery-point.v4',
      status: 'BLOCKED',
      testedAt: new Date().toISOString(),
      projectId,
      parentBranchId,
      databaseName,
      ownerRole: roleName,
      targetTimestampUtc: null,
      tableCountCompared: null,
      mismatchCount: null,
      verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
      blockers: [{ code: 'NEON_BRANCH_CAPACITY_INSUFFICIENT', detail: branches.length + '+2>' + limit + '; no existing branch was deleted' }],
      sourceCommitHint: deploymentIdentity.commitSha,
      pipelineId: deploymentIdentity.ciPipelineId,
      deploymentId: deploymentIdentity.deploymentId,
      collectorCommit,
      collectorPipelineId,
      evidenceClass: 'PRODUCTION_FULL_DATA_RECOVERY_AND_NATIVE_PITR'
    };
    writeEvidence(recoveryPath, blocked);
    writeEvidence(pitrPath, {
      schemaVersion: 'opscore.production-native-pitr.v2',
      status: 'BLOCKED',
      environment: 'production',
      mechanism: 'NEON_INSTANT_RESTORE_FROM_HISTORY',
      dataIntegrity: 'NOT_VERIFIED',
      verificationScope: 'production-root-historical-branch-full-data-content-hash-and-rls-match',
      targetTimestampUtc: null,
      restoreStartedAt: null,
      restoreCompletedAt: null,
      restoredBranchId: null,
      sourceBranchId: parentBranchId,
      databaseName,
      sourceCommit: deploymentIdentity.commitSha,
      pipelineId: String(deploymentIdentity.ciPipelineId),
      evidenceSha256: crypto.createHash('sha256').update('NEON_BRANCH_CAPACITY_INSUFFICIENT').digest('hex'),
      contentIntegrity: { status: 'NOT_VERIFIED' },
      cleanup: { status: 'NOT_REQUIRED', restoredBranchDeleted: false, comparisonBranchDeleted: false },
      failureCode: 'NEON_BRANCH_CAPACITY_INSUFFICIENT'
    });
    throw new Error('NEON_BRANCH_CAPACITY_INSUFFICIENT');
  }

  const lookbackSeconds = Number(process.env.OPSC_PRODUCTION_PITR_LOOKBACK_SECONDS || 300);
  if (!Number.isInteger(lookbackSeconds) || lookbackSeconds < 30 || lookbackSeconds > 3600) {
    throw new Error('PRODUCTION_PITR_LOOKBACK_SECONDS_INVALID');
  }
  const targetTimestampUtc = new Date(Date.now() - lookbackSeconds * 1000).toISOString();
  const runId = collectorPipelineId;
  const nonce = crypto.randomBytes(4).toString('hex');
  const prefix = 'opsc-' + deploymentIdentity.commitSha.slice(0, 8) + '-' + runId + '-' + runAttempt + '-' + nonce;
  const reference = { id: null, name: prefix + '-ref', parentBranchId };
  const recovery = { id: null, name: prefix + '-clone', parentBranchId: null };
  let referenceCreated = false;
  let recoveryCreated = false;
  let referenceBranch = null;
  let recoveryBranch = null;
  let recoveryPointStatus = 'FAIL';
  let pitrStatus = 'FAIL';
  let operationFailure = null;
  let restoreStartedAt = new Date().toISOString();
  let restoreCompletedAt = null;
  let identity = null;
  let referenceCatalog = null;
  let recoveryCatalog = null;
  let referenceManifest = null;
  let recoveryManifest = null;
  let tableResults = [];
  let rowResultsValid = false;
  let cleanup = {
    status: 'NOT_RUN',
    referenceBranchDeleted: false,
    recoveryBranchDeleted: false
  };

  try {
    const referenceCreatedResponse = await createTemporaryBranch(projectId, reference.name, parentBranchId, targetTimestampUtc);
    reference.id = referenceCreatedResponse.id;
    referenceCreated = true;
    referenceBranch = await waitForBranch(projectId, reference);

    const recoveryCreatedResponse = await createTemporaryBranch(projectId, recovery.name, parentBranchId, targetTimestampUtc);
    recovery.id = recoveryCreatedResponse.id;
    recoveryCreated = true;
    recoveryBranch = await waitForBranch(projectId, recovery);
    restoreCompletedAt = new Date().toISOString();
    const restoreDurationMs = Date.parse(restoreCompletedAt) - Date.parse(restoreStartedAt);
    const targetPointAgeAtCompletionMs = Date.parse(restoreCompletedAt) - Date.parse(targetTimestampUtc);
    if (!Number.isSafeInteger(restoreDurationMs) || restoreDurationMs < 0
        || !Number.isSafeInteger(targetPointAgeAtCompletionMs) || targetPointAgeAtCompletionMs < 0) {
      throw new Error('PITR_RESTORE_TIMING_INVALID');
    }

    const referenceUri = await connectionUri(projectId, reference.id, databaseName, roleName);
    const recoveryUri = await connectionUri(projectId, recovery.id, databaseName, roleName);
    const referenceIdentity = JSON.parse(psql(referenceUri,
      "SELECT json_build_object('database',current_database(),'role',current_user,'server_version',current_setting('server_version'))::text;"));
    const recoveryIdentity = JSON.parse(psql(recoveryUri,
      "SELECT json_build_object('database',current_database(),'role',current_user,'server_version',current_setting('server_version'))::text;"));
    if (referenceIdentity.database !== databaseName || recoveryIdentity.database !== databaseName
        || referenceIdentity.role !== roleName || recoveryIdentity.role !== roleName
        || referenceIdentity.server_version !== recoveryIdentity.server_version) {
      throw new Error('RECOVERY_CLONE_DATABASE_IDENTITY_MISMATCH');
    }
    identity = referenceIdentity;

    referenceCatalog = await readCatalog(referenceUri);
    recoveryCatalog = await readCatalog(recoveryUri);
    if (referenceCatalog.tables.length !== recoveryCatalog.tables.length) {
      throw new Error('RECOVERY_TABLE_INVENTORY_COUNT_MISMATCH');
    }
    const referenceNames = referenceCatalog.tables.map(row => row.table_name);
    const recoveryNames = recoveryCatalog.tables.map(row => row.table_name);
    if (JSON.stringify(referenceNames) !== JSON.stringify(recoveryNames)) {
      throw new Error('RECOVERY_TABLE_INVENTORY_MISMATCH');
    }

    const refManifest = manifestDigest(referenceCatalog);
    const recManifest = manifestDigest(recoveryCatalog);
    referenceManifest = refManifest;
    recoveryManifest = recManifest;

    const allowedRlsExceptions = ['spatial_ref_sys'];
    const observedRlsExceptions = referenceCatalog.tables
      .filter(row => row.row_security_enabled !== true || row.force_row_security !== true)
      .map(row => row.table_name)
      .sort();
    const rlsPolicyTableCount = referenceCatalog.tables.filter(row =>
      row.row_security_enabled === true && row.force_row_security === true
    ).length;
    const recoveryPolicyTableCount = recoveryCatalog.tables.filter(row =>
      row.row_security_enabled === true && row.force_row_security === true
    ).length;
    const recoveryByName = new Map(recoveryCatalog.tables.map(row => [row.table_name, row]));
    const catalogPolicyEqual = JSON.stringify(referenceCatalog.policies) === JSON.stringify(recoveryCatalog.policies);
    const rlsExceptionsExact = JSON.stringify(observedRlsExceptions) === JSON.stringify(allowedRlsExceptions);
    const rlsPolicyMismatchCount = (catalogPolicyEqual && rlsExceptionsExact
      && recoveryPolicyTableCount === rlsPolicyTableCount) ? 0 : 1;
    let forceRlsMismatchCount = 0;
    for (const table of referenceCatalog.tables) {
      const other = recoveryByName.get(table.table_name);
      if (!other || Boolean(table.force_row_security) !== Boolean(other.force_row_security)) {
        if (!allowedRlsExceptions.includes(table.table_name)) forceRlsMismatchCount += 1;
      }
    }

    for (let index = 0; index < referenceNames.length; index++) {
      const tableName = referenceNames[index];
      const sourceData = await streamTableDigest(referenceUri, tableName);
      const restoredData = await streamTableDigest(recoveryUri, tableName);
      const status = sourceData.rowCount === restoredData.rowCount && sourceData.sha256 === restoredData.sha256
        ? 'PASS' : 'MISMATCH';
      tableResults.push({
        schema: 'public',
        table: tableName,
        status,
        sourceSha256: sourceData.sha256,
        recoverySha256: restoredData.sha256,
        sourceRowCount: sourceData.rowCount,
        recoveryRowCount: restoredData.rowCount
      });
    }

    const rowsCompared = tableResults.reduce((total, row) => total + row.sourceRowCount, 0);
    const tableMismatchCount = tableResults.filter(row => row.status !== 'PASS').length;
    const manifestMismatchCount = refManifest === recManifest ? 0 : 1;
    const mismatchCount = tableMismatchCount + manifestMismatchCount + rlsPolicyMismatchCount + forceRlsMismatchCount;
    const requiredCoreTables = ['organizations','users','memberships','sessions','assets','sites','work_orders','customers'];
    const coreTablesPresent = requiredCoreTables.every(name => tableResults.some(row => row.table === name));
    rowResultsValid = referenceCatalog.tables.length >= 136
      && tableResults.length >= 130
      && tableResults.every(row => row.status === 'PASS')
      && Number.isSafeInteger(rowsCompared)
      && rowsCompared > 0
      && rlsPolicyTableCount >= 135
      && rlsExceptionsExact
      && rlsPolicyMismatchCount === 0
      && forceRlsMismatchCount === 0
      && recoveryPolicyTableCount === rlsPolicyTableCount
      && coreTablesPresent
      && refManifest === recManifest
      && mismatchCount === 0;
    if (!rowResultsValid) throw new Error('PRODUCTION_FULL_DATA_RECOVERY_CONTENT_MISMATCH');

    const contentIntegrity = {
      status: 'PASS',
      algorithm: 'SHA-256',
      tableCountCompared: tableResults.length,
      catalogTableCount: referenceCatalog.tables.length,
      rowsCompared,
      mismatchCount,
      rlsPolicyTableCount,
      rlsPolicyMismatchCount,
      forceRlsMismatchCount,
      rlsExceptionTables: observedRlsExceptions,
      sourceManifestSha256: refManifest,
      recoveryManifestSha256: recManifest,
      tableResults
    };

    const coreTenantTables = ['organizations','users','memberships','sessions','assets','sites','work_orders','customers'];
    const coreTenantTableRowCountsMatch = coreTenantTables.every(tableName =>
      tableResults.some(row => row.table === tableName && row.status === 'PASS')
    );
    if (!coreTenantTableRowCountsMatch) {
      throw new Error('RECOVERY_CORE_TENANT_TABLE_CONTENT_MISMATCH');
    }

    const cleanupResults = [];
    if (recoveryCreated) {
      try {
        cleanupResults.push(await deleteTemporaryBranch(projectId, recovery));
        recoveryCreated = false;
      } catch (error) {
        cleanupResults.push({ status: 'FAIL', deleted: false, reasonCode: safeReason(error) });
      }
    }
    if (referenceCreated) {
      try {
        cleanupResults.push(await deleteTemporaryBranch(projectId, reference));
        referenceCreated = false;
      } catch (error) {
        cleanupResults.push({ status: 'FAIL', deleted: false, reasonCode: safeReason(error) });
      }
    }
    cleanup = {
      status: cleanupResults.length === 2 && cleanupResults.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
      referenceBranchDeleted: cleanupResults.length === 2 && cleanupResults[1].deleted === true,
      recoveryBranchDeleted: cleanupResults.length === 2 && cleanupResults[0].deleted === true,
      branches: cleanupResults
    };
    recoveryPointStatus = cleanup.status === 'PASS' ? 'PASS' : 'FAIL';
    pitrStatus = cleanup.status === 'PASS' ? 'PASS' : 'FAIL';

    const sourceCommitHint = deploymentIdentity.commitSha;
    const pipelineId = deploymentIdentity.ciPipelineId;
    const common = {
      projectId,
      parentBranchId,
      databaseName,
      ownerRole: roleName,
      targetTimestampUtc,
      sourceCommitHint,
      pipelineId,
      deploymentId: deploymentIdentity.deploymentId,
      collectorCommit,
      collectorPipelineId,
      referenceBranchId: reference.id,
      recoveryBranchId: recovery.id,
      cleanup,
      evidenceClass: 'PRODUCTION_FULL_DATA_RECOVERY_AND_NATIVE_PITR'
    };
    const recoveryEvidence = {
      schemaVersion: 'opscore.production-recovery-point.v4',
      status: recoveryPointStatus,
      testedAt: new Date().toISOString(),
      ...common,
      serverVersion: identity.server_version,
      recoveryBranchName: recovery.name,
      temporaryBranch: true,
      tableCountCompared: tableResults.length,
      coreTenantTableRowCountsMatch,
      verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
      mismatchCount: 0,
      contentIntegrity,
      cleanup,
      note: 'Two independent read-only sibling branches were created directly from the Production root branch at the same explicit historical timestamp. All physical public tables were compared using streaming per-row SHA-256 hashes and exact row counts; all public table/partition catalog metadata and full RLS/FORCE RLS policy inventories were compared. The explicit non-tenant metadata exception is spatial_ref_sys. Both exact temporary branches created by this run were deleted and absence verified. This proves repeatable historical branch materialization and full equality between independent results; it is not an application-level recovery rehearsal or an RPO/RTO guarantee.'
    };
    writeEvidence(recoveryPath, recoveryEvidence);

    const pitrContentIntegrity = {
      status: 'PASS',
      algorithm: 'SHA-256',
      tableCountCompared: tableResults.length,
      catalogTableCount: referenceCatalog.tables.length,
      rowsCompared,
      mismatchCount: 0,
      rlsPolicyTableCount,
      rlsPolicyMismatchCount,
      forceRlsMismatchCount,
      rlsExceptionTables: observedRlsExceptions,
      sourceManifestSha256: refManifest,
      restoredManifestSha256: recManifest,
      tableResults: tableResults.map(row => ({
        schema: row.schema,
        table: row.table,
        status: row.status,
        sourceSha256: row.sourceSha256,
        restoredSha256: row.recoverySha256,
        sourceRowCount: row.sourceRowCount,
        restoredRowCount: row.recoveryRowCount
      }))
    };
    const pitrCore = {
      schemaVersion: 'opscore.production-native-pitr.v2',
      status: 'PASS',
      environment: 'production',
      mechanism: 'NEON_INSTANT_RESTORE_FROM_HISTORY',
      dataIntegrity: 'PASS',
      verificationScope: 'production-root-historical-branch-full-data-content-hash-and-rls-match',
      targetTimestampUtc,
      restoreStartedAt,
      restoreCompletedAt,
      restoreDurationMs,
      targetPointAgeAtCompletionMs,
      restoredBranchId: reference.id,
      comparisonBranchId: recovery.id,
      sourceBranchId: parentBranchId,
      databaseName,
      sourceCommit: sourceCommitHint,
      pipelineId: String(pipelineId),
      contentIntegrity: pitrContentIntegrity,
      cleanup: {
        status: cleanup.status,
        restoredBranchDeleted: cleanup.referenceBranchDeleted,
        comparisonBranchDeleted: cleanup.recoveryBranchDeleted
      },
      testedAt: new Date().toISOString()
    };
    pitrCore.evidenceSha256 = crypto.createHash('sha256').update(JSON.stringify(pitrCore), 'utf8').digest('hex');
    writeEvidence(pitrPath, pitrCore);

    process.stdout.write(JSON.stringify({
      recoveryPointStatus,
      nativePitrStatus: pitrStatus,
      databaseName,
      targetTimestampUtc,
      tableCountCompared: tableResults.length,
      rowsCompared,
      mismatchCount,
      rlsPolicyTableCount,
      cleanup
    }) + '\n');
    if (recoveryPointStatus !== 'PASS' || pitrStatus !== 'PASS') process.exitCode = 1;
  } catch (error) {
    operationFailure = safeReason(error);
    const cleanupResults = [];
    if (recoveryCreated) {
      try {
        cleanupResults.push(await deleteTemporaryBranch(projectId, recovery));
        recoveryCreated = false;
      } catch (cleanupError) {
        cleanupResults.push({ status: 'FAIL', deleted: false, reasonCode: safeReason(cleanupError) });
      }
    }
    if (referenceCreated) {
      try {
        cleanupResults.push(await deleteTemporaryBranch(projectId, reference));
        referenceCreated = false;
      } catch (cleanupError) {
        cleanupResults.push({ status: 'FAIL', deleted: false, reasonCode: safeReason(cleanupError) });
      }
    }
    const cleanupPass = cleanupResults.length === 2 && cleanupResults.every(item => item.status === 'PASS');
    cleanup = {
      status: cleanupPass ? 'PASS' : (cleanupResults.length ? 'FAIL' : 'NOT_REQUIRED'),
      referenceBranchDeleted: cleanupResults.length === 2 && cleanupResults[1].deleted === true,
      recoveryBranchDeleted: cleanupResults.length === 2 && cleanupResults[0].deleted === true,
      branches: cleanupResults
    };
    const failBase = {
      status: 'FAIL',
      testedAt: new Date().toISOString(),
      projectId,
      parentBranchId,
      databaseName,
      ownerRole: roleName,
      targetTimestampUtc,
      sourceCommitHint: deploymentIdentity.commitSha,
      pipelineId: deploymentIdentity.ciPipelineId,
      deploymentId: deploymentIdentity.deploymentId,
      collectorCommit,
      collectorPipelineId,
      cleanup,
      failureCode: operationFailure,
      evidenceClass: 'PRODUCTION_FULL_DATA_RECOVERY_AND_NATIVE_PITR'
    };
    writeEvidence(recoveryPath, {
      schemaVersion: 'opscore.production-recovery-point.v4',
      ...failBase,
      verificationScope: 'branch-clone-public-full-table-content-hash-and-core-tenant-row-counts',
      referenceBranchId: reference.id,
      recoveryBranchId: recovery.id,
      tableCountCompared: tableResults.length || null,
      coreTenantTableRowCountsMatch: false,
      mismatchCount: null,
      contentIntegrity: {
        status: 'NOT_VERIFIED',
        algorithm: 'SHA-256',
        tableCountCompared: tableResults.length || null,
        rowsCompared: null,
        mismatchCount: null,
        rlsPolicyTableCount: null,
        rlsPolicyMismatchCount: null,
        forceRlsMismatchCount: null,
        sourceManifestSha256: referenceManifest,
        recoveryManifestSha256: recoveryManifest,
        tableResults
      }
    });
    writeEvidence(pitrPath, {
      schemaVersion: 'opscore.production-native-pitr.v2',
      status: 'FAIL',
      environment: 'production',
      mechanism: 'NEON_INSTANT_RESTORE_FROM_HISTORY',
      dataIntegrity: 'FAIL',
      verificationScope: 'production-root-historical-branch-full-data-content-hash-and-rls-match',
      targetTimestampUtc,
      restoreStartedAt,
      restoreCompletedAt,
      restoredBranchId: reference.id,
      comparisonBranchId: recovery.id,
      sourceBranchId: parentBranchId,
      databaseName,
      sourceCommit: deploymentIdentity.commitSha,
      pipelineId: String(deploymentIdentity.ciPipelineId),
      evidenceSha256: crypto.createHash('sha256').update(operationFailure).digest('hex'),
      contentIntegrity: {
        status: 'NOT_VERIFIED',
        algorithm: 'SHA-256',
        tableCountCompared: tableResults.length || null,
        rowsCompared: null,
        mismatchCount: null,
        rlsPolicyTableCount: null,
        rlsPolicyMismatchCount: null,
        forceRlsMismatchCount: null,
        sourceManifestSha256: referenceManifest,
        restoredManifestSha256: recoveryManifest,
        tableResults: tableResults.map(row => ({
          schema: row.schema,
          table: row.table,
          status: row.status,
          sourceSha256: row.sourceSha256,
          restoredSha256: row.recoverySha256,
          sourceRowCount: row.sourceRowCount,
          restoredRowCount: row.recoveryRowCount
        }))
      },
      cleanup
    });
    console.error('PRODUCTION_FULL_DATA_RECOVERY_FAILED', operationFailure);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('PRODUCTION_FULL_DATA_RECOVERY_FAILED', safeReason(error));
    process.exit(1);
  });
}

module.exports = {
  quoteIdentifier,
  manifestDigest,
  safeReason
};
