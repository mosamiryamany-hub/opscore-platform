'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const proof = require('../src/self-hosted-release-proof');

const NOW = new Date('2026-11-24T10:00:00.000Z');
const COMMIT = 'b2ed5a340de31027532aabe73cc0f2e7561fc6b0';
const ARCHIVE = 'a'.repeat(64);
const CERT = 'b'.repeat(64);

function baseIdentity(overrides = {}) {
  const database = Object.assign({
    engine: 'postgres',
    serverVersion: '18.1',
    database: 'opscore',
    runtimeRole: 'opscore_runtime',
    directHost: 'db.buyer.example',
    directConnection: true,
    bypassRls: false,
    superuser: false,
    createRole: false,
    createDb: false
  }, overrides.databaseIdentity || {});
  const identity = Object.assign({
    schemaVersion: proof.SCHEMA_VERSION,
    sourceCommit: COMMIT,
    archiveSha256: ARCHIVE,
    host: 'https://opscore.buyer.example',
    tlsCertificateSha256: CERT,
    databaseIdentity: database,
    generatedAt: '2026-11-24T09:00:00.000Z',
    issuedBy: 'buyer-operator'
  }, overrides);
  identity.databaseIdentity = database;
  delete identity.databaseIdentityOverride;
  identity.attestation = overrides.attestation === undefined
    ? { algorithm: 'sha256', digest: proof.attestationDigest(identity) }
    : overrides.attestation;
  return identity;
}

function reasonsOf(identity, options = {}) {
  return proof.evaluateSelfHostedReleaseIdentity(identity, Object.assign({ now: NOW }, options)).reasons;
}

test('a fully attested buyer-owned identity passes without any Vercel artifact', () => {
  const verdict = proof.evaluateSelfHostedReleaseIdentity(baseIdentity(), { now: NOW });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.gate, 'selfHostedReleaseProof');
  assert.equal(verdict.mode, 'SELF_HOSTED');
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.identity.sourceCommit, COMMIT);
  assert.equal(verdict.identity.database.runtimeRole, 'opscore_runtime');
  assert.equal(verdict.identity.database.directConnection, true);
  assert.ok(!('attestation' in verdict.identity), 'detached attestation must not be echoed back');
});

test('nothing is trusted by default: a non-object identity is NOT_VERIFIED', () => {
  for (const candidate of [null, undefined, 'x', [], 0]) {
    const verdict = proof.evaluateSelfHostedReleaseIdentity(candidate, { now: NOW });
    assert.equal(verdict.status, 'NOT_VERIFIED');
    assert.equal(verdict.identity, null);
    assert.deepEqual(verdict.reasons, ['SELF_HOSTED_IDENTITY_MISSING']);
  }
  // An object with no fields is not "trusted by default": every attested field is reported.
  const empty = proof.evaluateSelfHostedReleaseIdentity({}, { now: NOW });
  assert.equal(empty.status, 'NOT_VERIFIED');
  assert.equal(empty.identity, null);
  assert.ok(empty.reasons.includes('SELF_HOSTED_IDENTITY_SCHEMA_INVALID'));
  assert.ok(empty.reasons.includes('SELF_HOSTED_SOURCE_COMMIT_INVALID'));
  assert.ok(empty.reasons.includes('SELF_HOSTED_ATTESTATION_MISSING'));
  assert.ok(empty.reasons.length >= 5);
});

test('schema, commit, archive and certificate digests are all mandatory and exact', () => {
  assert.deepEqual(reasonsOf(baseIdentity({ schemaVersion: 'v0' })), ['SELF_HOSTED_IDENTITY_SCHEMA_INVALID']);
  assert.deepEqual(reasonsOf(baseIdentity({ sourceCommit: COMMIT.slice(0, 12) })), ['SELF_HOSTED_SOURCE_COMMIT_INVALID']);
  assert.deepEqual(reasonsOf(baseIdentity({ archiveSha256: 'xyz' })), ['SELF_HOSTED_ARCHIVE_SHA256_INVALID']);
  assert.deepEqual(reasonsOf(baseIdentity({ tlsCertificateSha256: '' })), ['SELF_HOSTED_TLS_CERTIFICATE_SHA256_INVALID']);
  assert.deepEqual(reasonsOf(baseIdentity({ issuedBy: '  ' })), ['SELF_HOSTED_IDENTITY_ISSUER_MISSING']);
});

test('the identity must be bound to the commit the operator expects', () => {
  const other = 'c'.repeat(40);
  assert.deepEqual(reasonsOf(baseIdentity(), { expectedCommit: other }), ['SELF_HOSTED_SOURCE_COMMIT_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity(), { expectedCommit: COMMIT }), []);
});

test('plain http, credentials in the origin and non-origin hosts are rejected', () => {
  assert.deepEqual(reasonsOf(baseIdentity({ host: 'http://opscore.buyer.example' })), ['SELF_HOSTED_TLS_REQUIRED']);
  assert.deepEqual(
    reasonsOf(baseIdentity({ host: 'https://user:pass@opscore.buyer.example' })),
    ['SELF_HOSTED_HOST_HAS_CREDENTIALS']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ host: 'https://opscore.buyer.example/app' })),
    ['SELF_HOSTED_HOST_NOT_ORIGIN']
  );
  assert.deepEqual(reasonsOf(baseIdentity({ host: 'not-a-url' })), ['SELF_HOSTED_HOST_INVALID']);
});

