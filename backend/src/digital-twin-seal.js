'use strict';

const crypto = require('node:crypto');

const SEAL_SCHEMA = 'opscore.digital-twin-chain-seal.v1';
const PAYLOAD_TYPE = 'application/vnd.opscore.digital-twin-chain-seal.v1+json';
const GENESIS = 'GENESIS';
const HASH_RE = /^[0-9a-f]{64}$/;

function stableJson(value, limits = {}) {
  const active = new WeakSet();
  const maxDepth = Number.isSafeInteger(limits.maxDepth) ? limits.maxDepth : 64;
  const maxNodes = Number.isSafeInteger(limits.maxNodes) ? limits.maxNodes : 100_000;
  const maxBytes = Number.isSafeInteger(limits.maxBytes) ? limits.maxBytes : 4 * 1024 * 1024;
  let visitedNodes = 0;

  function visit() {
    visitedNodes += 1;
    if (visitedNodes > maxNodes) throw new Error('SEAL_NODE_LIMIT_EXCEEDED');
  }

  function normalize(input, depth = 0) {
    visit();
    if (depth > maxDepth) throw new Error('SEAL_DEPTH_LIMIT_EXCEEDED');
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (Buffer.byteLength(input, 'utf8') > maxBytes) throw new Error('SEAL_STRING_LIMIT_EXCEEDED');
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('SEAL_NUMBER_NOT_FINITE');
      return input;
    }
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) throw new Error('SEAL_ARRAY_PROTOTYPE_INVALID');
      if (input.length > maxNodes) throw new Error('SEAL_ARRAY_LIMIT_EXCEEDED');
      if (active.has(input)) throw new Error('SEAL_VALUE_CIRCULAR');
      active.add(input);
      try {
        const ownKeys = Reflect.ownKeys(input);
        if (ownKeys.some(key => typeof key === 'symbol')) throw new Error('SEAL_SYMBOL_KEY_NOT_ALLOWED');
        for (const key of ownKeys) {
          if (key === 'length') continue;
          if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length) {
            throw new Error('SEAL_ARRAY_EXTRA_PROPERTY_NOT_ALLOWED');
          }
        }
        const out = [];
        for (let i = 0; i < input.length; i += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
          if (!descriptor) throw new Error('SEAL_ARRAY_SPARSE_NOT_ALLOWED');
          if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('SEAL_ACCESSOR_OR_HIDDEN_PROPERTY_NOT_ALLOWED');
          out.push(normalize(descriptor.value, depth + 1));
        }
        return out;
      } finally {
        active.delete(input);
      }
    }
    if (typeof input === 'object') {
      const proto = Object.getPrototypeOf(input);
      if (proto !== Object.prototype && proto !== null) throw new Error('SEAL_OBJECT_NOT_PLAIN_JSON');
      if (active.has(input)) throw new Error('SEAL_VALUE_CIRCULAR');
      active.add(input);
      try {
        const ownKeys = Reflect.ownKeys(input);
        if (ownKeys.some(key => typeof key === 'symbol')) throw new Error('SEAL_SYMBOL_KEY_NOT_ALLOWED');
        if (ownKeys.length > maxNodes) throw new Error('SEAL_OBJECT_KEYS_LIMIT_EXCEEDED');
        const out = Object.create(null);
        for (const key of ownKeys.sort()) {
          const descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            throw new Error('SEAL_ACCESSOR_OR_HIDDEN_PROPERTY_NOT_ALLOWED');
          }
          out[key] = normalize(descriptor.value, depth + 1);
        }
        return out;
      } finally {
        active.delete(input);
      }
    }
    throw new Error('SEAL_VALUE_NOT_JSON');
  }

  const normalized = JSON.stringify(normalize(value));
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) throw new Error('SEAL_PAYLOAD_LIMIT_EXCEEDED');
  return normalized;
}
function asPrivateKey(input) {
  const key = input && input.type === 'private' ? input : crypto.createPrivateKey(input);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('SEAL_KEY_MUST_BE_ED25519');
  return key;
}

