'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SELF_HOSTED_SCHEMA,
  ROUTER_SCHEMA,
  createPlatformReleaseProof
} = require('../src/platform-release-proof');
const selfHostedProof = require('../src/self-hosted-release-proof');

const NOW = new Date('2026-11-24T10:00:00.000Z');
const COMMIT = '6e7a97b7117054c26a373daafc9cf8b2e0f763e3';
const KEY_ID = 'runtime-route-test';
const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey;
const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });

function signedIdentity() {
  const identity = {
    schemaVersion: selfHostedProof.SCHEMA_VERSION,
    sourceCommit: COMMIT,
    archiveSha256: 'a'.repeat(64),
    host: 'https://buyer.example.test',
    tlsCertificateSha256: 'b'.repeat(64),
    databaseIdentity: {
      engine: 'postgres',
      serverVersion: '18.1',
      database: 'opscore',
      runtimeRole: 'opscore_runtime',
      directHost: 'db.example.test',
      directConnection: true,
      bypassRls: false,
      superuser: false,
      createRole: false,
      createDb: false
    },
    generatedAt: '2026-11-24T09:00:00.000Z',
    issuedBy: 'buyer-operator'
  };
  const signature = crypto.sign(
    null,
    selfHostedProof.attestationPayload(identity, KEY_ID),
    privateKey
  ).toString('base64');
  identity.attestation = { algorithm: 'ed25519', keyId: KEY_ID, signature };
  return identity;
}

function withIdentityEnv(identity, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-public-release-proof-'));
  const identityPath = path.join(dir, 'identity.json');
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
  return {
    OPSC_RELEASE_PROOF_MODE: 'self-hosted',
    OPSC_SELF_HOSTED_IDENTITY_PATH: identityPath,
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: publicKeyPem,
    OPSC_SELF_HOSTED_ATTESTATION_KEY_ID: KEY_ID,
    OPSC_SOURCE_COMMIT_SHA: COMMIT,
    ...overrides
  };
}

test('existing release endpoint selector returns a signed self-hosted proof only in explicit self-hosted mode', () => {
  const result = createPlatformReleaseProof(withIdentityEnv(signedIdentity()), { now: NOW });
  assert.equal(result.schemaVersion, SELF_HOSTED_SCHEMA);
  assert.equal(result.status, 'PASS');
  assert.equal(result.platform, 'self-hosted');
  assert.equal(result.mode, 'SELF_HOSTED');
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.attestation, {
    algorithm: 'ed25519',
    keyId: KEY_ID,
    verified: true
  });
  assert.notEqual(result.status, 'CERTIFIED');
  assert.equal(result.productionIsolationCertification, undefined);
});

test('self-hosted route mode fails closed when the public trust key is absent', () => {
  const env = withIdentityEnv(signedIdentity(), {
    OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY: ''
  });
  const result = createPlatformReleaseProof(env, { now: NOW });
  assert.equal(result.schemaVersion, SELF_HOSTED_SCHEMA);
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.ok(result.reasons.includes('SELF_HOSTED_ATTESTATION_TRUST_KEY_MISSING'));
});

test('default mode preserves the existing Vercel release proof', () => {
  const result = createPlatformReleaseProof({});
  assert.equal(result.platform, undefined);
  assert.equal(result.gate, undefined);
  assert.equal(result.status, 'UNVERIFIED');
  assert.notEqual(result.schemaVersion, SELF_HOSTED_SCHEMA);
});

test('unknown proof mode is rejected rather than falling back to Vercel or self-hosted', () => {
  const result = createPlatformReleaseProof({ OPSC_RELEASE_PROOF_MODE: 'mystery-host' });
  assert.equal(result.schemaVersion, ROUTER_SCHEMA);
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.deepEqual(result.reasons, ['RELEASE_PROOF_MODE_UNSUPPORTED']);
});

test('the existing HTTP route uses the platform selector without adding a new route', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.match(server, /createPlatformReleaseProof\(process\.env\)/);
  assert.match(server, /url\.pathname === '\/api\/verify\/release'/);
  assert.doesNotMatch(server, /\/api\/verify\/release\/self-hosted/);
});
