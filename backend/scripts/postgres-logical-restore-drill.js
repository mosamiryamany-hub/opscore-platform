#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const SOURCE_DATABASE = 'opscore_http_acceptance';
const TARGET_DATABASE = 'opscore_restore_target';
const REQUIRED_EXTENSIONS = Object.freeze(['pgcrypto', 'postgis', 'vector']);

function quoteIdentifier(value) {
  const text = String(value);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(text)) throw new Error('RESTORE_IDENTIFIER_INVALID');
  return '"' + text + '"';
}

function parseLocalDatabaseUrl(raw, expectedDatabase) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch { throw new Error('RESTORE_DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname.toLowerCase()) ||
      (url.port && url.port !== '5432') ||
      decodeURIComponent(url.pathname.replace(/^\/+/, '')) !== expectedDatabase ||
      decodeURIComponent(url.username) !== 'neondb_owner' ||
      !url.password) {
    throw new Error('RESTORE_DATABASE_TARGET_NOT_ALLOWED');
  }
  return url;
}

function escapePgPass(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/\r|\n/g, '');
}

function buildPgPassLine(url) {
  return [
    url.hostname,
    url.port || '5432',
    decodeURIComponent(url.pathname.replace(/^\/+/, '')),
    decodeURIComponent(url.username),
    decodeURIComponent(url.password)
  ].map(escapePgPass).join(':');
}

function filterExtensionToc(tocText, extensions = REQUIRED_EXTENSIONS) {
  const allowed = new Set(extensions);
  const createCounts = new Map([...allowed].map(name => [name, 0]));
  const lines = String(tocText || '').split(/\\r?\\n/);
  let removedCreate = 0;
  let removedComments = 0;
  const retained = lines.filter(line => {
    const create = line.match(/^\\s*\\d+;\\s+\\d+\\s+\\d+\\s+EXTENSION\\s+-\\s+([a-z0-9_]+)\\b/i);
    if (create && allowed.has(create[1].toLowerCase())) {
      const name = create[1].toLowerCase();
      createCounts.set(name, createCounts.get(name) + 1);
      removedCreate += 1;
      return false;
    }
    const comment = line.match(/^\\s*\\d+;\\s+\\d+\\s+\\d+\\s+COMMENT\\s+-\\s+EXTENSION\\s+([a-z0-9_]+)\\b/i);
    if (comment && allowed.has(comment[1].toLowerCase())) {
      removedComments += 1;
      return false;
    }
    return true;
  });
  if (removedCreate !== allowed.size || [...createCounts.values()].some(count => count !== 1)) {
    throw new Error('RESTORE_TOC_EXTENSION_FILTER_INCOMPLETE');
  }
  return { text: retained.join('\\n') + '\\n', removedCreate, removedComments };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: options.env || process.env });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let closeCode = null;
    let stdoutFinished = !options.stdoutFile;
    const sink = options.stdoutFile
      ? fs.createWriteStream(options.stdoutFile, { mode: 0o600 })
      : null;

    const finish = () => {
      if (settled || closeCode === null || !stdoutFinished) return;
      settled = true;
      clearTimeout(timer);
      if (closeCode !== 0) {
        const safe = stderr.replace(/password\s*=\s*\S+/ig, 'password=[REDACTED]').slice(0, 1200);
        reject(new Error('RESTORE_PROCESS_FAILED:' + String(closeCode) + ':' + safe));
      } else resolve({ stdout, stderr });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) { settled = true; reject(new Error('RESTORE_PROCESS_TIMEOUT')); }
    }, Number.isSafeInteger(options.timeoutMs) ? options.timeoutMs : 10 * 60 * 1000);

    if (sink) {
      child.stdout.pipe(sink);
      sink.once('finish', () => { stdoutFinished = true; finish(); });
      sink.once('error', error => {
        child.kill('SIGKILL');
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
      });
    } else {
      child.stdout.on('data', chunk => {
        stdout += chunk.toString('utf8');
        if (Buffer.byteLength(stdout, 'utf8') > (options.maxStdoutBytes || 16 * 1024 * 1024)) {
          child.kill('SIGKILL');
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error('RESTORE_PROCESS_OUTPUT_LIMIT')); }
        }
      });
      child.stdout.on('end', () => { stdoutFinished = true; finish(); });
    }
    child.stderr.on('data', chunk => {
      const remaining = 16 * 1024 - Buffer.byteLength(stderr, 'utf8');
      if (remaining > 0) stderr += chunk.toString('utf8').slice(0, remaining);
    });
    child.once('error', () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error('RESTORE_PROCESS_START_FAILED')); }
    });
    child.once('close', code => { closeCode = code; finish(); });

    if (options.stdinFile) {
      const source = fs.createReadStream(options.stdinFile);
      source.once('error', error => {
        child.kill('SIGKILL');
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
      });
      source.pipe(child.stdin);
    } else if (options.stdinText !== undefined) child.stdin.end(options.stdinText);
    else child.stdin.end();
  });
}

