'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const API_ORIGIN = 'https://api.vercel.com';
const BASELINE_KEYS = Object.freeze([
  'OPSC_PRODUCTION_HOLD',
  'OPSC_RELEASE_VERIFIED',
  'OPSC_PRODUCTION_ISOLATION_CERTIFICATION',
  'OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE',
  'OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256',
  'OPSC_PRODUCTION_NEON_BRANCH_ID',
  'OPSC_RELEASE_CI_COMMIT',
  'OPSC_RELEASE_CI_PIPELINE_ID',
  'OPSC_RELEASE_CI_REF',
  'OPSC_SOURCE_COMMIT_SHA',
  'OPSC_RELEASE_DEPLOYMENT_SOURCE',
  'OPSC_RELEASE_PACKAGE_SHA256',
  'OPSC_RELEASE_PACKAGE_COMMIT',
  'OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED',
  'OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED',
  'OPSC_REQUIRE_SIGNED_TENANT_CONTEXT',
  'OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID'
]);
const CANDIDATE_KEYS = Object.freeze([
  'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED',
  'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN',
  'OPSC_PRODUCTION_CANDIDATE_MODE'
]);
const FAIL_CLOSED_VALUES = Object.freeze({
  OPSC_PRODUCTION_HOLD: 'true',
  OPSC_RELEASE_VERIFIED: 'false',
  OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'NOT_CERTIFIED',
  OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'false',
  OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'false',
  OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'false',
  OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true'
});

function parseEnvFile(content) {
  const result = new Map();
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/\\'/g, "'");
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    result.set(match[1], String(value));
  }
  return result;
}

function defaultSnapshotPath(env = process.env) {
  return String(env.OPSC_PRODUCTION_ENV_SNAPSHOT_PATH || path.join(env.RUNNER_TEMP || os.tmpdir(), 'opscore-production-env-baseline.json'));
}

function writeOutput(env, key, value) {
  const output = String(env.GITHUB_OUTPUT || '').trim();
  if (!output) throw new Error('GITHUB_OUTPUT_REQUIRED');
  fs.appendFileSync(output, key + '=' + String(value) + '\n', { encoding: 'utf8', mode: 0o600 });
}

async function apiRequest(method, pathname, body, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) throw new Error('VERCEL_TOKEN_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new Error('VERCEL_FETCH_UNAVAILABLE');
  const response = await fetchImpl(API_ORIGIN + pathname, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('VERCEL_ENV_API_' + method + '_' + response.status);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('VERCEL_ENV_API_RESPONSE_INVALID'); }
}

function projectPath(env) {
  const projectId = String(env.VERCEL_PROJECT_ID || '').trim();
  const teamId = String(env.VERCEL_ORG_ID || env.VERCEL_TEAM_ID || '').trim();
  if (!projectId || !teamId) throw new Error('VERCEL_PROJECT_AND_TEAM_REQUIRED');
  return '/v9/projects/' + encodeURIComponent(projectId) + '/env?teamId=' + encodeURIComponent(teamId) + '&limit=100';
}

async function listProjectEnvs(options = {}) {
  const env = options.env || process.env;
  const payload = await apiRequest('GET', projectPath(env), null, options);
  const envs = Array.isArray(payload.envs) ? payload.envs : [];
  if (payload.pagination && payload.pagination.next) throw new Error('VERCEL_ENV_LIST_PAGINATION_UNSUPPORTED');
  return envs;
}

function productionHits(envs, key) {
  return envs.filter(item => item && item.key === key && Array.isArray(item.target) && item.target.includes('production'));
}

async function upsertProductionEnv(key, value, type = 'encrypted', options = {}) {
  const env = options.env || process.env;
  const projectId = encodeURIComponent(String(env.VERCEL_PROJECT_ID || '').trim());
  const teamId = encodeURIComponent(String(env.VERCEL_ORG_ID || env.VERCEL_TEAM_ID || '').trim());
  if (!projectId || !teamId) throw new Error('VERCEL_PROJECT_AND_TEAM_REQUIRED');
  const envs = await listProjectEnvs(options);
  const hits = productionHits(envs, key);
  const body = { key, value: String(value), type, target: ['production'] };
  if (hits.length > 1) throw new Error('VERCEL_PRODUCTION_ENV_DUPLICATE:' + key);
  if (hits.length === 1) {
    await apiRequest('PATCH', '/v9/projects/' + projectId + '/env/' + encodeURIComponent(hits[0].id) + '?teamId=' + teamId, body, options);
  } else {
    await apiRequest('POST', '/v10/projects/' + projectId + '/env?teamId=' + teamId, body, options);
  }
}

