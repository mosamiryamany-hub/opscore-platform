'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPublicReleaseProof, hasVerifiedProductionRelease } = require('../src/release-proof');

const SHA = 'bbbee88e34a9b7e1847571367904fa96a3166bcc';
const SHA256_COMMIT = '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1';
const PACKAGE_SHA = 'a'.repeat(64);
const EVIDENCE_SHA = 'b'.repeat(64);
const fixedNow = () => new Date('2026-10-23T00:00:00.000Z');

function productionAcceptanceEvidence(commit = SHA, pipelineId = '2978538209', overrides = {}) {
  return {
    schemaVersion: 'opscore.production-acceptance.v1',
    status: 'PASS',
    environment: 'production',
    databaseEngine: 'postgres',
    sourceCommit: commit,
    pipelineId,
    testedAt: '2026-10-23T00:00:00.000Z',
    checks: {
      migration053: 'PASS',
      tenantSessionIsolation: 'PASS',
      crossTenantAccessDenied: 'PASS',
      recoveryRestore: 'PASS',
      backupIntegrity: 'PASS'
    },
    tenantTableCoverage: { status: 'PASS', totalTables: 17, testedTables: 17 },
    apiRouteCoverage: { status: 'PASS', totalRoutes: 12, testedRoutes: 12 },
    runtimeRole: {
      name: 'opscore_runtime',
      login: true,
      superuser: false,
      bypassRls: false,
      createRole: false,
      createDatabase: false,
      elevatedMembershipCount: 0
    },
    ...overrides
  };
}

function writeJsonEvidence(dir, filename, value) {
  const filePath = path.join(dir, filename);
  const raw = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(filePath, raw);
  return {
    path: filePath,
    sha256: crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
  };
}

function postgresHttpEvidence(commit, pipelineId) {
  return {
    schemaVersion: 'opscore.postgres-http-acceptance.v1',
    status: 'PASS',
    generatedAt: '2026-10-23T00:00:00.000Z',
    commit,
    pipelineId: Number(pipelineId)
  };
}

function deploymentEnv(extra = {}) {
  return {
    VERCEL_GIT_COMMIT_SHA: SHA,
    VERCEL_GIT_COMMIT_REF: 'main',
    VERCEL_GIT_PROVIDER: 'github',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production',
    ...extra
  };
}

test('release proof binds source and CI evidence to the running deployment commit', () => {
  const proof = createPublicReleaseProof(deploymentEnv(), fixedNow);
  assert.equal(proof.sourceCommit, SHA);
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.value, null);
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('release proof accepts production acceptance only when the embedded JSON hash and exact CI identity match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-acceptance-'));
  try {
    const evidence = writeJsonEvidence(dir, 'production-acceptance.json', productionAcceptanceEvidence(SHA, '2978538209'));
    const proof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: evidence.sha256
    }), fixedNow, undefined, evidence.path);
    assert.equal(proof.status, 'UNVERIFIED');
    assert.equal(proof.releaseTag, null);
    assert.equal(proof.sourceCommitIdentitySource, 'unverified');
    assert.equal(proof.ci.status, 'PASS');
    assert.equal(proof.ci.pipelineId, 2978538209);
    assert.equal(proof.packageFingerprint.status, 'PUBLISHED');
    assert.equal(proof.packageFingerprint.value, PACKAGE_SHA);
    assert.equal(proof.productionAcceptance.status, 'PASS');
    assert.equal(proof.gates.productionSessionTenantBoundary, 'PASS_PRODUCTION');
    assert.equal(proof.gates.productionRecoveryBundle, 'PASS_PRODUCTION');
    assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
    assert.equal(proof.gates.mobileStoreArtifacts, 'REMAINING_BUYER');
    assert.equal(proof.productionAcceptance.evidenceSha256, evidence.sha256);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release proof accepts a SHA-256 source commit but does not certify it without embedded build identity', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    VERCEL_GIT_COMMIT_SHA: SHA256_COMMIT,
    OPSC_RELEASE_CI_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_CI_PIPELINE_ID: '2984327380',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA
  }), fixedNow);
  assert.equal(proof.sourceCommit, SHA256_COMMIT);
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.ci.status, 'PASS');
  assert.equal(proof.ci.pipelineId, 2984327380);
  assert.equal(proof.packageFingerprint.status, 'PUBLISHED');
  assert.equal(proof.packageFingerprint.sourceCommit, SHA256_COMMIT);
  assert.equal(proof.sourceCommitIdentitySource, 'unverified');
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('release proof does not trust environment-only CLI provenance without embedded build identity', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'github-actions-cli',
    OPSC_RELEASE_CI_REF: 'main',
    VERCEL_GIT_COMMIT_SHA: SHA,
    OPSC_RELEASE_CI_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_CI_PIPELINE_ID: '2986455669',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA256_COMMIT,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA
  }), fixedNow);
  assert.equal(proof.sourceCommit, SHA256_COMMIT);
  assert.equal(proof.status, 'UNVERIFIED');
  assert.equal(proof.sourceCommitIdentitySource, 'unverified');
  assert.equal(proof.deployment.ref, 'main');
});