function dockerArgs(containerId, ...args) {
  if (!/^[a-f0-9]{12,64}$/i.test(String(containerId || ''))) throw new Error('RESTORE_DOCKER_CONTAINER_INVALID');
  return ['exec', '-i', '-u', 'root', String(containerId), ...args];
}

function dockerPassArgs(containerId, passPath, ...args) {
  if (!/^[a-f0-9]{12,64}$/i.test(String(containerId || ''))) throw new Error('RESTORE_DOCKER_CONTAINER_INVALID');
  return ['exec', '-i', '-u', 'root', '-e', 'PGPASSFILE=' + passPath, String(containerId), ...args];
}

function stableJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    }
    return item;
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function tableInventory(pool) {
  const tables = (await pool.query(
    "SELECT n.nspname AS schema_name,c.relname AS table_name " +
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
    "WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') " +
    "AND n.nspname NOT LIKE 'pg_toast%' " +
    "AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') " +
    "ORDER BY n.nspname,c.relname"
  )).rows;
  const stats = [];
  for (const table of tables) {
    const qualified = quoteIdentifier(table.schema_name) + '.' + quoteIdentifier(table.table_name);
    const result = await pool.query(
      "SELECT count(*)::text AS row_count, " +
      "COALESCE(md5(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text)), md5('')) AS content_md5 " +
      "FROM " + qualified + " AS t"
    );
    stats.push({
      schema: table.schema_name,
      table: table.table_name,
      rowCount: Number(result.rows[0].row_count),
      contentMd5: result.rows[0].content_md5
    });
  }
  return stats;
}

async function databaseCatalog(pool) {
  const results = await Promise.all([
    pool.query(
      "SELECT count(*) FILTER (WHERE c.relkind IN ('r','p'))::int AS table_count, " +
      "count(*) FILTER (WHERE c.relkind='v')::int AS view_count, " +
      "count(*) FILTER (WHERE c.relkind='m')::int AS materialized_view_count, " +
      "count(*) FILTER (WHERE c.relkind='i')::int AS index_count, " +
      "count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_table_count, " +
      "count(*) FILTER (WHERE c.relforcerowsecurity)::int AS force_rls_table_count " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' " +
      "AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')"
    ),
    pool.query('SELECT extname,extversion FROM pg_extension ORDER BY extname'),
    pool.query(
      "SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check " +
      "FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema') " +
      "ORDER BY schemaname,tablename,policyname"
    ),
    pool.query(
      "SELECT n.nspname AS schema_name,c.relname AS table_name,con.conname,con.contype,con.convalidated,pg_get_constraintdef(con.oid) AS definition " +
      "FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' " +
      "AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') " +
      "ORDER BY n.nspname,c.relname,con.conname"
    ),
    pool.query(
      "SELECT i.schemaname,i.tablename,i.indexname,i.indexdef FROM pg_indexes i " +
      "WHERE i.schemaname NOT IN ('pg_catalog','information_schema') " +
      "AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e' " +
      "WHERE n.nspname=i.schemaname AND c.relname=i.indexname) " +
      "ORDER BY i.schemaname,i.tablename,i.indexname"
    )
  ]);
  return {
    summary: results[0].rows[0],
    extensions: results[1].rows,
    policies: results[2].rows,
    constraints: results[3].rows,
    indexes: results[4].rows
  };
}

