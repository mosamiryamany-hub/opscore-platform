'use strict';
/**
 * Read-only TLS probe of the production database endpoints, then — only when a
 * direct (non-pooler) endpoint negotiates verified TLS with the SAME
 * credentials, role, and database — rewrite the production Vercel environment
 * database URLs to that direct endpoint.
 *
 * Why: node-pg negotiates TLS, but when the connection enters through Neon's
 * pooled proxy the TLS leg terminates at the proxy and pg_stat_ssl reports
 * ssl=false for the backend session. A direct endpoint keeps TLS all the way
 * into the compute node, which is what the production runtime diagnostic
 * (client_tls_configuration) requires as evidence.
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
const ENV_KEYS = ['OPSC_DATABASE_URL', 'DATABASE_URL'];

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
    if (
      parsed.hostname !== reference.hostname ||
      parsed.username !== reference.username ||
      parsed.password !== reference.password ||
      parsed.pathname !== reference.pathname
    ) {
      const error = new Error('ENV_KEY_IDENTITY_UNEXPECTED');
      error.code = 'ENV_KEY_IDENTITY_UNEXPECTED';
      throw error;
    }
    values[key] = value;
  }
  return values;
}

function variants(rawUrl) {
  const url = new URL(rawUrl);
  const label = endpointLabel(url.hostname);
  const rest = url.hostname.split('.').slice(1).join('.');
  const base = label.endsWith(POOLER_SUFFIX) ? label.slice(0, POOLER_SUFFIX.length) : label;
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
    const tls = await client.query('SELECT ssl, version, cipher, bits FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    const identity = await client.query('SELECT current_user, current_database()');
    return { ...tls.rows[0], ...identity.rows[0] };
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
    console.log(String((error && error.code) || 'ENVIRONMENT_URL_PREFLIGHT_FAILED'));
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
        tlsVersion: row.version || null,
        tlsCipher: row.cipher || null,
        tlsBits: Number.isInteger(row.bits) ? row.bits : null,
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
  const directQualified = Boolean(directEntry) &&
    directEntry.ssl === true &&
    ['TLSv1.2', 'TLSv1.3'].includes(String(directEntry.tlsVersion || '')) &&
    Number.isInteger(directEntry.tlsBits) && directEntry.tlsBits >= 128 &&
    directEntry.currentUser === EXPECTED_RUNTIME_USER &&
    directEntry.database === expectedDatabase;

  if (!directQualified) {
    console.log(configuredClass === 'direct'
      ? 'TLS_PROBE_DIRECT_NOT_VERIFIED_NO_SWITCH'
      : 'TLS_PROBE_DIRECT_NOT_QUALIFIED_NO_SWITCH');
    process.exit(1);
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
    const body = JSON.stringify({ key, value: directHref, type: 'encrypted', target: ['production'] });
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

module.exports = { buildTlsProbeConfig, classifyHostname, directEndpointUrl, validateEnvironmentUrls, variants, withHostname };
