'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {
  stableJson,
  createDigitalTwinSeal,
  createDigitalTwinSealWithSigner,
  verifyDigitalTwinSeal,
  publishDigitalTwinSeal,
  PAYLOAD_TYPE
} = require('../src/digital-twin-seal');

function fixture() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const chain = {
    valid: true,
    organizationId: 'org_seal_test',
    headSequence: 3,
    headHash: 'a'.repeat(64),
    eventCount: 3,
    snapshotCount: 3,
    failures: []
  };
  return { ...pair, chain };
}

test('canonical seal JSON sorts object keys and rejects unsupported data instead of lossy signing', () => {
  assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.throws(() => stableJson({ a: undefined }), /SEAL_VALUE_NOT_JSON/);
  assert.throws(() => stableJson({ a: Number.NaN }), /SEAL_NUMBER_NOT_FINITE/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => stableJson(cyclic), /SEAL_VALUE_CIRCULAR/);
  assert.throws(() => stableJson(new Array(2)), /SEAL_ARRAY_SPARSE_NOT_ALLOWED/);
  const symbolKeyed = { a: 1 }; symbolKeyed[Symbol('hidden')] = 2;
  assert.throws(() => stableJson(symbolKeyed), /SEAL_SYMBOL_KEY_NOT_ALLOWED/);
  let getterInvoked = false;
  const withGetter = Object.defineProperty({}, 'a', { enumerable: true, get() { getterInvoked = true; return 1; } });
  assert.throws(() => stableJson(withGetter), /SEAL_ACCESSOR_OR_HIDDEN_PROPERTY_NOT_ALLOWED/);
  assert.equal(getterInvoked, false);
  const arrayWithExtraProperty = [1]; arrayWithExtraProperty.note = 'lossy';
  assert.throws(() => stableJson(arrayWithExtraProperty), /SEAL_ARRAY_EXTRA_PROPERTY_NOT_ALLOWED/);
  assert.throws(() => stableJson({ a: { b: 1 } }, { maxDepth: 1 }), /SEAL_DEPTH_LIMIT_EXCEEDED/);
});

test('Ed25519 DSSE seal verifies exact digital-twin chain head with explicit non-anchor claims', () => {
  const f = fixture();
  const envelope = createDigitalTwinSeal(f.chain, { privateKey: f.privateKey, keyId: 'test-ed25519-1', issuedAt: '2026-10-21T00:00:00.000Z' });
  assert.equal(envelope.payloadType, PAYLOAD_TYPE);
  const result = verifyDigitalTwinSeal(envelope, f.publicKey);
  assert.equal(result.valid, true);
  assert.equal(result.organizationId, f.chain.organizationId);
  assert.equal(result.headSequence, 3);
  const payload = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
  assert.equal(payload.claims.independentlyPublished, false);
  assert.equal(payload.claims.immutableExternalRetentionVerified, false);
  assert.equal(payload.claims.databaseAdministratorResistance, false);
});

test('seal verifier rejects signed payloads whose security claims exceed this profile', () => {
  const f = fixture();
  const envelope = createDigitalTwinSeal(f.chain, { privateKey: f.privateKey, keyId: 'claims-guard-key' });
  const payload = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
  payload.claims.independentlyPublished = true;
  const payloadBytes = Buffer.from(stableJson(payload), 'utf8');
  const typeBytes = Buffer.from(PAYLOAD_TYPE, 'utf8');
  const pae = Buffer.concat([Buffer.from(`DSSEv1 ${typeBytes.length} ${PAYLOAD_TYPE} ${payloadBytes.length} `), payloadBytes]);
  envelope.payload = payloadBytes.toString('base64');
  envelope.signatures[0].sig = crypto.sign(null, pae, f.privateKey).toString('base64');
  assert.equal(verifyDigitalTwinSeal(envelope, f.publicKey).valid, false);
  assert.equal(verifyDigitalTwinSeal(envelope, f.publicKey).reason, 'SEAL_CLAIMS_EXCEED_PROFILE');
});

test('seal verifier detects payload mutation, signature mutation and use of an unrelated key', () => {
  const f = fixture();
  const envelope = createDigitalTwinSeal(f.chain, { privateKey: f.privateKey, keyId: 'test-key' });
  const payloadTampered = structuredClone(envelope);
  const body = JSON.parse(Buffer.from(payloadTampered.payload, 'base64').toString('utf8'));
  body.chain.headSequence = 4;
  payloadTampered.payload = Buffer.from(stableJson(body)).toString('base64');
  assert.equal(verifyDigitalTwinSeal(payloadTampered, f.publicKey).valid, false);
  const signatureTampered = structuredClone(envelope);
  signatureTampered.signatures[0].sig = Buffer.alloc(64, 7).toString('base64');
  assert.equal(verifyDigitalTwinSeal(signatureTampered, f.publicKey).valid, false);
  const other = crypto.generateKeyPairSync('ed25519');
  assert.equal(verifyDigitalTwinSeal(envelope, other.publicKey).valid, false);
});

