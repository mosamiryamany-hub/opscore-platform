'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const proof = require('../src/self-hosted-release-proof');
const identityScript = require('../scripts/self-hosted-release-identity');

const NOW = new Date('2026-11-24T10:00:00.000Z');
const COMMIT = '71c2a0b99585efd603afcc7b6c5be82289ce2c00';
const ARCHIVE = 'a'.repeat(64);
const CERT = 'b'.repeat(64);
const KEY_ID = 'buyer-test-ed25519';
const keyPair = crypto.generateKeyPairSync('ed25519');
const PRIVATE_KEY = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUBLIC_KEY = keyPair.publicKey.export({ type: 'spki', format: 'pem' });

function signIdentity(identity, privateKey = PRIVATE_KEY, keyId = KEY_ID) {
  const key = crypto.createPrivateKey(privateKey);
  const signature = crypto.sign(null, proof.attestationPayload(identity, keyId), key).toString('base64');
  identity.attestation = { algorithm: 'ed25519', keyId, signature };
  return identity;
}

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
  delete identity.attestation;
  return signIdentity(identity);
}

function reasonsOf(identity, options = {}) {
  return proof.evaluateSelfHostedReleaseIdentity(identity, Object.assign({
    now: NOW,
    trustedPublicKey: PUBLIC_KEY,
    expectedKeyId: KEY_ID
  }, options)).reasons;
}

test('a trusted Ed25519-signed buyer identity passes without any Vercel artifact', () => {
  const verdict = proof.evaluateSelfHostedReleaseIdentity(baseIdentity(), {
    now: NOW, trustedPublicKey: PUBLIC_KEY, expectedKeyId: KEY_ID
  });
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.gate, 'selfHostedReleaseProof');
  assert.equal(verdict.mode, 'SELF_HOSTED');
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.identity.sourceCommit, COMMIT);
  assert.equal(verdict.identity.database.runtimeRole, 'opscore_runtime');
  assert.equal(verdict.identity.database.directConnection, true);
  assert.deepEqual(verdict.attestation, { algorithm: 'ed25519', keyId: KEY_ID, verified: true });
  assert.ok(!('signature' in verdict.identity), 'signature must not be echoed in the public result');
});

test('nothing is trusted by default: a non-object identity is NOT_VERIFIED', () => {
  for (const candidate of [null, undefined, 'x', [], 0]) {
    const verdict = proof.evaluateSelfHostedReleaseIdentity(candidate, { now: NOW, trustedPublicKey: PUBLIC_KEY });
    assert.equal(verdict.status, 'NOT_VERIFIED');
    assert.equal(verdict.identity, null);
    assert.deepEqual(verdict.reasons, ['SELF_HOSTED_IDENTITY_MISSING']);
  }
  const empty = proof.evaluateSelfHostedReleaseIdentity({}, { now: NOW, trustedPublicKey: PUBLIC_KEY });
  assert.equal(empty.status, 'NOT_VERIFIED');
  assert.equal(empty.identity, null);
  assert.ok(empty.reasons.includes('SELF_HOSTED_IDENTITY_SCHEMA_INVALID'));
  assert.ok(empty.reasons.includes('SELF_HOSTED_SOURCE_COMMIT_INVALID'));
  assert.ok(empty.reasons.includes('SELF_HOSTED_ATTESTATION_MISSING'));
  assert.ok(empty.reasons.length >= 5);
});

