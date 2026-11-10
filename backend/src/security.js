const crypto = require('node:crypto');
const { promisify } = require('node:util');
const dns = require('node:dns').promises;
const net = require('node:net');
const https = require('node:https');
function id(prefix) {
  return `${ prefix }_${ crypto.randomUUID() }`;
}
function now() {
  return new Date().toISOString();
}
const SCRYPT_N = process.env.NODE_ENV === 'test' ? Number(process.env.OPSC_TEST_SCRYPT_N || 131072) : 131072;
if (!Number.isInteger(SCRYPT_N) || SCRYPT_N < 16384 || SCRYPT_N > 1048576 || (process.env.NODE_ENV === 'production' && SCRYPT_N < 131072)) throw new Error('SCRYPT_COST_INVALID');
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const scryptAsync = promisify(crypto.scrypt);
function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12)
    throw new Error('PASSWORD_TOO_SHORT');
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${ SCRYPT_N }$${ SCRYPT_R }$${ SCRYPT_P }$${ salt.toString('base64url') }$${ derived.toString('base64url') }`;
}
async function hashPasswordAsync(password) {
  if (typeof password !== 'string' || password.length < 12)
    throw new Error('PASSWORD_TOO_SHORT');
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${ SCRYPT_N }$${ SCRYPT_R }$${ SCRYPT_P }$${ salt.toString('base64url') }$${ derived.toString('base64url') }`;
}
function passwordHashNeedsUpgrade(stored) {
  const parts = String(stored).split('$');
  return parts[0] === 'scrypt' && parts.length === 3;
}
function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  let scheme, N, r, p, saltB64, hashB64;
  if (parts.length === 3) {
    [scheme, saltB64, hashB64] = parts;
    N = 16384; r = 8; p = 1; // legacy 0.11.57 format
  } else if (parts.length === 6) {
    [scheme, N, r, p, saltB64, hashB64] = parts;
    N = Number(N); r = Number(r); p = Number(p);
  } else return false;
  if (scheme !== 'scrypt' || !saltB64 || !hashB64 || !Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  if (N < 16384 || N > 1048576 || r < 1 || r > 32 || p < 1 || p > 8) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  if (!salt.length || expected.length !== 64) return false;
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}