async function deleteProductionEnv(key, options = {}) {
  const env = options.env || process.env;
  const projectId = encodeURIComponent(String(env.VERCEL_PROJECT_ID || '').trim());
  const teamId = encodeURIComponent(String(env.VERCEL_ORG_ID || env.VERCEL_TEAM_ID || '').trim());
  const envs = await listProjectEnvs(options);
  const hits = productionHits(envs, key);
  if (hits.length > 1) throw new Error('VERCEL_PRODUCTION_ENV_DUPLICATE:' + key);
  if (hits.length === 1) {
    await apiRequest('DELETE', '/v9/projects/' + projectId + '/env/' + encodeURIComponent(hits[0].id) + '?teamId=' + teamId, null, options);
  }
}

function createBaselineSnapshot(parsed, envs) {
  const entries = {};
  for (const key of BASELINE_KEYS) {
    const hits = productionHits(envs, key);
    if (hits.length > 1) throw new Error('VERCEL_PRODUCTION_ENV_DUPLICATE:' + key);
    if (hits.length === 0) {
      if (parsed.has(key)) throw new Error('VERCEL_ENV_PULL_API_MISMATCH:' + key);
      entries[key] = { present: false };
      continue;
    }
    if (!parsed.has(key)) throw new Error('VERCEL_ENV_PULL_VALUE_MISSING:' + key);
    entries[key] = { present: true, value: parsed.get(key), type: hits[0].type || 'encrypted' };
  }
  return { schemaVersion: 'opscore.production-candidate-env-snapshot.v1', capturedAt: new Date().toISOString(), entries };
}

function validateInitialState(snapshot) {
  const value = key => snapshot.entries[key] && snapshot.entries[key].present
    ? snapshot.entries[key].value : undefined;
  // Re-entry is based on coherent hold/release state, never the legacy
  // OPSC_PRODUCTION_ISOLATION_CERTIFICATION text value. Public certification
  // is derived from evidence bound to the current VERCEL_DEPLOYMENT_ID.
  if (value('OPSC_RELEASE_VERIFIED') === 'true' || value('OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE') === 'true') {
    const coherent = value('OPSC_PRODUCTION_HOLD') === 'false'
      && value('OPSC_RELEASE_VERIFIED') === 'true'
      && value('OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE') === 'true';
    if (!coherent) throw new Error('PRODUCTION_CERTIFIED_BASELINE_INCOHERENT');
    return;
  }
  if (value('OPSC_PRODUCTION_HOLD') !== 'false') throw new Error('PRODUCTION_HOLD_BASELINE_NOT_FALSE');
  if (value('OPSC_RELEASE_VERIFIED') !== 'false') throw new Error('PRODUCTION_RELEASE_BASELINE_NOT_FALSE');
  if (value('OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE') !== 'false') throw new Error('PRODUCTION_BEHAVIORAL_BASELINE_NOT_FALSE');
  for (const key of ['OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED', 'OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED']) {
    if (value(key) === 'true') throw new Error('PRODUCTION_SIGNED_CONTEXT_FEATURE_ALREADY_ENABLED:' + key);
  }
  if (snapshot.entries.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID.present) throw new Error('STALE_PRODUCTION_PROBE_DEPLOYMENT_ID_PRESENT');
}