test('schema, commit, archive and certificate digests are all mandatory and exact', () => {
  assert.deepEqual(reasonsOf(baseIdentity({ schemaVersion: 'v0' })), ['SELF_HOSTED_IDENTITY_SCHEMA_INVALID', 'SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity({ sourceCommit: COMMIT.slice(0, 12) })), ['SELF_HOSTED_SOURCE_COMMIT_INVALID', 'SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity({ archiveSha256: 'xyz' })), ['SELF_HOSTED_ARCHIVE_SHA256_INVALID', 'SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity({ tlsCertificateSha256: '' })), ['SELF_HOSTED_TLS_CERTIFICATE_SHA256_INVALID', 'SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity({ issuedBy: '  ' })), ['SELF_HOSTED_IDENTITY_ISSUER_MISSING', 'SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
});

test('the identity must be bound to the commit the operator expects', () => {
  const other = 'c'.repeat(40);
  assert.deepEqual(reasonsOf(baseIdentity(), { expectedCommit: other }), ['SELF_HOSTED_SOURCE_COMMIT_MISMATCH']);
  assert.deepEqual(reasonsOf(baseIdentity(), { expectedCommit: COMMIT }), []);
});

test('plain http, credentials in the origin and non-origin hosts are rejected', () => {
  assert.ok(reasonsOf(baseIdentity({ host: 'http://opscore.buyer.example' })).includes('SELF_HOSTED_TLS_REQUIRED'));
  assert.ok(reasonsOf(baseIdentity({ host: 'https://user:pass@opscore.buyer.example' })).includes('SELF_HOSTED_HOST_HAS_CREDENTIALS'));
  assert.ok(reasonsOf(baseIdentity({ host: 'https://opscore.buyer.example/app' })).includes('SELF_HOSTED_HOST_NOT_ORIGIN'));
  assert.ok(reasonsOf(baseIdentity({ host: 'not-a-url' })).includes('SELF_HOSTED_HOST_INVALID'));
});

test('a runtime role with any elevated attribute fails closed, per flag', () => {
  for (const flag of proof.PRIVILEGE_FLAGS) {
    const reasons = reasonsOf(baseIdentity({ databaseIdentity: { [flag]: true } }));
    assert.ok(reasons.includes('SELF_HOSTED_RUNTIME_ROLE_NOT_LEAST_PRIVILEGE:' + flag), flag + ' must be rejected');
  }
});

test('every database attribute is required, including a direct non-pooled connection', () => {
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { engine: 'mysql' } })).includes('SELF_HOSTED_DATABASE_ENGINE_UNSUPPORTED'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { serverVersion: 'unknown' } })).includes('SELF_HOSTED_DATABASE_VERSION_INVALID'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { serverVersion: '18.1x' } })).includes('SELF_HOSTED_DATABASE_VERSION_INVALID'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { database: '' } })).includes('SELF_HOSTED_DATABASE_NAME_MISSING'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { runtimeRole: '' } })).includes('SELF_HOSTED_RUNTIME_ROLE_MISSING'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { directHost: '' } })).includes('SELF_HOSTED_DATABASE_HOST_INVALID'));
  assert.ok(reasonsOf(baseIdentity({ databaseIdentity: { directConnection: false } })).includes('SELF_HOSTED_DIRECT_CONNECTION_NOT_CONFIRMED'));
});

test('stale and future-dated identities are rejected', () => {
  assert.ok(reasonsOf(baseIdentity({ generatedAt: '2026-11-01T00:00:00.000Z' })).includes('SELF_HOSTED_IDENTITY_STALE'));
  assert.ok(reasonsOf(baseIdentity({ generatedAt: '2026-11-26T00:00:00.000Z' })).includes('SELF_HOSTED_IDENTITY_FROM_FUTURE'));
  assert.ok(reasonsOf(baseIdentity({ generatedAt: 'not-a-date' })).includes('SELF_HOSTED_IDENTITY_TIMESTAMP_INVALID'));
  assert.deepEqual(reasonsOf(baseIdentity(), { maxAgeSeconds: 86400 * 365 }), []);
});

test('SHA-only or missing signatures are never accepted as authentic', () => {
  const noSignature = baseIdentity();
  delete noSignature.attestation;
  assert.deepEqual(reasonsOf(noSignature), ['SELF_HOSTED_ATTESTATION_MISSING']);
  const oldDigestOnly = baseIdentity();
  oldDigestOnly.attestation = { algorithm: 'sha256', digest: 'a'.repeat(64) };
  assert.deepEqual(reasonsOf(oldDigestOnly), ['SELF_HOSTED_ATTESTATION_ALGORITHM_UNSUPPORTED']);
});

test('signature verification requires the configured trust key and matching key id', () => {
  const identity = baseIdentity();
  assert.deepEqual(
    proof.evaluateSelfHostedReleaseIdentity(identity, { now: NOW }).reasons,
    ['SELF_HOSTED_ATTESTATION_TRUST_KEY_MISSING']
  );
  assert.deepEqual(
    reasonsOf(identity, { expectedKeyId: 'different-key' }),
    ['SELF_HOSTED_ATTESTATION_KEY_ID_MISMATCH']
  );
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.deepEqual(
    reasonsOf(identity, { trustedPublicKey: other }),
    ['SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']
  );
});