function asPublicKey(input) {
  const key = input && input.type === 'public' ? input : crypto.createPublicKey(input);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('SEAL_KEY_MUST_BE_ED25519');
  return key;
}

function publicKeyFingerprint(publicKey) {
  const key = asPublicKey(publicKey);
  return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

function pae(payloadType, payload) {
  const typeBytes = Buffer.from(payloadType, 'utf8');
  const payloadBytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} ${payloadType} ${payloadBytes.length} `, 'utf8'),
    payloadBytes
  ]);
}

function isoTimestamp(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('SEAL_TIMESTAMP_INVALID');
  return date.toISOString();
}

function buildSealPayload(chainVerification, options = {}) {
  if (!chainVerification || chainVerification.valid !== true || (Array.isArray(chainVerification.failures) && chainVerification.failures.length)) {
    throw new Error('TWIN_CHAIN_NOT_VALID');
  }
  const organizationId = String(chainVerification.organizationId || '').trim();
  if (!organizationId || organizationId.length > 128) throw new Error('SEAL_ORGANIZATION_INVALID');
  const headSequence = Number(chainVerification.headSequence);
  const eventCount = Number(chainVerification.eventCount);
  const snapshotCount = Number(chainVerification.snapshotCount);
  if (!Number.isSafeInteger(headSequence) || headSequence < 0 || !Number.isSafeInteger(eventCount) || eventCount < 0 || !Number.isSafeInteger(snapshotCount) || snapshotCount < 0) {
    throw new Error('SEAL_COUNT_INVALID');
  }
  if (headSequence !== eventCount || eventCount !== snapshotCount) throw new Error('SEAL_CHAIN_COUNTS_INCONSISTENT');
  const headHash = String(chainVerification.headHash || '');
  if ((headSequence === 0 && headHash !== GENESIS) || (headSequence > 0 && !HASH_RE.test(headHash))) throw new Error('SEAL_HEAD_HASH_INVALID');
  const keyId = String(options.keyId || '').trim();
  if (!keyId || keyId.length > 180 || /[\r\n\0]/.test(keyId)) throw new Error('SEAL_KEY_ID_INVALID');
  const publicKey = options.publicKey;
  if (!publicKey) throw new Error('SEAL_PUBLIC_KEY_REQUIRED');
  const fingerprint = publicKeyFingerprint(publicKey);
  const previousSealHash = options.previousSealHash === undefined || options.previousSealHash === null
    ? null : String(options.previousSealHash);
  if (previousSealHash !== null && !HASH_RE.test(previousSealHash)) throw new Error('SEAL_PREVIOUS_HASH_INVALID');

  return {
    schemaVersion: SEAL_SCHEMA,
    sealId: `twin-seal-${crypto.randomUUID()}`,
    organizationId,
    chain: { headSequence, headHash, eventCount, snapshotCount },
    issuedAt: isoTimestamp(options.issuedAt),
    keyId,
    publicKeyFingerprint: fingerprint,
    previousSealHash,
    claims: {
      chainVerificationPassed: true,
      signedWithEd25519: true,
      independentlyPublished: false,
      immutableExternalRetentionVerified: false,
      databaseAdministratorResistance: false
    }
  };
}

function makeEnvelope(payload, signature) {
  return {
    payloadType: PAYLOAD_TYPE,
    payload: Buffer.from(stableJson(payload), 'utf8').toString('base64'),
    signatures: [{ keyid: payload.keyId, sig: Buffer.from(signature).toString('base64') }]
  };
}

function createDigitalTwinSeal(chainVerification, options = {}) {
  const privateKey = asPrivateKey(options.privateKey);
  const publicKey = crypto.createPublicKey(privateKey);
  const payload = buildSealPayload(chainVerification, { ...options, publicKey });
  const payloadBytes = Buffer.from(stableJson(payload), 'utf8');
  const signature = crypto.sign(null, pae(PAYLOAD_TYPE, payloadBytes), privateKey);
  return makeEnvelope(payload, signature);
}

/**
 * Remote-key/HSM adapter boundary. `sign` receives DSSE PAE bytes and must
 * return a raw Ed25519 signature. The result is locally verified before it
 * can become an envelope; no cloud/KMS provider is assumed to exist.
 */
async function createDigitalTwinSealWithSigner(chainVerification, options = {}) {
  if (typeof options.sign !== 'function') throw new Error('SEAL_SIGNER_ADAPTER_REQUIRED');
  const publicKey = asPublicKey(options.publicKey);
  const payload = buildSealPayload(chainVerification, options);
  const payloadBytes = Buffer.from(stableJson(payload), 'utf8');
  const signingInput = pae(PAYLOAD_TYPE, payloadBytes);
  const rawSignature = await options.sign(signingInput, { keyId: payload.keyId, algorithm: 'Ed25519', payloadType: PAYLOAD_TYPE });
  if (!(Buffer.isBuffer(rawSignature) || rawSignature instanceof Uint8Array)) throw new Error('SEAL_SIGNER_RESULT_INVALID');
  const signature = Buffer.from(rawSignature);
  if (!crypto.verify(null, signingInput, publicKey, signature)) throw new Error('SEAL_SIGNER_SIGNATURE_MISMATCH');
  return makeEnvelope(payload, signature);
}

function verifyDigitalTwinSeal(envelope, publicKeyInput) {
  try {
    if (!envelope || envelope.payloadType !== PAYLOAD_TYPE || typeof envelope.payload !== 'string' || !Array.isArray(envelope.signatures) || envelope.signatures.length !== 1) {
      return { valid: false, reason: 'DSSE_ENVELOPE_SHAPE_INVALID' };
    }
    const payloadBytes = Buffer.from(envelope.payload, 'base64');
    if (!payloadBytes.length || payloadBytes.toString('base64') !== envelope.payload) return { valid: false, reason: 'DSSE_PAYLOAD_ENCODING_INVALID' };
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    if (stableJson(payload) !== payloadBytes.toString('utf8')) return { valid: false, reason: 'DSSE_PAYLOAD_NOT_CANONICAL' };
    if (payload.schemaVersion !== SEAL_SCHEMA || payload.claims?.chainVerificationPassed !== true || payload.claims?.signedWithEd25519 !== true) return { valid: false, reason: 'SEAL_PAYLOAD_SCHEMA_INVALID' };
    if (payload.claims?.independentlyPublished !== false || payload.claims?.immutableExternalRetentionVerified !== false || payload.claims?.databaseAdministratorResistance !== false) return { valid: false, reason: 'SEAL_CLAIMS_EXCEED_PROFILE' };
    if (typeof payload.sealId !== 'string' || !/^twin-seal-[0-9a-f-]{36}$/.test(payload.sealId) || typeof payload.organizationId !== 'string' || !payload.organizationId.trim() || payload.organizationId.length > 128 || !payload.chain || !Number.isSafeInteger(payload.chain.headSequence) || payload.chain.headSequence < 0 || !Number.isSafeInteger(payload.chain.eventCount) || !Number.isSafeInteger(payload.chain.snapshotCount) || payload.chain.headSequence !== payload.chain.eventCount || payload.chain.eventCount !== payload.chain.snapshotCount) return { valid: false, reason: 'SEAL_CHAIN_METADATA_INVALID' };
    if ((payload.chain.headSequence === 0 && payload.chain.headHash !== GENESIS) || (payload.chain.headSequence > 0 && !HASH_RE.test(String(payload.chain.headHash || '')))) return { valid: false, reason: 'SEAL_HEAD_HASH_INVALID' };
    if (typeof payload.keyId !== 'string' || !payload.keyId.trim() || payload.keyId.length > 180 || /[\r\n\0]/.test(payload.keyId) || !HASH_RE.test(String(payload.publicKeyFingerprint || '')) || !Number.isFinite(Date.parse(payload.issuedAt)) || (payload.previousSealHash !== null && !HASH_RE.test(String(payload.previousSealHash || '')))) return { valid: false, reason: 'SEAL_SIGNING_METADATA_INVALID' };
    const publicKey = asPublicKey(publicKeyInput);
    const fingerprint = publicKeyFingerprint(publicKey);
    if (fingerprint !== payload.publicKeyFingerprint) return { valid: false, reason: 'SEAL_PUBLIC_KEY_FINGERPRINT_MISMATCH' };
    const sigRecord = envelope.signatures[0];
    if (!sigRecord || sigRecord.keyid !== payload.keyId || typeof sigRecord.sig !== 'string') return { valid: false, reason: 'DSSE_SIGNATURE_METADATA_INVALID' };
    const signature = Buffer.from(sigRecord.sig, 'base64');
    if (!signature.length || signature.toString('base64') !== sigRecord.sig) return { valid: false, reason: 'DSSE_SIGNATURE_ENCODING_INVALID' };
    const valid = crypto.verify(null, pae(envelope.payloadType, payloadBytes), publicKey, signature);
    return { valid, reason: valid ? null : 'DSSE_SIGNATURE_INVALID', sealId: payload.sealId, organizationId: payload.organizationId, headSequence: payload.chain?.headSequence, headHash: payload.chain?.headHash, keyId: payload.keyId, publicKeyFingerprint: fingerprint, independentlyPublished: false };
  } catch (error) {
    return { valid: false, reason: error?.message || 'DSSE_VERIFY_FAILED' };
  }
}

/**
 * External publication contract only. A real adapter must write outside the
 * application database and return a verifiable immutable-retention receipt.
 * No cloud/storage provider is bundled or claimed to be connected here.
 */
async function publishDigitalTwinSeal(envelope, publisher, publicKeyInput) {
  if (!envelope || !Array.isArray(envelope.signatures) || envelope.signatures.length !== 1) throw new Error('SEAL_ENVELOPE_REQUIRED');
  if (!publicKeyInput) throw new Error('SEAL_PUBLIC_KEY_REQUIRED');
  if (!verifyDigitalTwinSeal(envelope, publicKeyInput).valid) throw new Error('SEAL_NOT_VERIFIED');
  if (!publisher || typeof publisher.publishImmutable !== 'function') throw new Error('EXTERNAL_ANCHOR_ADAPTER_REQUIRED');
  const envelopeSha256 = crypto.createHash('sha256').update(stableJson(envelope)).digest('hex');
  const receipt = await publisher.publishImmutable(envelope);
  if (!receipt || receipt.immutable !== true) throw new Error('EXTERNAL_ANCHOR_IMMUTABILITY_NOT_CONFIRMED');
  const provider = String(receipt.provider || '').trim();
  const receiptId = String(receipt.receiptId || '').trim();
  let uri;
  try { uri = new URL(String(receipt.uri || '')); } catch { throw new Error('EXTERNAL_ANCHOR_URI_INVALID'); }
  if (!provider || provider.toLowerCase() === 'local' || !receiptId || uri.protocol !== 'https:') throw new Error('EXTERNAL_ANCHOR_RECEIPT_INVALID');
  const retainUntil = isoTimestamp(receipt.retainUntil);
  if (Date.parse(retainUntil) <= Date.now()) throw new Error('EXTERNAL_ANCHOR_RETENTION_EXPIRED');
  return {
    schemaVersion: 'opscore.digital-twin-external-anchor-receipt.v1',
    sealSha256: envelopeSha256,
    provider,
    receiptId,
    uri: uri.toString(),
    immutable: true,
    retainUntil,
    verifiedAt: new Date().toISOString(),
    status: 'PUBLISHED_RECEIPT_RETURNED',
    providerClaimsIndependentlyVerified: false
  };
}

module.exports = {
  SEAL_SCHEMA,
  PAYLOAD_TYPE,
  stableJson,
  publicKeyFingerprint,
  createDigitalTwinSeal,
  createDigitalTwinSealWithSigner,
  verifyDigitalTwinSeal,
  publishDigitalTwinSeal
};