async function createFixture(pool, schemaName) {
  const schema = quoteIdentifier(schemaName);
  await pool.query('CREATE SCHEMA ' + schema);
  await pool.query(
    'CREATE TABLE ' + schema + '.tenant_restore_fixture (' +
    'id text PRIMARY KEY,tenant_id text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL)'
  );
  await pool.query('CREATE INDEX tenant_restore_fixture_tenant_idx ON ' + schema + '.tenant_restore_fixture (tenant_id)');
  await pool.query('ALTER TABLE ' + schema + '.tenant_restore_fixture ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE ' + schema + '.tenant_restore_fixture FORCE ROW LEVEL SECURITY');
  await pool.query(
    'CREATE POLICY tenant_restore_fixture_scope ON ' + schema + '.tenant_restore_fixture ' +
    "USING (tenant_id=current_setting('app.tenant_id',true)) WITH CHECK (tenant_id=current_setting('app.tenant_id',true))"
  );
  await pool.query(
    'INSERT INTO ' + schema + '.tenant_restore_fixture (id,tenant_id,payload,created_at) VALUES ' +
    "('restore-a','tenant-a','{\"value\":\"alpha\",\"sequence\":1}'::jsonb,'2026-01-01T00:00:00Z')," +
    "('restore-b','tenant-b','{\"value\":\"bravo\",\"sequence\":2}'::jsonb,'2026-01-02T00:00:00Z')"
  );
}

async function verifyFixture(pool, schemaName) {
  const schema = quoteIdentifier(schemaName);
  const rows = (await pool.query(
    'SELECT id,tenant_id,payload,created_at FROM ' + schema + '.tenant_restore_fixture ORDER BY id'
  )).rows;
  const relation = (await pool.query(
    "SELECT c.relrowsecurity,c.relforcerowsecurity, " +
    "EXISTS (SELECT 1 FROM pg_indexes i WHERE i.schemaname=$1 AND i.tablename='tenant_restore_fixture' AND i.indexname='tenant_restore_fixture_tenant_idx') AS tenant_index_present, " +
    "(SELECT count(*)::int FROM pg_policies p WHERE p.schemaname=$1 AND p.tablename='tenant_restore_fixture' AND p.policyname='tenant_restore_fixture_scope') AS policy_count " +
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='tenant_restore_fixture'",
    [schemaName]
  )).rows[0];
  if (!relation || rows.length !== 2 || relation.relrowsecurity !== true ||
      relation.relforcerowsecurity !== true || relation.tenant_index_present !== true ||
      relation.policy_count !== 1) throw new Error('RESTORE_FIXTURE_POSTCONDITIONS_FAILED');
  return {
    rows: rows.map(row => ({
      id: row.id, tenantId: row.tenant_id, payload: row.payload,
      createdAt: new Date(row.created_at).toISOString()
    })),
    rlsEnabled: relation.relrowsecurity,
    forceRlsEnabled: relation.relforcerowsecurity,
    tenantIndexPresent: relation.tenant_index_present,
    policyCount: relation.policy_count
  };
}