test('a runtime role with any elevated attribute fails closed, per flag', () => {
  for (const flag of proof.PRIVILEGE_FLAGS) {
    const identity = baseIdentity({ databaseIdentity: { [flag]: true } });
    assert.deepEqual(
      reasonsOf(identity),
      ['SELF_HOSTED_RUNTIME_ROLE_NOT_LEAST_PRIVILEGE:' + flag],
      flag + ' must be rejected'
    );
  }
});

test('every database attribute is required, including a direct non-pooled connection', () => {
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { engine: 'mysql' } })),
    ['SELF_HOSTED_DATABASE_ENGINE_UNSUPPORTED']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { serverVersion: 'unknown' } })),
    ['SELF_HOSTED_DATABASE_VERSION_INVALID']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { database: '' } })),
    ['SELF_HOSTED_DATABASE_NAME_MISSING']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { runtimeRole: '' } })),
    ['SELF_HOSTED_RUNTIME_ROLE_MISSING']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { directHost: '' } })),
    ['SELF_HOSTED_DATABASE_HOST_INVALID']
  );
  assert.deepEqual(
    reasonsOf(baseIdentity({ databaseIdentity: { directConnection: false } })),
    ['SELF_HOSTED_DIRECT_CONNECTION_NOT_CONFIRMED']
  );
});

test('stale and future-dated identities are rejected', () => {
  assert.ok(reasonsOf(baseIdentity({ generatedAt: '2026-11-01T00:00:00.000Z' })).includes('SELF_HOSTED_IDENTITY_STALE'));
  assert.ok(reasonsOf(baseIdentity({ generatedAt: '2026-11-26T00:00:00.000Z' })).includes('SELF_HOSTED_IDENTITY_FROM_FUTURE'));
  assert.deepEqual(reasonsOf(baseIdentity({ generatedAt: 'not-a-date' })), ['SELF_HOSTED_IDENTITY_TIMESTAMP_INVALID']);
  assert.deepEqual(
    reasonsOf(baseIdentity(), { maxAgeSeconds: 86400 * 365 }),
    [],
    'a wider operator window must accept an older identity'
  );
});

test('the detached attestation must exist, use sha256, and match the payload', () => {
  const noAttestation = baseIdentity();
  delete noAttestation.attestation;
  assert.deepEqual(reasonsOf(noAttestation), ['SELF_HOSTED_ATTESTATION_MISSING']);
  assert.deepEqual(
    reasonsOf(baseIdentity({ attestation: { algorithm: 'md5', digest: 'x' } })),
    ['SELF_HOSTED_ATTESTATION_ALGORITHM_UNSUPPORTED']
  );
  const tampered = baseIdentity();
  tampered.archiveSha256 = 'd'.repeat(64);
  assert.deepEqual(reasonsOf(tampered), ['SELF_HOSTED_ATTESTATION_MISMATCH']);
});

test('a widened max age never lets a wrong digest through', () => {
  const identity = baseIdentity({ generatedAt: '2020-01-01T00:00:00.000Z' });
  identity.archiveSha256 = 'e'.repeat(64);
  const reasons = reasonsOf(identity, { maxAgeSeconds: 86400 * 3650 });
  assert.deepEqual(reasons, ['SELF_HOSTED_ATTESTATION_MISMATCH']);
});

test('a missing identity file yields an explicit NOT_VERIFIED proof, never a silent PASS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const missing = path.join(dir, 'absent.json');
  const result = proof.createSelfHostedReleaseProof({ OPSC_SELF_HOSTED_IDENTITY_PATH: missing }, { now: NOW });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.platform, 'self-hosted');
  assert.equal(result.deploymentBinding, 'NONE_REQUIRED');
  assert.deepEqual(result.reasons, ['SELF_HOSTED_IDENTITY_FILE_MISSING']);
});

test('the proof reads a real file and binds it to the expected production commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const target = path.join(dir, 'identity.json');
  fs.writeFileSync(target, JSON.stringify(baseIdentity(), null, 2));
  const ok = proof.createSelfHostedReleaseProof(
    { OPSC_SELF_HOSTED_IDENTITY_PATH: target, OPSC_SOURCE_COMMIT_SHA: COMMIT },
    { now: NOW }
  );
  assert.equal(ok.status, 'PASS');
  assert.equal(ok.identity.sourceCommit, COMMIT);
  assert.equal(ok.deploymentBinding, 'NONE_REQUIRED');

  const drifted = proof.createSelfHostedReleaseProof(
    { OPSC_SELF_HOSTED_IDENTITY_PATH: target, OPSC_SOURCE_COMMIT_SHA: 'f'.repeat(40) },
    { now: NOW }
  );
  assert.equal(drifted.status, 'NOT_VERIFIED');
  assert.deepEqual(drifted.reasons, ['SELF_HOSTED_SOURCE_COMMIT_MISMATCH']);
});

test('the self-hosted proof requires no Vercel variable at all', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const target = path.join(dir, 'identity.json');
  fs.writeFileSync(target, JSON.stringify(baseIdentity(), null, 2));
  const emptyEnv = { OPSC_SELF_HOSTED_IDENTITY_PATH: target };
  assert.equal(proof.createSelfHostedReleaseProof(emptyEnv, { now: NOW }).status, 'PASS');
  assert.equal(emptyEnv.VERCEL_ENV, undefined);
  assert.equal(emptyEnv.VERCEL_URL, undefined);
});
