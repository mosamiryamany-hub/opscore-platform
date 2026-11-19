'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseEnvFile,
  createBaselineSnapshot,
  validateInitialState,
  prepare,
  restore,
  publish
} = require('../../scripts/production-candidate-environment');

function envFile() {
  return [
    'OPSC_PRODUCTION_HOLD="false"',
    'OPSC_RELEASE_VERIFIED=false',
    'OPSC_PRODUCTION_ISOLATION_CERTIFICATION=NOT_CERTIFIED',
    'OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE=false',
    'OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256=',
    'OPSC_PRODUCTION_NEON_BRANCH_ID=br-proud-salad-bcshhdap',
    'OPSC_RELEASE_CI_COMMIT=',
    'OPSC_RELEASE_CI_PIPELINE_ID=',
    'OPSC_RELEASE_CI_REF=',
    'OPSC_SOURCE_COMMIT_SHA=',
    'OPSC_RELEASE_DEPLOYMENT_SOURCE=',
    'OPSC_RELEASE_PACKAGE_SHA256=',
    'OPSC_RELEASE_PACKAGE_COMMIT=',
    '# signed context defaults may be absent before candidate setup'
  ].join('\n');
}

function makeEnvStore(initial = []) {
  const items = initial.map((item, index) => ({ id: 'env_' + index, ...item }));
  let next = items.length;
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ method: options.method, pathname: parsed.pathname, body: options.body ? JSON.parse(options.body) : null });
    if (options.method === 'GET') {
      return response(200, { envs: items.map(item => ({ ...item })) });
    }
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      items.push({ id: 'env_' + next++, ...body });
      return response(200, items[items.length - 1]);
    }
    const envId = decodeURIComponent(parsed.pathname.split('/').pop());
    const idx = items.findIndex(item => item.id === envId);
    if (idx < 0) return response(404, { error: 'not_found' });
    if (options.method === 'PATCH') {
      Object.assign(items[idx], JSON.parse(options.body));
      return response(200, items[idx]);
    }
    if (options.method === 'DELETE') {
      items.splice(idx, 1);
      return response(200, {});
    }
    return response(405, {});
  };
  return { items, calls, fetchImpl };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('parses only named env assignments and preserves quoted scalar values', () => {
  const parsed = parseEnvFile('# comment\nexport A=true\nB="false"\nC=hello # note\nnot-an-assignment');
  assert.equal(parsed.get('A'), 'true');
  assert.equal(parsed.get('B'), 'false');
  assert.equal(parsed.get('C'), 'hello');
  assert.equal(parsed.has('not-an-assignment'), false);
});

test('baseline snapshot validates a known fail-closed Production state', () => {
  const parsed = parseEnvFile(envFile());
  const envs = [...parsed.keys()].map((key, i) => ({ id: 'id' + i, key, target: ['production'], type: 'encrypted' }));
  const snapshot = createBaselineSnapshot(parsed, envs);
  assert.equal(snapshot.entries.OPSC_PRODUCTION_HOLD.value, 'false');
  assert.equal(snapshot.entries.OPSC_RELEASE_VERIFIED.value, 'false');
  assert.equal(snapshot.entries.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID.present, false);
  assert.doesNotThrow(() => validateInitialState(snapshot));
  const unsafe = { ...snapshot, entries: { ...snapshot.entries, OPSC_RELEASE_VERIFIED: { present: true, value: 'true' } } };
  assert.throws(() => validateInitialState(unsafe), /PRODUCTION_RELEASE_BASELINE_NOT_FALSE/);
});

