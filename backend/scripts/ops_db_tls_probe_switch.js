'use strict';
/**
 * Read-only TLS probe of the production database endpoints, then — only when a
 * direct (non-pooler) endpoint negotiates verified TLS with the SAME
 * credentials, role, and database — rewrite only the production Vercel
 * OPSC_DATABASE_URL, the runtime connection selected by production config.
 *
 * TLS qualification reads the actual Node TLSSocket used by the client. Neon
 * terminates client TLS at its proxy, so PostgreSQL pg_stat_ssl can report
 * ssl=false for the backend leg even when this client-to-Neon connection is
 * encrypted and its certificate is authorized. The runtime diagnostic uses
 * the same client-socket evidence for client_tls_configuration.
 *
 * The script never prints a hostname, credential, or URL. Only SHA-256
 * host fingerprints and non-secret TLS metadata are emitted.
 */
const crypto = require('node:crypto');
const { Client } = require('pg');
const { normalizePostgresConnectionString } = require('../src/adapters/postgres');

const REQUIRED_CONFIRM = 'SWITCH_PRODUCTION_DB_TO_DIRECT_TLS';
const POOLER_SUFFIX = '-pooler';
const EXPECTED_RUNTIME_USER = 'opscore_runtime';
const EXPECTED_DATABASE = 'opscore_acceptance';
// Production config intentionally uses OPSC_DATABASE_URL only and refuses
// DATABASE_URL fallback. DATABASE_URL may be an administrative/migration URL;
// do not validate or rewrite it as an application-worker connection.
const ENV_KEYS = ['OPSC_DATABASE_URL'];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function endpointLabel(hostname) {
  return String(hostname).split('.')[0];
}

function classifyHostname(hostname) {
  return endpointLabel(hostname).endsWith(POOLER_SUFFIX) ? 'pooled' : 'direct';
}

function withHostname(rawUrl, hostname) {
  const url = new URL(rawUrl);
  url.hostname = hostname;
  return url.toString();
}

