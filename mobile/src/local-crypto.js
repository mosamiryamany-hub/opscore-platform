import * as SecureStore from 'expo-secure-store';

const KEY = 'opscore-mobile-evidence-key.v1';
const CRYPTO_VERSION = 'aes-256-gcm:v1';
let keyPromise = null;

function ensureCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues || !globalThis.btoa || !globalThis.atob) {
    throw new Error('LOCAL_EVIDENCE_CRYPTO_UNAVAILABLE');
  }
}

function toB64(bytes) {
  let value = '';
  const array = new Uint8Array(bytes);
  for (let offset = 0; offset < array.length; offset += 0x8000) {
    value += String.fromCharCode(...array.subarray(offset, offset + 0x8000));
  }
  return globalThis.btoa(value);
}

function fromB64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('LOCAL_EVIDENCE_BASE64_INVALID');
  }
  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

async function getKey() {
  ensureCrypto();
  if (!keyPromise) {
    keyPromise = (async () => {
      let raw = await SecureStore.getItemAsync(KEY);
      if (!raw) {
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        raw = toB64(bytes);
        await SecureStore.setItemAsync(KEY, raw, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        });
      }
      const bytes = fromB64(raw);
      if (bytes.byteLength !== 32) throw new Error('LOCAL_EVIDENCE_KEY_LENGTH_INVALID');
      return globalThis.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })().catch(error => { keyPromise = null; throw error; });
  }
  return keyPromise;
}

async function encryptBytes(bytes, aad = '') {
  ensureCrypto();
  const key = await getKey();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ciphertext = await globalThis.crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(String(aad))
  }, key, bytes);
  return { cryptoVersion: CRYPTO_VERSION, ciphertext: toB64(ciphertext), iv: toB64(iv), aad: String(aad) };
}

async function decryptBytes(record, aad = record?.aad ?? '') {
  ensureCrypto();
  if (!record || record.cryptoVersion !== CRYPTO_VERSION || record.aad !== String(aad)) {
    throw new Error('LOCAL_EVIDENCE_ENVELOPE_INVALID');
  }
  const key = await getKey();
  return globalThis.crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: fromB64(record.iv),
    additionalData: new TextEncoder().encode(String(aad))
  }, key, fromB64(record.ciphertext));
}

/** Encrypts a base64-encoded evidence file while keeping the original bytes intact. */
export async function encryptLocalEvidence(contentBase64, aad = '') {
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    throw new Error('LOCAL_EVIDENCE_CONTENT_INVALID');
  }
  return encryptBytes(fromB64(contentBase64), aad);
}

export async function decryptLocalEvidence(record) {
  return toB64(await decryptBytes(record));
}

/** Encrypts small textual records such as offline mutations and cached mission data. */
export async function encryptLocalText(value, aad = '') {
  return encryptBytes(new TextEncoder().encode(String(value)), aad);
}

export async function decryptLocalText(record, expectedAad = record?.aad ?? '') {
  const plain = await decryptBytes(record, expectedAad);
  return new TextDecoder().decode(plain);
}

export async function sha256Hex(value) {
  ensureCrypto();
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