async function prepare(options = {}) {
  const env = options.env || process.env;
  const envFile = String(env.VERCEL_PRODUCTION_ENV_FILE || '.vercel/.env.production.local');
  const snapshotPath = defaultSnapshotPath(env);
  const text = options.envFileContents === undefined ? fs.readFileSync(envFile, 'utf8') : options.envFileContents;
  const parsed = parseEnvFile(text);
  const envs = await listProjectEnvs(options);
  for (const key of CANDIDATE_KEYS) {
    if (productionHits(envs, key).length) throw new Error('CANDIDATE_ENV_ALREADY_PRESENT:' + key);
  }
  const snapshot = createBaselineSnapshot(parsed, envs);
  validateInitialState(snapshot);
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  writeOutput(env, 'snapshot_path', snapshotPath);
  const probeToken = crypto.randomBytes(32).toString('hex');
  const output = String(env.GITHUB_OUTPUT || '').trim();
  if (!output) throw new Error('GITHUB_OUTPUT_REQUIRED');
  fs.appendFileSync(output, 'probe_token=' + probeToken + '\n', { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('::add-mask::' + probeToken + '\n');

  for (const [key, value] of Object.entries(FAIL_CLOSED_VALUES)) {
    await upsertProductionEnv(key, value, 'plain', options);
  }
  await upsertProductionEnv('OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED', 'true', 'plain', options);
  await upsertProductionEnv('OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN', probeToken, 'sensitive', options);
  await upsertProductionEnv('OPSC_PRODUCTION_CANDIDATE_MODE', 'true', 'plain', options);

  // Fail closed if Production env API does not retain candidate probe flags after upsert.
  const after = await listProjectEnvs(options);
  for (const key of [
    'OPSC_PRODUCTION_HOLD',
    'OPSC_RELEASE_VERIFIED',
    'OPSC_REQUIRE_SIGNED_TENANT_CONTEXT',
    'OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED',
    'OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED',
    'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED',
    'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN',
    'OPSC_PRODUCTION_CANDIDATE_MODE'
  ]) {
    if (!productionHits(after, key).length) {
      throw new Error('CANDIDATE_ENV_UPSERT_NOT_VISIBLE:' + key);
    }
  }
  process.stdout.write('PRODUCTION_CANDIDATE_ENV_PREPARED=PASS\n');
}

async function publish(options = {}) {
  const env = options.env || process.env;
  if (String(env.ISOLATION_CERT || '') !== 'CERTIFIED' || String(env.BEHAVIORAL || '') !== 'true') {
    throw new Error('PRODUCTION_BEHAVIORAL_CERTIFICATION_REQUIRED');
  }
  const values = {
    OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: env.OPSC_EVIDENCE_SHA256,
    OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE: 'true',
    OPSC_PRODUCTION_NEON_BRANCH_ID: env.OPSC_PRODUCTION_NEON_BRANCH_ID,
    OPSC_RELEASE_VERIFIED: 'true',
    OPSC_RELEASE_CI_COMMIT: env.GITHUB_SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: env.GITHUB_RUN_ID,
    OPSC_RELEASE_CI_REF: 'main',
    OPSC_SOURCE_COMMIT_SHA: env.GITHUB_SHA,
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'github-actions-cli',
    OPSC_RELEASE_PACKAGE_SHA256: env.OPSC_RELEASE_PACKAGE_SHA256,
    OPSC_RELEASE_PACKAGE_COMMIT: env.GITHUB_SHA,
    OPSC_PRODUCTION_HOLD: 'false',
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID,
    OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true'
  };
  if (!/^[a-f0-9]{64}$/i.test(String(values.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || ''))
      || !/^[a-f0-9]{40}$/i.test(String(values.OPSC_RELEASE_CI_COMMIT || ''))
      || !/^[1-9][0-9]{0,14}$/.test(String(values.OPSC_RELEASE_CI_PIPELINE_ID || ''))
      || !/^[a-f0-9]{64}$/i.test(String(values.OPSC_RELEASE_PACKAGE_SHA256 || ''))
      || !/^br-[a-z0-9-]{8,80}$/.test(String(values.OPSC_PRODUCTION_NEON_BRANCH_ID || ''))
      || !/^dpl_[A-Za-z0-9]+$/.test(String(values.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || ''))) {
    throw new Error('PRODUCTION_RELEASE_ENV_IDENTITY_INVALID');
  }
  for (const [key, value] of Object.entries(values)) {
    await upsertProductionEnv(key, value, 'encrypted', options);
  }
  for (const key of CANDIDATE_KEYS) await deleteProductionEnv(key, options);
  process.stdout.write('PRODUCTION_CANDIDATE_FLAGS_REMOVED=PASS\n');
  process.stdout.write('PRODUCTION_RELEASE_ENV_PUBLISHED=PASS\n');
}

async function restore(options = {}) {
  const env = options.env || process.env;
  const snapshotPath = defaultSnapshotPath(env);
  if (!fs.existsSync(snapshotPath)) {
    process.stdout.write('PRODUCTION_CANDIDATE_ENV_RESTORE=SKIPPED_NO_SNAPSHOT\n');
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (snapshot.schemaVersion !== 'opscore.production-candidate-env-snapshot.v1'
      || !snapshot.entries || typeof snapshot.entries !== 'object') {
    throw new Error('PRODUCTION_ENV_SNAPSHOT_INVALID');
  }
  for (const key of BASELINE_KEYS) {
    const item = snapshot.entries[key];
    if (!item || item.present !== true) {
      await deleteProductionEnv(key, options);
    } else {
      if (typeof item.value !== 'string') throw new Error('PRODUCTION_ENV_SNAPSHOT_VALUE_INVALID:' + key);
      await upsertProductionEnv(key, item.value, item.type || 'encrypted', options);
    }
  }
  for (const key of CANDIDATE_KEYS) await deleteProductionEnv(key, options);
  process.stdout.write('PRODUCTION_CANDIDATE_ENV_RESTORED=PASS\n');
}

function sanitizeRestoredPull(options = {}) {
  const env = options.env || process.env;
  const snapshotPath = defaultSnapshotPath(env);
  if (!fs.existsSync(snapshotPath)) throw new Error('PRODUCTION_ENV_SNAPSHOT_REQUIRED_FOR_SANITIZE');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (snapshot.schemaVersion !== 'opscore.production-candidate-env-snapshot.v1'
      || !snapshot.entries || typeof snapshot.entries !== 'object') {
    throw new Error('PRODUCTION_ENV_SNAPSHOT_INVALID');
  }

  // Only remove keys that the pre-run snapshot proves were absent from Production,
  // plus the dedicated candidate-only keys. Present baseline values stay untouched.
  const keysToRemove = new Set(CANDIDATE_KEYS);
  for (const key of BASELINE_KEYS) {
    const expected = snapshot.entries[key];
    if (!expected || typeof expected.present !== 'boolean') {
      throw new Error('PRODUCTION_ENV_SNAPSHOT_ENTRY_INVALID:' + key);
    }
    if (expected.present === false) keysToRemove.add(key);
  }

  const envFile = String(env.VERCEL_PRODUCTION_ENV_FILE || '.vercel/.env.production.local');
  const original = options.envFileContents === undefined
    ? fs.readFileSync(envFile, 'utf8')
    : String(options.envFileContents);
  const lines = original.split(/\r?\n/);
  const removed = new Set();
  const sanitized = lines.filter(rawLine => {
    const match = rawLine.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !keysToRemove.has(match[1])) return true;
    removed.add(match[1]);
    return false;
  }).join('\n');

  if (options.envFileContents === undefined) {
    fs.writeFileSync(envFile, sanitized, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(envFile, 0o600);
  }
  const removedKeys = [...removed].sort();
  process.stdout.write('PRODUCTION_ENV_LOCAL_STALE_KEYS_STRIPPED='
    + (removedKeys.length ? removedKeys.join(',') : 'none') + '\n');
  return { status: 'PASS', removedKeys };
}

async function verifyRestored(options = {}) {
  const env = options.env || process.env;
  const snapshotPath = defaultSnapshotPath(env);
  if (!fs.existsSync(snapshotPath)) throw new Error('PRODUCTION_ENV_SNAPSHOT_REQUIRED_FOR_VERIFY');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (snapshot.schemaVersion !== 'opscore.production-candidate-env-snapshot.v1'
      || !snapshot.entries || typeof snapshot.entries !== 'object') {
    throw new Error('PRODUCTION_ENV_SNAPSHOT_INVALID');
  }
  const envFile = String(env.VERCEL_PRODUCTION_ENV_FILE || '.vercel/.env.production.local');
  const envText = options.envFileContents === undefined ? fs.readFileSync(envFile, 'utf8') : options.envFileContents;
  const parsed = parseEnvFile(envText);
  const envs = await listProjectEnvs(options);

  for (const key of BASELINE_KEYS) {
    const expected = snapshot.entries[key];
    if (!expected || typeof expected.present !== 'boolean') {
      throw new Error('PRODUCTION_ENV_SNAPSHOT_ENTRY_INVALID:' + key);
    }
    const hits = productionHits(envs, key);
    if (expected.present === true) {
      if (hits.length !== 1 || typeof expected.value !== 'string') {
        throw new Error('PRODUCTION_ENV_RESTORE_MISMATCH:' + key + ':api-presence');
      }
      const apiType = hits[0].type || 'encrypted';
      if (apiType !== (expected.type || 'encrypted')) {
        throw new Error('PRODUCTION_ENV_RESTORE_MISMATCH:' + key + ':type');
      }
      if (!parsed.has(key)) {
        throw new Error('PRODUCTION_ENV_RESTORE_MISMATCH:' + key + ':local-missing');
      }
      const localValue = parsed.get(key);
      // Vercel may redact non-plain values in a pulled env file. A redaction
      // marker is acceptable only for a non-plain API variable; plain values
      // must match the snapshot exactly.
      if (localValue === '[SENSITIVE]') {
        if (apiType === 'plain') {
          throw new Error('PRODUCTION_ENV_RESTORE_MISMATCH:' + key + ':unexpected-redaction');
        }
      } else if (localValue !== expected.value) {
        throw new Error('PRODUCTION_ENV_RESTORE_MISMATCH:' + key + ':local');
      }
    } else {
      if (hits.length !== 0) {
        throw new Error('PRODUCTION_ENV_RESTORE_UNEXPECTED_KEY:' + key);
      }
      if (parsed.has(key)) {
        throw new Error('PRODUCTION_ENV_RESTORE_UNEXPECTED_LOCAL_KEY:' + key);
      }
    }
  }
  for (const key of CANDIDATE_KEYS) {
    if (productionHits(envs, key).length !== 0) {
      throw new Error('PRODUCTION_CANDIDATE_ENV_NOT_REMOVED:' + key);
    }
    if (parsed.has(key)) {
      throw new Error('PRODUCTION_CANDIDATE_ENV_LOCAL_LEFTOVER:' + key);
    }
  }
  const outputPath = String(env.GITHUB_OUTPUT || '').trim();
  if (outputPath) {
    fs.appendFileSync(outputPath, 'restore_verified=true\n', { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write('PRODUCTION_CANDIDATE_ENV_RESTORE_VERIFIED=PASS\n');
  return { status: 'PASS', baselineKeysVerified: BASELINE_KEYS.length, candidateKeysAbsent: CANDIDATE_KEYS.length };
}

async function main(argv = process.argv.slice(2), options = {}) {
  const mode = String(argv[0] || '').trim();
  if (mode === 'prepare') return prepare(options);
  if (mode === 'publish') return publish(options);
  if (mode === 'restore') return restore(options);
  if (mode === 'sanitize-restored-pull') return sanitizeRestoredPull(options);
  if (mode === 'verify-restored') return verifyRestored(options);
  throw new Error('PRODUCTION_CANDIDATE_ENV_MODE_INVALID');
}

if (require.main === module) {
  main().catch(error => {
    const code = /^[A-Z0-9_:-]{1,200}$/.test(String(error && error.message || ''))
      ? String(error.message) : 'PRODUCTION_CANDIDATE_ENV_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  BASELINE_KEYS,
  CANDIDATE_KEYS,
  FAIL_CLOSED_VALUES,
  parseEnvFile,
  defaultSnapshotPath,
  createBaselineSnapshot,
  validateInitialState,
  apiRequest,
  listProjectEnvs,
  upsertProductionEnv,
  deleteProductionEnv,
  prepare,
  publish,
  restore,
  sanitizeRestoredPull,
  verifyRestored,
  main
};