test('seal refuses invalid, incomplete, or inconsistent chain evidence', () => {
  const f = fixture();
  assert.throws(() => createDigitalTwinSeal({ ...f.chain, valid: false }, { privateKey: f.privateKey, keyId: 'key' }), /TWIN_CHAIN_NOT_VALID/);
  assert.throws(() => createDigitalTwinSeal({ ...f.chain, snapshotCount: 2 }, { privateKey: f.privateKey, keyId: 'key' }), /SEAL_CHAIN_COUNTS_INCONSISTENT/);
  assert.throws(() => createDigitalTwinSeal({ ...f.chain, headHash: 'not-a-hash' }, { privateKey: f.privateKey, keyId: 'key' }), /SEAL_HEAD_HASH_INVALID/);
  assert.throws(() => createDigitalTwinSeal(f.chain, { privateKey: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, keyId: 'key' }), /SEAL_KEY_MUST_BE_ED25519/);
});

test('external publication fails closed without adapter or without immutable receipt', async () => {
  const f = fixture();
  const envelope = createDigitalTwinSeal(f.chain, { privateKey: f.privateKey, keyId: 'key' });
  await assert.rejects(publishDigitalTwinSeal(envelope, null, f.publicKey), /EXTERNAL_ANCHOR_ADAPTER_REQUIRED/);
  await assert.rejects(publishDigitalTwinSeal(envelope, { publishImmutable: async () => ({ provider: 'object-store', receiptId: 'r1', uri: 'https://example.test/objects/seal', immutable: false, retainUntil: new Date(Date.now() + 365 * 86400000).toISOString() }) }, f.publicKey), /EXTERNAL_ANCHOR_IMMUTABILITY_NOT_CONFIRMED/);
  const tampered = structuredClone(envelope);
  tampered.signatures[0].sig = Buffer.alloc(64, 6).toString('base64');
  await assert.rejects(publishDigitalTwinSeal(tampered, { publishImmutable: async () => { throw new Error('must_not_publish'); } }, f.publicKey), /SEAL_NOT_VERIFIED/);
  const receipt = await publishDigitalTwinSeal(envelope, { publishImmutable: async () => ({ provider: 'object-lock-compatible-provider', receiptId: 'receipt-1', uri: 'https://example.test/seals/1', immutable: true, retainUntil: new Date(Date.now() + 365 * 86400000).toISOString() }) }, f.publicKey);
  assert.equal(receipt.status, 'PUBLISHED_RECEIPT_RETURNED');
  assert.equal(receipt.providerClaimsIndependentlyVerified, false);
  assert.match(receipt.sealSha256, /^[0-9a-f]{64}$/);
});


test('remote signer adapter can sign without exposing the private key and verifies its returned signature', async () => {
  const f = fixture();
  const envelope = await createDigitalTwinSealWithSigner(f.chain, {
    publicKey: f.publicKey,
    keyId: 'remote-kms-ed25519-key',
    issuedAt: '2026-10-21T00:00:00.000Z',
    sign: async bytes => crypto.sign(null, bytes, f.privateKey)
  });
  assert.equal(verifyDigitalTwinSeal(envelope, f.publicKey).valid, true);
  await assert.rejects(createDigitalTwinSealWithSigner(f.chain, {
    publicKey: f.publicKey,
    keyId: 'remote-kms-ed25519-key',
    sign: async () => Buffer.alloc(64, 0)
  }), /SEAL_SIGNER_SIGNATURE_MISMATCH/);
  await assert.rejects(createDigitalTwinSealWithSigner(f.chain, { publicKey: f.publicKey, keyId: 'missing-adapter' }), /SEAL_SIGNER_ADAPTER_REQUIRED/);
});


test('independent seal verifier CLI validates a detached envelope using only the trusted public key', () => {
  const f = fixture();
  const envelope = createDigitalTwinSeal(f.chain, { privateKey: f.privateKey, keyId: 'cli-verification-key' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-seal-cli-'));
  try {
    const envelopePath = path.join(tmp, 'seal.json');
    const publicKeyPath = path.join(tmp, 'trusted-public.pem');
    fs.writeFileSync(envelopePath, JSON.stringify(envelope));
    fs.writeFileSync(publicKeyPath, f.publicKey.export({ type: 'spki', format: 'pem' }));
    const stdout = cp.execFileSync(process.execPath, ['scripts/verify-digital-twin-seal.js', envelopePath, publicKeyPath], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    const report = JSON.parse(stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.independentPublicationVerified, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