test('prepare writes a recovery snapshot before fail-closed candidate values and masks its probe token', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-candidate-env-'));
  const output = path.join(tmp, 'github-output');
  fs.writeFileSync(output, '');
  const env = {
    VERCEL_PROJECT_ID: 'prj_123',
    VERCEL_ORG_ID: 'team_123',
    VERCEL_TOKEN: 'not-a-real-token',
    GITHUB_OUTPUT: output,
    RUNNER_TEMP: tmp
  };
  const initial = parseEnvFile(envFile());
  const store = makeEnvStore([...initial.keys()].map((key, index) => ({
    key, value: '', target: ['production'], type: 'encrypted'
  })));
  const result = await prepare({ env, fetchImpl: store.fetchImpl, envFileContents: envFile() });
  const saved = fs.readFileSync(path.join(tmp, 'opscore-production-env-baseline.json'), 'utf8');
  assert.match(saved, /opscore\.production-candidate-env-snapshot\.v1/);
  assert.match(fs.readFileSync(output, 'utf8'), /snapshot_path=/);
  assert.match(fs.readFileSync(output, 'utf8'), /probe_token=[a-f0-9]{64}/);
  assert.equal(store.items.find(x => x.key === 'OPSC_PRODUCTION_HOLD').value, 'true');
  assert.equal(store.items.find(x => x.key === 'OPSC_RELEASE_VERIFIED').value, 'false');
  assert.equal(store.items.find(x => x.key === 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED').value, 'true');
  assert.equal(store.items.find(x => x.key === 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN').type, 'sensitive');
  assert.equal(result, undefined);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('restore returns every snapshotted flag to its prior state and removes all candidate state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-candidate-env-'));
  const env = { VERCEL_PROJECT_ID: 'prj_123', VERCEL_ORG_ID: 'team_123', VERCEL_TOKEN: 'x', RUNNER_TEMP: tmp };
  const initial = parseEnvFile(envFile());
  const store = makeEnvStore([...initial.keys()].map((key, index) => ({
    key, value: '', target: ['production'], type: 'encrypted'
  })));
  const snapshot = createBaselineSnapshot(initial, store.items);
  fs.writeFileSync(path.join(tmp, 'opscore-production-env-baseline.json'), JSON.stringify(snapshot));
  store.items.push({ id: 'candidate', key: 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED', value: 'true', target: ['production'], type: 'encrypted' });
  store.items.push({ id: 'candidate-token', key: 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN', value: 'secret', target: ['production'], type: 'sensitive' });
  await restore({ env, fetchImpl: store.fetchImpl });
  assert.equal(store.items.some(x => x.key === 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED'), false);
  assert.equal(store.items.some(x => x.key === 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN'), false);
  assert.equal(store.items.find(x => x.key === 'OPSC_PRODUCTION_HOLD').value, 'false');
  assert.equal(store.items.find(x => x.key === 'OPSC_RELEASE_VERIFIED').value, 'false');
  assert.equal(store.items.some(x => x.key === 'OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID'), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('publish refuses unbound evidence and removes candidate credentials only after all exact pins validate', async () => {
  const store = makeEnvStore([]);
  const env = {
    VERCEL_PROJECT_ID: 'prj_123',
    VERCEL_ORG_ID: 'team_123',
    VERCEL_TOKEN: 'x',
    OPSC_EVIDENCE_SHA256: 'a'.repeat(64),
    OPSC_PRODUCTION_NEON_BRANCH_ID: 'br-proud-salad-bcshhdap',
    GITHUB_SHA: 'b'.repeat(40),
    GITHUB_RUN_ID: '1234567',
    OPSC_RELEASE_PACKAGE_SHA256: 'c'.repeat(64),
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_Production123'
  };
  await assert.rejects(() => publish({ env: { ...env, OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: '' }, fetchImpl: store.fetchImpl }), /PRODUCTION_RELEASE_ENV_IDENTITY_INVALID/);
  await publish({ env, fetchImpl: store.fetchImpl });
  assert.equal(store.items.find(x => x.key === 'OPSC_PRODUCTION_ISOLATION_CERTIFICATION').value, 'CERTIFIED');
  assert.equal(store.items.find(x => x.key === 'OPSC_RELEASE_VERIFIED').value, 'true');
  assert.equal(store.items.find(x => x.key === 'OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID').value, 'dpl_Production123');
  assert.equal(store.items.find(x => x.key === 'OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED').value, 'true');
  assert.equal(store.items.some(x => x.key === 'OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN'), false);
});