function directEndpointUrl(rawUrl, hostname) {
  const url = new URL(withHostname(rawUrl, hostname));
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

function canonicalEndpointHost(hostname) {
  const labels = String(hostname).split('.');
  labels[0] = labels[0].endsWith(POOLER_SUFFIX)
    ? labels[0].slice(0, -POOLER_SUFFIX.length)
    : labels[0];
  return labels.join('.').toLowerCase();
}

function validateEnvironmentUrls(env, referenceUrl) {
  const reference = new URL(referenceUrl);
  const values = {};
  for (const key of ENV_KEYS) {
    const value = String(env[key] || '').trim();
    if (!value) {
      const error = new Error('ENV_KEY_SECRET_ABSENT');
      error.code = 'ENV_KEY_SECRET_ABSENT';
      throw error;
    }
    let parsed;
    try { parsed = new URL(value); }
    catch {
      const error = new Error('ENV_KEY_URL_INVALID');
      error.code = 'ENV_KEY_URL_INVALID';
      throw error;
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      const error = new Error('ENV_KEY_PROTOCOL_UNEXPECTED');
      error.code = 'ENV_KEY_PROTOCOL_UNEXPECTED';
      throw error;
    }
    if (canonicalEndpointHost(parsed.hostname) !== canonicalEndpointHost(reference.hostname)) {
      const error = new Error('ENV_KEY_ENDPOINT_UNEXPECTED');
      error.code = 'ENV_KEY_ENDPOINT_UNEXPECTED';
      throw error;
    }
    if (decodeURIComponent(parsed.username) !== EXPECTED_RUNTIME_USER) {
      const error = new Error('ENV_KEY_RUNTIME_ROLE_UNEXPECTED');
      error.code = 'ENV_KEY_RUNTIME_ROLE_UNEXPECTED';
      error.key = key;
      throw error;
    }
    if (parsed.pathname.replace(/^\/+/, '') !== EXPECTED_DATABASE) {
      const error = new Error('ENV_KEY_DATABASE_UNEXPECTED');
      error.code = 'ENV_KEY_DATABASE_UNEXPECTED';
      throw error;
    }
    // This is the exact runtime URL selected by backend/src/config.js in
    // production. DATABASE_URL is deliberately outside this switch.
    values[key] = value;
  }
  return values;
}
function variants(rawUrl) {
  const url = new URL(rawUrl);
  const label = endpointLabel(url.hostname);
  const rest = url.hostname.split('.').slice(1).join('.');
  const base = label.endsWith(POOLER_SUFFIX) ? label.slice(0, -POOLER_SUFFIX.length) : label;
  const candidates = [
    { variant: 'as-configured', hostname: url.hostname },
    { variant: 'direct', hostname: `${base}.${rest}` },
    { variant: 'pooled', hostname: `${base}${POOLER_SUFFIX}.${rest}` }
  ];
  const seen = new Set();
  return candidates.filter(candidate => {
    if (seen.has(candidate.hostname)) return false;
    seen.add(candidate.hostname);
    return true;
  });
}

function buildTlsProbeConfig(href, env = process.env) {
  const sslMode = String(env.OPSC_PG_SSL_MODE || 'verify-full').trim().toLowerCase();
  const rejectUnauthorized = String(env.OPSC_PG_SSL_REJECT_UNAUTHORIZED || 'true').trim().toLowerCase();
  if (sslMode !== 'verify-full' || rejectUnauthorized !== 'true') {
    const error = new Error('TLS_PROBE_STRICT_TLS_REQUIRED');
    error.code = 'TLS_PROBE_STRICT_TLS_REQUIRED';
    throw error;
  }

  // Keep this probe aligned with the production adapter. node-postgres lets
  // sslmode/sslrootcert/sslcert/sslkey URL parameters replace the explicit ssl
  // object; normalize first so a stale sslmode=disable cannot silently turn
  // the supposedly verified probe into a plaintext connection.
  const normalized = normalizePostgresConnectionString(href, env);
  return {
    connectionString: normalized.connectionString,
    ssl: {
      rejectUnauthorized: true,
      ca: env.OPSC_PG_CA_CERT || normalized.tls.ca || undefined,
      cert: normalized.tls.cert || undefined,
      key: normalized.tls.key || undefined
    }
  };
}

function cipherStrengthBits(value) {
  const cipher = String(value || '');
  if (cipher === 'TLS_AES_128_GCM_SHA256') return 128;
  if (cipher === 'TLS_AES_256_GCM_SHA384' || cipher === 'TLS_CHACHA20_POLY1305_SHA256') return 256;
  const match = cipher.match(/^(?:ECDHE-(?:RSA|ECDSA)|DHE-RSA)-AES(128|256)-GCM-SHA(?:256|384)$/);
  return match ? Number(match[1]) : null;
}

function readClientTlsEvidence(client) {
  const stream = client && client.connection && client.connection.stream;
  if (!stream || typeof stream.getProtocol !== 'function' || typeof stream.getCipher !== 'function') {
    return { ssl: false, authorized: false, tlsVersion: null, tlsCipher: null, tlsBits: null };
  }
  const protocol = String(stream.getProtocol() || '');
  const cipherValue = stream.getCipher();
  const cipher = cipherValue && /^[A-Za-z0-9_.-]{1,128}$/.test(String(cipherValue.name || ''))
    ? String(cipherValue.name) : null;
  return {
    ssl: Boolean(protocol),
    authorized: stream.authorized === true,
    tlsVersion: /^[A-Za-z0-9.]{1,32}$/.test(protocol) ? protocol : null,
    tlsCipher: cipher,
    tlsBits: cipherStrengthBits(cipher)
  };
}

function tlsEvidenceQualified(evidence) {
  return Boolean(evidence) &&
    evidence.ssl === true &&
    evidence.authorized === true &&
    ['TLSv1.2', 'TLSv1.3'].includes(String(evidence.tlsVersion || '')) &&
    Number.isInteger(evidence.tlsBits) && evidence.tlsBits >= 128;
}

async function probe(href) {
  const tlsConfig = buildTlsProbeConfig(href);
  const client = new Client({
    ...tlsConfig,
    connectionTimeoutMillis: 12000,
    statement_timeout: 8000,
    application_name: 'ops-tls-probe-readonly'
  });
  try {
    await client.connect();
    // Read TLS from the actual client socket. pg_stat_ssl is server-side and
    // does not attest the client-to-Neon-proxy TLS leg.
    const tls = readClientTlsEvidence(client);
    const identity = await client.query(
      'SELECT current_user, current_database(), current_setting(\'server_version\') AS server_version, pg_backend_pid() AS backend_pid'
    );
    return { ...tls, ...identity.rows[0] };
  } finally {
    try { await client.end(); } catch { /* already closed */ }
  }
}

async function main() {
  if (process.argv[2] !== REQUIRED_CONFIRM) {
    console.log('CONFIRM_INPUT_INVALID');
    process.exit(2);
  }
  const token = String(process.env.VERCEL_TOKEN || '').trim();
  const projectId = String(process.env.VERCEL_PROJECT_ID || '').trim();
  const teamId = String(process.env.VERCEL_ORG_ID || '').trim();
  const raw = String(process.env.OPSC_DATABASE_URL || '').trim();
  if (!token || !projectId) { console.log('VERCEL_CONTEXT_MISSING'); process.exit(2); }
  if (!raw) { console.log('OPSC_DATABASE_URL_SECRET_ABSENT'); process.exit(2); }

  const configuredHostname = new URL(raw).hostname;
  let envValues;
  try { envValues = validateEnvironmentUrls(process.env, raw); }
  catch (error) {
    const code = String((error && error.code) || 'ENVIRONMENT_URL_PREFLIGHT_FAILED');
    const key = ENV_KEYS.includes(error && error.key) ? ' ' + error.key : '';
    console.log(code + key);
    process.exit(1);
  }
  const configuredClass = classifyHostname(configuredHostname);
  console.log('CONFIGURED_ENDPOINT_CLASS ' + configuredClass);
  console.log('CONFIGURED_ENDPOINT_HOST_SHA256 ' + sha256(configuredHostname));

  const directCandidates = variants(raw);
  const observed = [];
  let directHostname = null;
  for (const candidate of directCandidates) {
    if (candidate.variant === 'direct') directHostname = candidate.hostname;
    const href = withHostname(raw, candidate.hostname);
    try {
      const row = await probe(href);
      const entry = {
        variant: candidate.variant,
        pooled: candidate.pooled,
        hostSha256: sha256(candidate.hostname),
        ssl: row.ssl === true,
        authorized: row.authorized === true,
        tlsVersion: row.tlsVersion || null,
        tlsCipher: row.tlsCipher || null,
        tlsBits: Number.isInteger(row.tlsBits) ? row.tlsBits : null,
        currentUser: row.current_user || null,
        database: row.current_database || null
      };
      observed.push(entry);
      console.log('TLS_PROBE_RESULT ' + JSON.stringify(entry));
    } catch (error) {
      observed.push({ variant: candidate.variant, pooled: candidate.pooled, hostSha256: sha256(candidate.hostname), failed: true });
      console.log('TLS_PROBE_FAILED ' + JSON.stringify({
        variant: candidate.variant,
        pooled: candidate.pooled,
        code: (error && error.code) || 'CONNECT_FAILED',
        authFailure: /password|authentication/i.test(String(error && error.message || ''))
      }));
    }
  }

  const asConfigured = observed.find(entry => entry.variant === 'as-configured');
  if (configuredClass === 'direct') directHostname = configuredHostname;
  const directEntry = configuredClass === 'direct'
    ? asConfigured
    : observed.find(entry => entry.variant === 'direct' && entry.ssl === true);
  const expectedDatabase = (asConfigured && asConfigured.database) || EXPECTED_DATABASE;
  const directQualified = tlsEvidenceQualified(directEntry) &&
    directEntry.currentUser === EXPECTED_RUNTIME_USER &&
    directEntry.database === expectedDatabase;

  if (!directQualified) {
    console.log(configuredClass === 'direct'
      ? 'TLS_PROBE_DIRECT_NOT_VERIFIED_NO_SWITCH'
      : 'TLS_PROBE_DIRECT_NOT_QUALIFIED_NO_SWITCH');
    process.exit(1);
  }

  // Verify the exact production runtime credential again against the selected
  // direct endpoint. The client socket must negotiate verified TLS; a backend
  // pg_stat_ssl row is not evidence for the external client-to-Neon TLS leg.
  for (const key of ENV_KEYS) {
    const candidateUrl = directEndpointUrl(envValues[key], directHostname);
    let row;
    try { row = await probe(candidateUrl); }
    catch (error) {
      console.log('TLS_PROBE_ENV_KEY_FAILED ' + JSON.stringify({
        key,
        code: (error && error.code) || 'CONNECT_FAILED',
        authFailure: /password|authentication/i.test(String(error && error.message || ''))
      }));
      process.exit(1);
    }
    const qualified = tlsEvidenceQualified(row) &&
      row.current_user === EXPECTED_RUNTIME_USER &&
      row.current_database === EXPECTED_DATABASE;
    if (!qualified) {
      console.log('TLS_PROBE_ENV_KEY_NOT_QUALIFIED ' + key);
      process.exit(1);
    }
    console.log('TLS_PROBE_ENV_KEY_VERIFIED ' + key + ' ' + String(row.tlsVersion));
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const listResponse = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env${query}`, { headers });
  if (!listResponse.ok) { console.log('VERCEL_ENV_LIST_FAILED ' + listResponse.status); process.exit(1); }
  const listPayload = await listResponse.json();
  const envs = Array.isArray(listPayload.envs) ? listPayload.envs : [];

  for (const key of ENV_KEYS) {
    const directHref = directEndpointUrl(envValues[key], directHostname);
    const existing = envs.find(entry => entry.key === key);
    // Vercel rejects PATCH bodies that restate `key` or change `type` on a
    // Sensitive Environment Variable (HTTP 400). Verified live:
    //   PATCH {key,value,type}      -> 400 "You cannot change the type of a Sensitive Environment Variable."
    //   PATCH {key,value,type:same} -> 400 "You cannot change the key of a Sensitive Environment Variable."
    //   PATCH {value}               -> 200
    // So an existing variable is updated with a value-only PATCH that preserves
    // its original type; the typed POST branch only runs when the key is absent.
    const body = existing
      ? JSON.stringify({ value: directHref })
      : JSON.stringify({ key, value: directHref, type: 'encrypted', target: ['production'] });
    const url = existing
      ? `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env/${existing.id}${query}`
      : `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env${query}`;
    const response = await fetch(url, { method: existing ? 'PATCH' : 'POST', headers, body });
    console.log('ENV_UPSERT ' + key + ' ' + (existing ? 'PATCH' : 'POST') + ' HTTP ' + response.status);
    if (!response.ok) {
      console.log('ENV_UPSERT_REJECTED ' + (await response.text()).slice(0, 200));
      process.exit(1);
    }
  }
  console.log('SWITCH_DONE production database URLs now use the direct endpoint; TLS is negotiated into the compute node with certificate verification. Values are not echoed.');
}

if (require.main === module) {
  main().catch(error => {
    console.log('TLS_SWITCH_UNEXPECTED ' + String((error && error.code) || (error && error.name) || 'ERROR'));
    process.exit(1);
  });
}

module.exports = {
  buildTlsProbeConfig, cipherStrengthBits, classifyHostname, directEndpointUrl,
  readClientTlsEvidence, tlsEvidenceQualified, validateEnvironmentUrls, variants, withHostname
};