test('tampering with any signed field invalidates the signature', () => {
  const identity = baseIdentity();
  identity.archiveSha256 = 'd'.repeat(64);
  assert.deepEqual(reasonsOf(identity), ['SELF_HOSTED_ATTESTATION_SIGNATURE_MISMATCH']);
});

test('invalid signature encodings and non-Ed25519 trust keys fail closed', () => {
  const malformed = baseIdentity();
  malformed.attestation.signature = 'not-base64!';
  assert.deepEqual(reasonsOf(malformed), ['SELF_HOSTED_ATTESTATION_SIGNATURE_INVALID']);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.deepEqual(reasonsOf(baseIdentity(), { trustedPublicKey: rsa }), ['SELF_HOSTED_ATTESTATION_TRUST_KEY_TYPE_INVALID']);
});

test('the identity script creates a signed document using a supplied private key', () => {
  const partial = baseIdentity();
  delete partial.attestation;
  const built = identityScript.buildIdentity(partial, PRIVATE_KEY, KEY_ID);
  assert.deepEqual(reasonsOf(built), []);
  assert.throws(() => identityScript.buildIdentity(partial, null, KEY_ID), /PRIVATE_KEY_REQUIRED/);
});

test('a missing identity file yields an explicit NOT_VERIFIED proof, never a silent PASS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const missing = path.join(dir, 'absent.json');
  const result = proof.createSelfHostedReleaseProof({
    OPSC_SELF_HOSTED_IDENTITY_PATH: missing,
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: PUBLIC_KEY,
    OPSC_SELF_HOSTED_ATTESTATION_KEY_ID: KEY_ID
  }, { now: NOW });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.platform, 'self-hosted');
  assert.equal(result.deploymentBinding, 'NONE_REQUIRED');
  assert.deepEqual(result.reasons, ['SELF_HOSTED_IDENTITY_FILE_MISSING']);
});

test('the proof reads a signed file and binds it to the expected source commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const target = path.join(dir, 'identity.json');
  fs.writeFileSync(target, JSON.stringify(baseIdentity(), null, 2));
  const ok = proof.createSelfHostedReleaseProof({
    OPSC_SELF_HOSTED_IDENTITY_PATH: target,
    OPSC_SOURCE_COMMIT_SHA: COMMIT,
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: PUBLIC_KEY,
    OPSC_SELF_HOSTED_ATTESTATION_KEY_ID: KEY_ID
  }, { now: NOW });
  assert.equal(ok.status, 'PASS');
  assert.equal(ok.identity.sourceCommit, COMMIT);
  assert.equal(ok.deploymentBinding, 'NONE_REQUIRED');

  const drifted = proof.createSelfHostedReleaseProof({
    OPSC_SELF_HOSTED_IDENTITY_PATH: target,
    OPSC_SOURCE_COMMIT_SHA: 'f'.repeat(40),
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: PUBLIC_KEY,
    OPSC_SELF_HOSTED_ATTESTATION_KEY_ID: KEY_ID
  }, { now: NOW });
  assert.equal(drifted.status, 'NOT_VERIFIED');
  assert.deepEqual(drifted.reasons, ['SELF_HOSTED_SOURCE_COMMIT_MISMATCH']);
});

test('the self-hosted proof requires no Vercel variable at all', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-selfhosted-'));
  const target = path.join(dir, 'identity.json');
  fs.writeFileSync(target, JSON.stringify(baseIdentity(), null, 2));
  const env = {
    OPSC_SELF_HOSTED_IDENTITY_PATH: target,
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: PUBLIC_KEY,
    OPSC_SELF_HOSTED_ATTESTATION_KEY_ID: KEY_ID
  };
  assert.equal(proof.createSelfHostedReleaseProof(env, { now: NOW }).status, 'PASS');
  assert.equal(env.VERCEL_ENV, undefined);
  assert.equal(env.VERCEL_URL, undefined);
});