test('release tag is shown only when an explicit tag value is supplied', () => {
  const proof = createPublicReleaseProof(deploymentEnv({ OPSC_RELEASE_TAG: 'v0.11.62-test' }), fixedNow);
  assert.equal(proof.releaseTag, 'v0.11.62-test');
});

test('release proof rejects a forged evidence digest and incomplete tenant coverage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-production-acceptance-negative-'));
  try {
    const valid = productionAcceptanceEvidence(SHA, '2978538209');
    const validFile = writeJsonEvidence(dir, 'valid.json', valid);
    const forged = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: 'f'.repeat(64)
    }), fixedNow, undefined, validFile.path);
    assert.equal(forged.productionAcceptance.status, 'NOT_VERIFIED');
    assert.equal(forged.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');

    const incomplete = writeJsonEvidence(dir, 'incomplete.json', productionAcceptanceEvidence(SHA, '2978538209', {
      tenantTableCoverage: { status: 'PASS', totalTables: 17, testedTables: 16 }
    }));
    const incompleteProof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: SHA,
      OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
      OPSC_RELEASE_PACKAGE_COMMIT: SHA,
      OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
      OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: incomplete.sha256
    }), fixedNow, undefined, incomplete.path);
    assert.equal(incompleteProof.productionAcceptance.status, 'NOT_VERIFIED');
    assert.equal(incompleteProof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release proof does not grant PASS_PRODUCTION from timestamps alone without evidence SHA-256', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_CI_COMMIT: SHA,
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_RELEASE_PACKAGE_COMMIT: SHA,
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
    OPSC_PRODUCTION_ACCEPTANCE_COMMIT: SHA,
    OPSC_PRODUCTION_ACCEPTANCE_AT: '2026-10-23T00:00:00.000Z'
  }), fixedNow);
  assert.equal(proof.packageFingerprint.status, 'PUBLISHED');
  assert.equal(proof.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
  assert.equal(proof.productionAcceptance.status, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('release proof fails closed when CI, package, or production acceptance belongs to another commit', () => {
  const proof = createPublicReleaseProof(deploymentEnv({
    OPSC_RELEASE_CI_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '2978538209',
    OPSC_RELEASE_PACKAGE_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_PACKAGE_SHA256: PACKAGE_SHA,
    OPSC_PRODUCTION_ACCEPTANCE_COMMIT: '0'.repeat(40),
    OPSC_PRODUCTION_ACCEPTANCE_AT: '2026-10-23T00:00:00.000Z'
  }), fixedNow);
  assert.equal(proof.ci.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.status, 'UNVERIFIED');
  assert.equal(proof.packageFingerprint.value, null);
  assert.equal(proof.gates.productionSessionTenantBoundary, 'NOT_VERIFIED');
  assert.equal(proof.gates.productionRecoveryBundle, 'NOT_VERIFIED');
});

test('release HTML and route no longer contain an old hard-coded source commit or package fingerprint', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'web', 'verify', 'release.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'web', 'verify', 'release.json'), 'utf8');
  assert.doesNotMatch(html, /a3b242ded2faf533e4e7986e331b5ff23f26f97b|cb90978495b384e2d04ad680a09f1cb6ef9e1cfbdd6e58db21cb2811772ea3f1/);
  assert.doesNotMatch(server, /sourceCommit: 'e2f23d0ad1abf64e2b3876673a06a6692f61cf6c'|cb90978495b384e2d04ad680a09f1cb6ef9e1cfbdd6e58db21cb2811772ea3f1/);
  assert.match(server, /url\.pathname === '\/verify\/release\.json'/);
  assert.match(manifest, /authoritativeEndpoint/);
});


test('public release proof does not reuse a historical PostgreSQL HTTP PASS for a newer commit', () => {
  const evidencePath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json');
  let originalEvidence = null;
  try {
    originalEvidence = fs.readFileSync(evidencePath, 'utf8');
  } catch {
    originalEvidence = null;
  }

  // Isolate this proof contract from the preceding live acceptance test, which
  // writes its current PASS/FAIL result to the same evidence path during npm test.
  // This fixture must always represent an older successful candidate.
  const historicalEvidence = {
    schemaVersion: 'opscore.postgres-http-acceptance.v1',
    status: 'PASS',
    generatedAt: '2026-10-26T08:09:15.836Z',
    commit: '187f0cf939026032f1934b9d64f03747f17a1bfc89e268e096d9c2c60b260def',
    pipelineId: 2989308452
  };

  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify(historicalEvidence, null, 2) + '\n');
    const proof = createPublicReleaseProof(deploymentEnv({
      OPSC_RELEASE_CI_COMMIT: '345305843292b5773068eb98fa7f4f66ec3048921757e3399337a230b79ec317',
      OPSC_RELEASE_CI_PIPELINE_ID: '3014583826'
    }), fixedNow);
    assert.equal(proof.gates.postgresHttpAcceptance, 'NOT_VERIFIED');
    assert.equal(proof.postgresHttpAcceptance.historicalStatus, 'PASS');
    assert.equal(proof.postgresHttpAcceptance.currentCandidateMatch, false);
  } finally {
    if (originalEvidence === null) {
      try { fs.unlinkSync(evidencePath); } catch {}
    } else {
      fs.writeFileSync(evidencePath, originalEvidence);
    }
  }
});

