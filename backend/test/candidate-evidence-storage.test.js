'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isHeldProductionCandidate,
  candidateEvidenceStorageRoot,
  resolveEvidenceStorageRoot,
  cleanupCandidateEvidenceStorage
} = require('../src/candidate-evidence-storage');

function candidateEnv(overrides = {}) {
  return {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_PRODUCTION_CANDIDATE_MODE: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'a'.repeat(64),
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'false',
    OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'false',
    ...overrides
  };
}

test('only an exact held, token-bound unaliased Production candidate gets ephemeral evidence storage', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-candidate-storage-'));
  try {
    const env = candidateEnv();
    assert.equal(isHeldProductionCandidate(env), true);
    const root = candidateEvidenceStorageRoot(env, temp);
    assert.ok(root.startsWith(path.join(temp, 'opscore-candidate-evidence') + path.sep));
    assert.equal(resolveEvidenceStorageRoot(env, temp), root);

    const otherDeployment = candidateEvidenceStorageRoot({
      ...env,
      VERCEL_URL: 'opscore-platform-candidate456-mosamiryamany-1692.vercel.app'
    }, temp);
    assert.notEqual(otherDeployment, root);

    const denied = [
      { ...env, VERCEL_ENV: 'preview' },
      { ...env, OPSC_PRODUCTION_HOLD: 'false' },
      { ...env, OPSC_RELEASE_VERIFIED: 'true' },
      { ...env, OPSC_PRODUCTION_CANDIDATE_MODE: 'false' },
      { ...env, OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'false' },
      { ...env, OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: '' },
      { ...env, OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'false' },
      { ...env, OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED: 'true' },
      { ...env, OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED: 'true' },
      { ...env, VERCEL_URL: 'opscore-platform.vercel.app' }
    ];
    for (const item of denied) {
      assert.equal(isHeldProductionCandidate(item), false);
      assert.equal(candidateEvidenceStorageRoot(item, temp), null);
    }
    assert.equal(
      resolveEvidenceStorageRoot({ ...env, OPSC_PRODUCTION_CANDIDATE_MODE: 'false' }, temp),
      path.resolve('./data/files')
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('candidate evidence cleanup removes only that deployment directory and verifies zero residue', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-candidate-storage-cleanup-'));
  try {
    const env = candidateEnv();
    const root = candidateEvidenceStorageRoot(env, temp);
    const sibling = path.join(path.dirname(root), 'unrelated-deployment');
    fs.mkdirSync(path.join(root, 'tenant', '.evidence', 'upl_test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tenant', '.evidence', 'upl_test', 'chunk-0.bin'), 'synthetic');
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'keep.txt'), 'retain');

    assert.deepEqual(cleanupCandidateEvidenceStorage(env, temp), { status: 'PASS', residue: 0 });
    assert.equal(fs.existsSync(root), false);
    assert.equal(fs.readFileSync(path.join(sibling, 'keep.txt'), 'utf8'), 'retain');
    assert.throws(
      () => cleanupCandidateEvidenceStorage({ ...env, OPSC_PRODUCTION_HOLD: 'false' }, temp),
      /CANDIDATE_EVIDENCE_STORAGE_ENV_NOT_AUTHORIZED/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