async function verifyPasswordAsync(password, stored) {
  const parts = String(stored).split('$');
  let scheme, N, r, p, saltB64, hashB64;
  if (parts.length === 3) {
    [scheme, saltB64, hashB64] = parts;
    N = 16384; r = 8; p = 1;
  } else if (parts.length === 6) {
    [scheme, N, r, p, saltB64, hashB64] = parts;
    N = Number(N); r = Number(r); p = Number(p);
  } else return false;
  if (scheme !== 'scrypt' || !saltB64 || !hashB64 || !Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  if (N < 16384 || N > 1048576 || r < 1 || r > 32 || p < 1 || p > 8) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  if (!salt.length || expected.length !== 64) return false;
  const actual = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function hmacSha256(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function timingSafeHexEqual(a, b) {
  const sa = String(a || ''), sb = String(b || '');
  if (!/^[a-f0-9]+$/i.test(sa) || !/^[a-f0-9]+$/i.test(sb) || sa.length !== sb.length || sa.length === 0 || sa.length % 2 !== 0) return false;
  const aa = Buffer.from(sa, 'hex'), bb = Buffer.from(sb, 'hex');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

const oidcCache = new Map();
const oidcRefreshState = new Map();
const OIDC_FORCED_REFRESH_COOLDOWN_MS = 10 * 1000;
function b64urlJson(value) {
  try { return JSON.parse(Buffer.from(String(value).replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-String(value).length%4)%4),'base64').toString('utf8')); }
  catch { throw new Error('OIDC_TOKEN_JSON_INVALID'); }
}
function oidcIssuerConfig() {
  const issuer = String(process.env.OIDC_ISSUER || '').trim().replace(/\/$/, '');
  const audience = String(process.env.OIDC_AUDIENCE || '').trim();
  if (!issuer || !audience) throw new Error('OIDC_CONFIGURATION_REQUIRED');
  let u; try { u = new URL(issuer); } catch { throw new Error('OIDC_ISSUER_INVALID'); }
  if (u.username || u.password || !['https:','http:'].includes(u.protocol)) throw new Error('OIDC_ISSUER_INVALID');
  if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') throw new Error('OIDC_ISSUER_TLS_REQUIRED');
  return { issuer, audience };
}
async function fetchJsonWithTimeout(url, timeoutMs = 8000, maxBytes = 1024 * 1024) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`OIDC_HTTP_${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > maxBytes) throw new Error('OIDC_PROVIDER_RESPONSE_TOO_LARGE');
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > maxBytes) throw new Error('OIDC_PROVIDER_RESPONSE_TOO_LARGE');
    try { return JSON.parse(raw.toString('utf8')); } catch { throw new Error('OIDC_PROVIDER_JSON_INVALID'); }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('OIDC_PROVIDER_TIMEOUT');
    throw e;
  } finally { clearTimeout(timer); }
}
async function getOidcDiscoveryAndKeys(forceRefresh = false) {
  const {issuer} = oidcIssuerConfig();
  const cached = oidcCache.get(issuer);
  const nowMs = Date.now();
  if (!forceRefresh && cached && cached.expiresAt > nowMs) return cached;
  if (forceRefresh) {
    const state = oidcRefreshState.get(issuer) || { lastForcedRefreshAt: 0, inFlight: null };
    if (state.inFlight) return state.inFlight;
    if (nowMs - state.lastForcedRefreshAt < OIDC_FORCED_REFRESH_COOLDOWN_MS && cached) return cached;
    state.lastForcedRefreshAt = nowMs;
    const promise = (async () => {
      const discoveryUrl = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : issuer + '/.');
      const discovery = await fetchJsonWithTimeout(discoveryUrl.toString());
      if (String(discovery.issuer || '').replace(/\/$/,'') !== issuer) throw new Error('OIDC_ISSUER_MISMATCH');
      const jwksUri = String(discovery.jwks_uri || '');
      if (!jwksUri) throw new Error('OIDC_JWKS_URI_MISSING');
      let ju; try { ju = new URL(jwksUri); } catch { throw new Error('OIDC_JWKS_URI_INVALID'); }
      if (ju.username || ju.password || !['https:','http:'].includes(ju.protocol)) throw new Error('OIDC_JWKS_URI_INVALID');
      if (process.env.NODE_ENV === 'production' && ju.protocol !== 'https:') throw new Error('OIDC_JWKS_TLS_REQUIRED');
      if (process.env.NODE_ENV === 'production') {
        const allowedHosts = String(process.env.OIDC_ALLOWED_JWKS_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
        const issuerHost = new URL(issuer).hostname.toLowerCase();
        if (ju.hostname.toLowerCase() !== issuerHost && !allowedHosts.includes(ju.hostname.toLowerCase())) throw new Error('OIDC_JWKS_HOST_NOT_ALLOWLISTED');
      }
      const jwks = await fetchJsonWithTimeout(jwksUri);
      if (!Array.isArray(jwks.keys)) throw new Error('OIDC_JWKS_INVALID');
      const value = { issuer, audience: oidcIssuerConfig().audience, discovery, keys: jwks.keys, expiresAt: nowMs + 5*60*1000 };
      oidcCache.set(issuer, value);
      return value;
    })();
    state.inFlight = promise;
    oidcRefreshState.set(issuer, state);
    try { return await promise; } finally { state.inFlight = null; oidcRefreshState.set(issuer, state); }
  }
  const discoveryUrl = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : issuer + '/.');
  const discovery = await fetchJsonWithTimeout(discoveryUrl.toString());
  if (String(discovery.issuer || '').replace(/\/$/,'') !== issuer) throw new Error('OIDC_ISSUER_MISMATCH');
  const jwksUri = String(discovery.jwks_uri || '');
  if (!jwksUri) throw new Error('OIDC_JWKS_URI_MISSING');
  let ju; try { ju = new URL(jwksUri); } catch { throw new Error('OIDC_JWKS_URI_INVALID'); }
  if (ju.username || ju.password || !['https:','http:'].includes(ju.protocol)) throw new Error('OIDC_JWKS_URI_INVALID');
  if (process.env.NODE_ENV === 'production' && ju.protocol !== 'https:') throw new Error('OIDC_JWKS_TLS_REQUIRED');
  if (process.env.NODE_ENV === 'production') {
    const allowedHosts = String(process.env.OIDC_ALLOWED_JWKS_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const issuerHost = new URL(issuer).hostname.toLowerCase();
    if (ju.hostname.toLowerCase() !== issuerHost && !allowedHosts.includes(ju.hostname.toLowerCase())) throw new Error('OIDC_JWKS_HOST_NOT_ALLOWLISTED');
  }
  const jwks = await fetchJsonWithTimeout(jwksUri);
  if (!Array.isArray(jwks.keys)) throw new Error('OIDC_JWKS_INVALID');
  const value = { issuer, audience: oidcIssuerConfig().audience, discovery, keys: jwks.keys, expiresAt: nowMs + 5*60*1000 };
  oidcCache.set(issuer, value);
  return value;
}
async function verifyOidcIdToken(idToken, expectedNonce = null) {
  const raw = String(idToken || ''); const parts = raw.split('.');
  if (parts.length !== 3) throw new Error('OIDC_TOKEN_FORMAT_INVALID');
  const header = b64urlJson(parts[0]); const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('OIDC_ALGORITHM_FORBIDDEN');
  let meta = await getOidcDiscoveryAndKeys(false);
  let jwk = meta.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
  if (!jwk) { meta = await getOidcDiscoveryAndKeys(true); jwk = meta.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')); }
  if (!jwk) throw new Error('OIDC_SIGNING_KEY_NOT_FOUND');
  if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes('verify')) throw new Error('OIDC_JWK_INVALID');
  let key; try { key = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch { throw new Error('OIDC_JWK_INVALID'); }
  if (key.asymmetricKeyType !== 'rsa' || Number(key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error('OIDC_RSA_KEY_TOO_WEAK');
  const verifier = crypto.createVerify('RSA-SHA256'); verifier.update(`${parts[0]}.${parts[1]}`); verifier.end();
  const signature = Buffer.from(parts[2].replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-parts[2].length%4)%4),'base64');
  if (!verifier.verify(key, signature)) throw new Error('OIDC_SIGNATURE_INVALID');
  const {issuer,audience}=meta, skew=Math.max(0,Math.min(300,Number(process.env.OIDC_CLOCK_SKEW_SECONDS||60)));
  const nowSec=Math.floor(Date.now()/1000);
  if (String(payload.iss||'').replace(/\/$/,'') !== issuer) throw new Error('OIDC_CLAIM_ISS_INVALID');
  const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if (!audiences.includes(audience)) throw new Error('OIDC_CLAIM_AUD_INVALID');
  if (audiences.length>1 && payload.azp !== audience) throw new Error('OIDC_CLAIM_AZP_INVALID');
  if (!payload.sub || !String(payload.sub).trim()) throw new Error('OIDC_SUBJECT_MISSING');
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= nowSec - skew) throw new Error('OIDC_TOKEN_EXPIRED');
  if (payload.nbf !== undefined && Number(payload.nbf) > nowSec + skew) throw new Error('OIDC_TOKEN_NOT_YET_VALID');
  if (payload.iat !== undefined && Number(payload.iat) > nowSec + skew) throw new Error('OIDC_ISSUED_AT_INVALID');
  if (expectedNonce !== null && String(payload.nonce || '') !== String(expectedNonce)) throw new Error('OIDC_NONCE_MISMATCH');
  const emailClaim=String(payload.email||'').trim().toLowerCase();
  if (!emailClaim || !payload.email_verified) throw new Error('OIDC_VERIFIED_EMAIL_REQUIRED');
  return { issuer, audience, subject:String(payload.sub), email:emailClaim, emailVerified:true, claims:payload };
}
function deriveKey(secret, purpose) {
  const salt = Buffer.from('opscore-key-derivation-v1', 'utf8');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(secret)), salt, Buffer.from(String(purpose)), 32));
}
function encryptSecret(secret, masterKey) {
  if (!masterKey)
    throw new Error('WEBHOOK_ENCRYPTION_KEY_REQUIRED');
  const key = Buffer.isBuffer(masterKey) ? masterKey : deriveKey(masterKey, 'opscore-secret');
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final()
  ]);
  return `v1:${ iv.toString('base64url') }:${ cipher.getAuthTag().toString('base64url') }:${ ct.toString('base64url') }`;
}
function decryptSecret(blob, masterKey) {
  if (!masterKey)
    throw new Error('WEBHOOK_ENCRYPTION_KEY_REQUIRED');
  const [v, ivB, tagB, ctB] = String(blob || '').split(':');
  if (v !== 'v1' || !ivB || !tagB || !ctB)
    throw new Error('SECRET_CIPHERTEXT_INVALID');
  const key = Buffer.isBuffer(masterKey) ? masterKey : deriveKey(masterKey, 'opscore-secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}
function ipv4Private(ip) {
  const a = ip.split('.').map(Number);
  if (a.length !== 4 || a.some(x => !Number.isInteger(x) || x < 0 || x > 255))
    return true;
  const n = ((a[0] * 256 + a[1]) * 256 + a[2]) * 256 + a[3] >>> 0;
  return a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] === 100 && a[1] >= 64 && a[1] <= 127 || a[0] === 169 && a[1] === 254 || a[0] === 172 && a[1] >= 16 && a[1] <= 31 || a[0] === 192 && a[1] === 168 || a[0] === 192 && a[1] === 0 && a[2] === 0 || a[0] === 192 && a[1] === 0 && a[2] === 2 || a[0] === 198 && (a[1] === 18 || a[1] === 19) || a[0] === 198 && a[1] === 51 && a[2] === 100 || a[0] === 203 && a[1] === 0 && a[2] === 113 || n >= 3758096384;
}
function ipv6Private(ip) {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff'))
    return true;
  const mapped = v.match(/^::ffff:(\d+(?:\.\d+){3})$/);
  if (mapped && ipv4Private(mapped[1]))
    return true;
  // Also reject IPv4-mapped IPv6 written entirely in hexadecimal, e.g.
  // ::ffff:7f00:1 == 127.0.0.1. Browsers and HTTP clients may normalize
  // this form without converting it to dotted-quad text first.
  const parts = v.split('::');
  if (parts.length > 2)
    return true;
  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean) : [];
  if (left.some(x => !/^[0-9a-f]{1,4}$/i.test(x)) || right.some(x => !/^[0-9a-f]{1,4}$/i.test(x)))
    return true;
  const groups = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : [...left];
  if (groups.length === 8 && groups.slice(0, 5).every(x => x === '0') && groups[5].toLowerCase() === 'ffff') {
    const a = parseInt(groups[6], 16), b = parseInt(groups[7], 16);
    const mappedIpv4 = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    return ipv4Private(mappedIpv4);
  }
  return false;
}
function isPrivateAddress(address) {
  const t = net.isIP(address);
  return t === 4 ? ipv4Private(address) : t === 6 ? ipv6Private(address) : false;
}
function validateWebhookUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    throw new Error('WEBHOOK_URL_INVALID');
  }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname)
    throw new Error('WEBHOOK_URL_INVALID');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || isPrivateAddress(h))
    throw new Error('WEBHOOK_TARGET_FORBIDDEN');
  return u.toString();
}
async function resolvePublicWebhookHost(hostname) {
  const results = await dns.lookup(hostname, {
    all: true,
    verbatim: true
  });
  if (!results.length || results.some(x => isPrivateAddress(x.address)))
    throw new Error('WEBHOOK_TARGET_FORBIDDEN');
  return results[0].address;
}
function httpsPostPinned(urlString, body, headers, address, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const req = https.request({
      protocol: 'https:',
      hostname: u.hostname,
      port: u.port || 443,
      path: `${ u.pathname }${ u.search }`,
      method: 'POST',
      servername: u.hostname,
      lookup: (host, opts, cb) => cb(null, address, net.isIP(address)),
      headers,
      timeout: timeoutMs
    }, res => {
      res.resume();
      res.on('end', () => resolve({ statusCode: res.statusCode || 0 }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
function authProviderGate() {
  const mode = String(process.env.AUTH_MODE || 'local').toLowerCase();
  if (!['local','oidc'].includes(mode)) throw new Error('AUTH_MODE_INVALID');
  if (mode === 'oidc') oidcIssuerConfig();
  return mode;
}
module.exports = {
  id,
  now,
  hashPassword,
  hashPasswordAsync,
  verifyPassword,
  verifyPasswordAsync,
  passwordHashNeedsUpgrade,
  randomToken,
  hashToken,
  hmacSha256,
  timingSafeHexEqual,
  encryptSecret,
  decryptSecret,
  authProviderGate,
  verifyOidcIdToken,
  oidcIssuerConfig,
  validateWebhookUrl,
  resolvePublicWebhookHost,
  httpsPostPinned,
  isPrivateAddress
};
