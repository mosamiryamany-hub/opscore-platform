'use strict';

/**
 * Self-hosted release proof.
 *
 * The Vercel release proof (/api/verify/release) reads evidence bound to a Vercel
 * deployment id (dpl_...) and a Neon branch. A buyer-owned host can never satisfy
 * that identity, so a self-hosted install could open traffic (see firewall
 * productionSafetyGate: OPSC_PRODUCTION_HOLD=false) yet still report UNVERIFIED.
 *
 * This module supplies the missing, platform-neutral proof. It is intentionally
 * pure and fail-closed:
 *   - nothing here reads process.env implicitly unless the caller asks for it;
 *   - no field defaults to "trusted"; every attested field must be present and exact;
 *   - the database identity must describe a least-privilege runtime role;
 *   - the identity is bound to an archive digest and a TLS certificate digest;
 *   - a detached attestation digest binds all of the above together.
 *
 * It never weakens the Vercel path: that path stays unchanged and remains the only
 * source of CERTIFIED on Vercel. This is an additional, disjoint gate.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');

const SCHEMA_VERSION = 'opscore.self-hosted-release-identity.v1';
const GATE_ID = 'selfHostedReleaseProof';
const MODE = 'SELF_HOSTED';
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DEFAULT_IDENTITY_PATH = require('node:path').join(
  __dirname, '..', 'docs', 'verification', 'SELF_HOSTED_RELEASE_IDENTITY.json'
);

const ATTESTED_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceCommit',
  'archiveSha256',
  'host',
  'tlsCertificateSha256',
  'databaseIdentity',
  'generatedAt',
  'issuedBy'
]);

const PRIVILEGE_FLAGS = Object.freeze(['bypassRls', 'superuser', 'createRole', 'createDb']);

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

function attestationDigest(identity) {
  const payload = {};
  for (const field of ATTESTED_FIELDS) payload[field] = identity ? identity[field] : undefined;
  return sha256Hex(canonicalJson(payload));
}

function sanitizedDatabase(database) {
  const source = database && typeof database === 'object' ? database : {};
  return {
    engine: source.engine === undefined ? null : source.engine,
    serverVersion: source.serverVersion === undefined ? null : source.serverVersion,
    database: source.database === undefined ? null : source.database,
    runtimeRole: source.runtimeRole === undefined ? null : source.runtimeRole,
    directConnection: source.directConnection === true
  };
}

function untrusted(reasons, now) {
  return {
    status: 'NOT_VERIFIED',
    gate: GATE_ID,
    mode: MODE,
    reasons: reasons.slice(),
    evaluatedAt: now.toISOString(),
    identity: null
  };
}

function evaluateSelfHostedReleaseIdentity(identity, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now === undefined ? Date.now() : options.now);
  const maxAgeSeconds = Number.isFinite(Number(options.maxAgeSeconds))
    ? Number(options.maxAgeSeconds)
    : DEFAULT_MAX_AGE_SECONDS;

  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    return untrusted(['SELF_HOSTED_IDENTITY_MISSING'], now);
  }

  const reasons = [];

  if (String(identity.schemaVersion || '') !== SCHEMA_VERSION) {
    reasons.push('SELF_HOSTED_IDENTITY_SCHEMA_INVALID');
  }

  const sourceCommit = String(identity.sourceCommit || '').trim().toLowerCase();
  if (!SHA40.test(sourceCommit)) reasons.push('SELF_HOSTED_SOURCE_COMMIT_INVALID');
  const expectedCommit = String(options.expectedCommit || '').trim().toLowerCase();
  if (expectedCommit && sourceCommit !== expectedCommit) {
    reasons.push('SELF_HOSTED_SOURCE_COMMIT_MISMATCH');
  }

  const archiveSha256 = String(identity.archiveSha256 || '').trim().toLowerCase();
  if (!SHA64.test(archiveSha256)) reasons.push('SELF_HOSTED_ARCHIVE_SHA256_INVALID');

  const tlsCertificateSha256 = String(identity.tlsCertificateSha256 || '').trim().toLowerCase();
  if (!SHA64.test(tlsCertificateSha256)) reasons.push('SELF_HOSTED_TLS_CERTIFICATE_SHA256_INVALID');

  let hostname = null;
  try {
    const parsed = new URL(String(identity.host || ''));
    if (parsed.username || parsed.password) reasons.push('SELF_HOSTED_HOST_HAS_CREDENTIALS');
    if (parsed.protocol !== 'https:') reasons.push('SELF_HOSTED_TLS_REQUIRED');
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) reasons.push('SELF_HOSTED_HOST_NOT_ORIGIN');
    if (!HOSTNAME_RE.test(parsed.hostname) || /\*/.test(parsed.hostname)) {
      reasons.push('SELF_HOSTED_HOST_INVALID');
    }
    hostname = parsed.hostname || null;
  } catch {
    reasons.push('SELF_HOSTED_HOST_INVALID');
  }

  const database = identity.databaseIdentity;
  if (!database || typeof database !== 'object' || Array.isArray(database)) {
    reasons.push('SELF_HOSTED_DATABASE_IDENTITY_MISSING');
  } else {
    const engine = String(database.engine || '').trim().toLowerCase();
    if (engine !== 'postgres' && engine !== 'postgresql') {
      reasons.push('SELF_HOSTED_DATABASE_ENGINE_UNSUPPORTED');
    }
    if (!/^[0-9]+(?:\.[0-9]+){0,2}/.test(String(database.serverVersion || '').trim())) {
      reasons.push('SELF_HOSTED_DATABASE_VERSION_INVALID');
    }
    if (!String(database.database || '').trim()) reasons.push('SELF_HOSTED_DATABASE_NAME_MISSING');
    if (!String(database.runtimeRole || '').trim()) reasons.push('SELF_HOSTED_RUNTIME_ROLE_MISSING');
    if (!String(database.directHost || '').trim() || !HOSTNAME_RE.test(String(database.directHost).trim())) {
      reasons.push('SELF_HOSTED_DATABASE_HOST_INVALID');
    }
    for (const flag of PRIVILEGE_FLAGS) {
      if (database[flag] !== false) reasons.push('SELF_HOSTED_RUNTIME_ROLE_NOT_LEAST_PRIVILEGE:' + flag);
    }
    if (database.directConnection !== true) {
      reasons.push('SELF_HOSTED_DIRECT_CONNECTION_NOT_CONFIRMED');
    }
  }

  const generatedAtRaw = String(identity.generatedAt || '').trim();
  const generatedAtMs = Date.parse(generatedAtRaw);
  if (!Number.isFinite(generatedAtMs)) {
    reasons.push('SELF_HOSTED_IDENTITY_TIMESTAMP_INVALID');
  } else {
    const ageMs = now.getTime() - generatedAtMs;
    if (ageMs > maxAgeSeconds * 1000) reasons.push('SELF_HOSTED_IDENTITY_STALE');
    if (ageMs < -FUTURE_TOLERANCE_MS) reasons.push('SELF_HOSTED_IDENTITY_FROM_FUTURE');
  }

  if (!String(identity.issuedBy || '').trim()) reasons.push('SELF_HOSTED_IDENTITY_ISSUER_MISSING');

  const attestation = identity.attestation;
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    reasons.push('SELF_HOSTED_ATTESTATION_MISSING');
  } else if (String(attestation.algorithm || '').trim().toLowerCase() !== 'sha256') {
    reasons.push('SELF_HOSTED_ATTESTATION_ALGORITHM_UNSUPPORTED');
  } else if (String(attestation.digest || '').trim().toLowerCase() !== attestationDigest(identity)) {
    reasons.push('SELF_HOSTED_ATTESTATION_MISMATCH');
  }

  if (reasons.length) return untrusted(reasons, now);

  return {
    status: 'PASS',
    gate: GATE_ID,
    mode: MODE,
    reasons: [],
    evaluatedAt: now.toISOString(),
    identity: {
      schemaVersion: SCHEMA_VERSION,
      sourceCommit,
      archiveSha256,
      host: identity.host,
      hostname,
      tlsCertificateSha256,
      database: sanitizedDatabase(database),
      generatedAt: new Date(generatedAtMs).toISOString(),
      issuedBy: String(identity.issuedBy).trim(),
      attestationDigest: attestationDigest(identity)
    }
  };
}