async function main() {
  const sourceUrl = parseLocalDatabaseUrl(process.env.OPSC_RESTORE_DRILL_SOURCE_URL, SOURCE_DATABASE);
  const targetUrl = parseLocalDatabaseUrl(process.env.OPSC_RESTORE_DRILL_TARGET_URL, TARGET_DATABASE);
  if (sourceUrl.username !== targetUrl.username || sourceUrl.password !== targetUrl.password) throw new Error('RESTORE_DATABASE_ROLE_MISMATCH');
  const containerId = String(process.env.OPSC_RESTORE_DRILL_DOCKER_CONTAINER || '').trim();
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) throw new Error('RESTORE_DOCKER_CONTAINER_REQUIRED');

  const runId = crypto.randomBytes(8).toString('hex');
  const fixtureSchema = 'opscore_restore_' + runId;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-logical-restore-'));
  const passFile = path.join(workDir, '.pgpass');
  const archiveFile = path.join(workDir, 'source.dump');
  const tocFile = path.join(workDir, 'source.list');
  const reportPath = String(process.env.OPSC_RESTORE_DRILL_REPORT_PATH || path.join(os.tmpdir(), 'POSTGRES_LOGICAL_RESTORE_DRILL_RESULT.json'));
  const containerPassPath = '/tmp/opscore-restore-' + runId + '.pgpass';
  const containerArchivePath = '/tmp/opscore-restore-' + runId + '.dump';
  const containerTocPath = '/tmp/opscore-restore-' + runId + '.list';
  const sourcePool = new Pool({ connectionString: sourceUrl.toString(), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000, application_name: 'opscore-logical-restore-drill-source' });
  const targetPool = new Pool({ connectionString: targetUrl.toString(), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000, application_name: 'opscore-logical-restore-drill-target' });
  const report = {
    schemaVersion: 'opscore.postgres-logical-restore-drill.v1',
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    evidenceClass: 'CI_DISPOSABLE_DATABASE_LOGICAL_RESTORE',
    testedTarget: 'isolated disposable PostgreSQL 18 databases in GitHub Actions',
    sourceDatabase: SOURCE_DATABASE,
    restoredDatabase: TARGET_DATABASE,
    productionCertification: false,
    checks: [],
    limitations: [
      'This is a real pg_dump/pg_restore drill against disposable CI databases, not a production database restore.',
      'It does not validate Neon point-in-time restore, production backup retention, or production credentials.',
      'Production recovery certification requires a separately authorized and evidenced restore into an isolated production-recovery target.'
    ]
  };
  let sourceFixtureCreated = false;
  let targetFixtureCreated = false;
  let passFileCopied = false;
  let archiveCopied = false;
  let tocCopied = false;
  let primaryError = null;
  const record = (name, status, detail) => report.checks.push({ name, status, detail: detail || null });

  try {
    const sourceIdentity = (await sourcePool.query(
      "SELECT current_database() AS database,current_user AS role,current_setting('server_version') AS server_version,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname=current_user"
    )).rows[0];
    const targetIdentity = (await targetPool.query(
      "SELECT current_database() AS database,current_user AS role,current_setting('server_version') AS server_version,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls FROM pg_roles r WHERE r.rolname=current_user"
    )).rows[0];
    if (!sourceIdentity || !targetIdentity || !/^18\./.test(sourceIdentity.server_version) ||
        !/^18\./.test(targetIdentity.server_version) || sourceIdentity.role !== 'neondb_owner' ||
        targetIdentity.role !== 'neondb_owner' || sourceIdentity.superuser || targetIdentity.superuser ||
        !sourceIdentity.bypass_rls || !targetIdentity.bypass_rls) throw new Error('RESTORE_DATABASE_IDENTITY_INVALID');
    record('postgresql_18_source_and_target_identity', 'PASS', 'Both isolated databases use PostgreSQL 18 and the dedicated migration owner.');

    const sourceExtensions = (await sourcePool.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows;
    const targetExtensions = (await targetPool.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows;
    for (const name of REQUIRED_EXTENSIONS) {
      if (!sourceExtensions.some(item => item.extname === name) || !targetExtensions.some(item => item.extname === name)) throw new Error('RESTORE_REQUIRED_EXTENSION_MISSING:' + name);
    }
    if (stableJson(sourceExtensions) !== stableJson(targetExtensions)) throw new Error('RESTORE_EXTENSION_VERSION_MISMATCH');
    record('required_extensions_match', 'PASS', sourceExtensions.map(item => item.extname + '=' + item.extversion).join(','));

    const targetPreflight = await databaseCatalog(targetPool);
    if (Number(targetPreflight.summary.table_count) !== 0 || targetPreflight.policies.length !== 0 ||
        targetPreflight.constraints.length !== 0 || targetPreflight.indexes.length !== 0) {
      throw new Error('RESTORE_TARGET_DATABASE_NOT_EMPTY');
    }
    record('restore_target_is_empty', 'PASS', 'Target contains only the pre-provisioned PostgreSQL extensions and no application tables, policies, constraints, or indexes.');

    sourceFixtureCreated = true;
    await createFixture(sourcePool, fixtureSchema);
    record('restore_fixture_created', 'PASS', 'Created tenant-separated rows, index, RLS, FORCE RLS, and policy in a unique disposable schema.');

    fs.writeFileSync(passFile, buildPgPassLine(sourceUrl) + '\n' + buildPgPassLine(targetUrl) + '\n', { encoding: 'utf8', mode: 0o600 });
    await runProcess('docker', ['cp', passFile, containerId + ':' + containerPassPath]);
    passFileCopied = true;
    await runProcess('docker', dockerArgs(containerId, 'chmod', '600', containerPassPath));

    await runProcess('docker', dockerPassArgs(
      containerId, containerPassPath,
      'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file=-',
      '--host=127.0.0.1', '--port=5432', '--username=neondb_owner', '--dbname=' + SOURCE_DATABASE
    ), { stdoutFile: archiveFile, timeoutMs: 10 * 60 * 1000 });
    const archiveBytes = fs.statSync(archiveFile).size;
    if (!Number.isSafeInteger(archiveBytes) || archiveBytes < 1024) throw new Error('RESTORE_ARCHIVE_EMPTY_OR_INVALID');
    const archiveSha256 = await sha256File(archiveFile);
    record('custom_format_dump_created', 'PASS', 'pg_dump custom archive bytes=' + archiveBytes + '; sha256=' + archiveSha256);

    const listResult = await runProcess('docker', dockerPassArgs(
      containerId, containerPassPath, 'pg_restore', '--list'
    ), { stdinFile: archiveFile, timeoutMs: 2 * 60 * 1000 });
    const filteredToc = filterExtensionToc(listResult.stdout);
    fs.writeFileSync(tocFile, filteredToc.text, { encoding: 'utf8', mode: 0o600 });
    await runProcess('docker', ['cp', tocFile, containerId + ':' + containerTocPath]);
    tocCopied = true;
    await runProcess('docker', ['cp', archiveFile, containerId + ':' + containerArchivePath]);
    archiveCopied = true;

    const beforeCatalog = await databaseCatalog(sourcePool);
    const beforeTables = await tableInventory(sourcePool);
    record('source_catalog_captured', 'PASS', 'tables=' + beforeCatalog.summary.table_count + '; policies=' + beforeCatalog.policies.length + '; indexes=' + beforeCatalog.indexes.length);

    targetFixtureCreated = true;
    await runProcess('docker', dockerPassArgs(
      containerId, containerPassPath,
      'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl',
      '--use-list', containerTocPath, '--host=127.0.0.1', '--port=5432',
      '--username=neondb_owner', '--dbname=' + TARGET_DATABASE, containerArchivePath
    ), { timeoutMs: 10 * 60 * 1000 });
    record('pg_restore_completed', 'PASS', 'pg_restore restored the archive into a separate blank database; extension DDL was excluded because matching extensions were provisioned first.');

    const afterCatalog = await databaseCatalog(targetPool);
    const afterTables = await tableInventory(targetPool);
    if (stableJson(beforeCatalog) !== stableJson(afterCatalog)) throw new Error('RESTORE_DATABASE_CATALOG_MISMATCH');
    if (stableJson(beforeTables) !== stableJson(afterTables)) throw new Error('RESTORE_TABLE_DATA_FINGERPRINT_MISMATCH');
    record('database_catalog_and_table_data_match', 'PASS', 'Application tables, row counts and content hashes, indexes, constraints, RLS policies, and extension versions match.');

    const sourceFixture = await verifyFixture(sourcePool, fixtureSchema);
    const restoredFixture = await verifyFixture(targetPool, fixtureSchema);
    if (stableJson(sourceFixture) !== stableJson(restoredFixture)) throw new Error('RESTORE_FIXTURE_CONTENT_MISMATCH');
    record('restored_fixture_rls_and_data_verified', 'PASS', 'Fixture rows, JSONB payloads, tenant index, RLS, FORCE RLS, and policy were restored exactly.');

    report.status = 'PASS';
    report.archive = { format: 'pg_dump custom', bytes: archiveBytes, sha256: archiveSha256 };
    report.catalogSummary = beforeCatalog.summary;
    report.tableCount = beforeTables.length;
    report.restoredFixture = { schema: fixtureSchema, rowCount: restoredFixture.rows.length, rlsEnabled: true, forceRlsEnabled: true, tenantIndexPresent: true, policyCount: 1 };
  } catch (error) {
    primaryError = error;
    report.status = 'FAIL';
    report.reason = /^[A-Z0-9_:.-]{1,160}$/.test(String(error && error.message || '')) ? String(error.message) : 'RESTORE_DRILL_FAILED';
    record('restore_drill_execution', 'FAIL', report.reason);
  } finally {
    const cleanupErrors = [];
    for (const [pool, created, label] of [[sourcePool, sourceFixtureCreated, 'source'], [targetPool, targetFixtureCreated, 'target']]) {
      if (!created) continue;
      try { await pool.query('DROP SCHEMA IF EXISTS ' + quoteIdentifier(fixtureSchema) + ' CASCADE'); }
      catch { cleanupErrors.push(label + '_fixture_cleanup_failed'); }
    }
    if (passFileCopied) {
      try { await runProcess('docker', dockerArgs(containerId, 'rm', '-f', containerPassPath)); }
      catch { cleanupErrors.push('docker_pgpass_cleanup_failed'); }
    }
    if (archiveCopied) {
      try { await runProcess('docker', dockerArgs(containerId, 'rm', '-f', containerArchivePath)); }
      catch { cleanupErrors.push('docker_archive_cleanup_failed'); }
    }
    if (tocCopied) {
      try { await runProcess('docker', dockerArgs(containerId, 'rm', '-f', containerTocPath)); }
      catch { cleanupErrors.push('docker_toc_cleanup_failed'); }
    }
    await Promise.all([sourcePool.end(), targetPool.end()]);
    fs.rmSync(workDir, { recursive: true, force: true });
    report.cleanup = cleanupErrors.length ? { status: 'FAIL', errors: cleanupErrors } : { status: 'PASS' };
    if (cleanupErrors.length) {
      report.status = 'FAIL';
      report.reason = 'RESTORE_DRILL_CLEANUP_FAILED';
    }
    report.completedAt = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      const body = JSON.stringify(report, null, 2) + '\n';
      fs.writeFileSync(reportPath, body, { encoding: 'utf8', mode: 0o600 });
      fs.writeFileSync(reportPath + '.sha256', crypto.createHash('sha256').update(body).digest('hex') + '  ' + path.basename(reportPath) + '\n', { encoding: 'utf8', mode: 0o600 });
      const summaryPath = String(process.env.GITHUB_STEP_SUMMARY || '').trim();
      if (summaryPath) {
        fs.appendFileSync(summaryPath, [
          '### PostgreSQL logical restore drill',
          'Status: **' + report.status + '**',
          'Scope: disposable CI databases only; production certification: **false**',
          'Archive SHA-256: ' + (report.archive?.sha256 || 'not produced'),
          'Cleanup: **' + report.cleanup.status + '**',
          ''
        ].join('\n'), { encoding: 'utf8', mode: 0o600 });
      }
      process.stdout.write(JSON.stringify({ schemaVersion: report.schemaVersion, status: report.status, reason: report.reason || null, archiveSha256: report.archive?.sha256 || null, cleanup: report.cleanup }, null, 2) + '\n');
    } catch {
      report.status = 'FAIL';
      report.reason = 'RESTORE_REPORT_WRITE_FAILED';
    }
    if (report.status !== 'PASS') process.exitCode = 1;
  }
  if (primaryError) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('POSTGRES_LOGICAL_RESTORE_DRILL_UNEXPECTED_FAILURE\n');
    process.exitCode = 1;
  });
}

module.exports = {
  SOURCE_DATABASE,
  TARGET_DATABASE,
  REQUIRED_EXTENSIONS,
  parseLocalDatabaseUrl,
  buildPgPassLine,
  filterExtensionToc,
  stableJson
};