test('embedded GitHub Actions identity gates production release only with signed same-run evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-vercel-identity-'));
  const identityPath = path.join(dir, 'identity.json');
  const pipelineId = '3014583826';
  const identity = {
    schemaVersion: 'opscore.vercel-release-identity.v1',
    deploymentSource: 'github-actions-cli',
    commitSha: SHA,
    pipelineId,
    runAttempt: 1,
    ref: 'main',
    repository: 'mosamiryamany-hub/opscore-platform',
    runUrl: `https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/${pipelineId}`,
    packageSha256: PACKAGE_SHA,
    packageCommit: SHA
  };
  const acceptance = writeJsonEvidence(dir, 'production-acceptance.json', productionAcceptanceEvidence(SHA, pipelineId));
  const postgresHttp = writeJsonEvidence(dir, 'postgres-http-acceptance.json', postgresHttpEvidence(SHA, pipelineId));
  const staleEnv = deploymentEnv({
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'cli',
    OPSC_RELEASE_CI_COMMIT: '0'.repeat(40),
    OPSC_RELEASE_CI_PIPELINE_ID: '1',
    OPSC_RELEASE_CI_REF: 'old-branch',
    OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: acceptance.sha256,
    OPSC_PRODUCTION_ISOLATION_CERTIFICATION: 'CERTIFIED'
  });
  try {
    fs.writeFileSync(identityPath, JSON.stringify(identity));
    const proof = createPublicReleaseProof(staleEnv, fixedNow, identityPath, acceptance.path, postgresHttp.path);
    assert.equal(proof.sourceCommit, SHA);
    assert.equal(proof.sourceCommitIdentitySource, 'github-actions-cli-assertion');
    assert.equal(proof.deployment.ref, 'main');
    assert.equal(proof.ci.status, 'PASS');
    assert.equal(proof.ci.pipelineUrl, identity.runUrl);
    assert.equal(proof.ci.runAttempt, 1);
    assert.equal(proof.packageFingerprint.status, 'PUBLISHED');
    assert.equal(proof.postgresHttpAcceptance.status, 'PASS');
    assert.equal(proof.productionAcceptance.status, 'PASS');
    assert.equal(proof.gates.productionIsolationCertification, 'CERTIFIED');
    assert.equal(hasVerifiedProductionRelease(staleEnv, identityPath, acceptance.path, postgresHttp.path), true);

    fs.writeFileSync(identityPath, JSON.stringify({ ...identity, commitSha: 'invalid' }));
    assert.equal(hasVerifiedProductionRelease(staleEnv, identityPath, acceptance.path, postgresHttp.path), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