function readSelfHostedReleaseIdentity(filePath = DEFAULT_IDENTITY_PATH) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return { readStatus: 'PASS', identity: JSON.parse(raw) };
  } catch {
    return { readStatus: 'MISSING', identity: null };
  }
}

function createSelfHostedReleaseProof(env = process.env, options = {}) {
  const identityPath = String(
    options.identityPath || (env && env.OPSC_SELF_HOSTED_IDENTITY_PATH) || DEFAULT_IDENTITY_PATH
  ).trim();
  const { readStatus, identity } = readSelfHostedReleaseIdentity(identityPath);
  if (readStatus !== 'PASS') {
    const now = options.now instanceof Date ? options.now : new Date();
    const result = untrusted(['SELF_HOSTED_IDENTITY_FILE_MISSING'], now);
    return {
      ...result,
      platform: 'self-hosted',
      identityPathConfigured: Boolean(identityPath),
      deploymentBinding: 'NONE_REQUIRED'
    };
  }
  const result = evaluateSelfHostedReleaseIdentity(identity, {
    expectedCommit: options.expectedCommit || (env && (env.OPSC_SOURCE_COMMIT_SHA || env.OPSC_RELEASE_CI_COMMIT)),
    maxAgeSeconds: options.maxAgeSeconds,
    now: options.now
  });
  return {
    ...result,
    platform: 'self-hosted',
    identityPathConfigured: Boolean(identityPath),
    deploymentBinding: 'NONE_REQUIRED'
  };
}

module.exports = {
  SCHEMA_VERSION,
  GATE_ID,
  MODE,
  DEFAULT_IDENTITY_PATH,
  DEFAULT_MAX_AGE_SECONDS,
  ATTESTED_FIELDS,
  PRIVILEGE_FLAGS,
  canonicalJson,
  attestationDigest,
  evaluateSelfHostedReleaseIdentity,
  readSelfHostedReleaseIdentity,
  createSelfHostedReleaseProof
};
