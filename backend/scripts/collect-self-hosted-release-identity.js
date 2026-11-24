'use strict';

/**
 * Collect real buyer-host measurements and create an Ed25519-signed release identity.
 *
 * Required environment:
 *   OPSC_SELF_HOSTED_HOST=https://buyer.example.com
 *   OPSC_SELF_HOSTED_DATABASE_URL=postgresql://...?...sslmode=verify-full
 *   OPSC_SELF_HOSTED_DB_DIRECT_CONNECTION_CONFIRMED=true
 *   OPSC_SELF_HOSTED_ISSUED_BY=buyer-operator
 *
 * Usage:
 *   node backend/scripts/collect-self-hosted-release-identity.js \
 *     --archive /absolute/path/to/opscore-release.tar.gz \
 *     --private-key /secure/path/operator-ed25519-private.pem \
 *     --key-id buyer-release-2026 \
 *     --output /secure/path/SELF_HOSTED_RELEASE_IDENTITY.json
 *
 * This script measures the archive bytes, live HTTPS peer certificate and
 * PostgreSQL server/role attributes. The operator must still confirm that the
 * archive was built from the measured source commit and that the supplied DB
 * endpoint is direct (not a pooler); that direct-endpoint assertion is explicit.
 * It never prints connection strings or private key material.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const identityScript = require('./self-hosted-release-identity');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

function parseArgs(argv) {
  const args = { archive: null, privateKey: null, keyId: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--archive') args.archive = argv[++i];
    else if (token === '--private-key') args.privateKey = argv[++i];
    else if (token === '--key-id') args.keyId = argv[++i];
    else if (token === '--output') args.output = argv[++i];
    else throw new Error('SELF_HOSTED_COLLECTOR_ARGUMENT_INVALID:' + token);
  }
  if (!args.archive || !args.privateKey || !args.keyId || !args.output) {
    throw new Error('SELF_HOSTED_COLLECTOR_ARCHIVE_PRIVATE_KEY_KEY_ID_OUTPUT_REQUIRED');
  }
  return args;
}

function parseHttpsOrigin(raw) {
  let parsed;
  try { parsed = new URL(String(raw || '')); }
  catch { throw new Error('SELF_HOSTED_COLLECTOR_HTTPS_ORIGIN_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash
      || !HOSTNAME_RE.test(parsed.hostname) || /\*/.test(parsed.hostname)) {
    throw new Error('SELF_HOSTED_COLLECTOR_HTTPS_ORIGIN_INVALID');
  }
  return { origin: parsed.origin, hostname: parsed.hostname, port: Number(parsed.port || 443) };
}

function parsePostgresConnection(raw, env = process.env) {
  let parsed;
  try { parsed = new URL(String(raw || '')); }
  catch { throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !parsed.hostname || !parsed.username || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_URL_INVALID');
  }
  if (parsed.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_TLS_VERIFY_FULL_REQUIRED');
  }
  if (parsed.searchParams.has('sslcert') || parsed.searchParams.has('sslkey')) {
    throw new Error('SELF_HOSTED_COLLECTOR_CLIENT_CERT_AUTH_UNSUPPORTED');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (/pooler|pgbouncer/i.test(hostname) || hostname.includes('-pooler')) {
    throw new Error('SELF_HOSTED_COLLECTOR_DIRECT_DATABASE_HOST_REQUIRED');
  }
  if (String(env.OPSC_SELF_HOSTED_DB_DIRECT_CONNECTION_CONFIRMED || '').toLowerCase() !== 'true') {
    throw new Error('SELF_HOSTED_COLLECTOR_DIRECT_CONNECTION_CONFIRMATION_REQUIRED');
  }
  const caFile = String(env.OPSC_SELF_HOSTED_DB_CA_FILE || parsed.searchParams.get('sslrootcert') || '').trim();
  const ca = caFile ? fs.readFileSync(path.resolve(caFile), 'utf8') : undefined;
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('sslrootcert');
  return {
    connectionString: parsed.toString(),
    hostname,
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function measureTlsCertificate(origin) {
  const endpoint = parseHttpsOrigin(origin);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, digest) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(digest);
    };
    const socket = tls.connect({
      host: endpoint.hostname,
      port: endpoint.port,
      servername: endpoint.hostname,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    }, () => {
      try {
        if (!socket.authorized) throw new Error('SELF_HOSTED_COLLECTOR_TLS_CERTIFICATE_NOT_AUTHORIZED');
        const certificate = socket.getPeerCertificate(true);
        if (!certificate || !Buffer.isBuffer(certificate.raw) || certificate.raw.length === 0) {
          throw new Error('SELF_HOSTED_COLLECTOR_TLS_CERTIFICATE_UNAVAILABLE');
        }
        finish(null, crypto.createHash('sha256').update(certificate.raw).digest('hex'));
      } catch (error) {
        finish(error);
      }
    });
    socket.setTimeout(10000, () => finish(new Error('SELF_HOSTED_COLLECTOR_TLS_TIMEOUT')));
    socket.on('error', error => finish(new Error('SELF_HOSTED_COLLECTOR_TLS_PROBE_FAILED:' + error.code)));
  });
}

function databaseIdentityFromRow(row, hostname) {
  if (!row) throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_ROLE_NOT_FOUND');
  const boolean = (value, field) => {
    if (value === true || value === 't') return true;
    if (value === false || value === 'f') return false;
    throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_BOOLEAN_INVALID:' + field);
  };
  return {
    engine: 'postgres',
    serverVersion: String(row.server_version || '').trim(),
    database: String(row.database || '').trim(),
    runtimeRole: String(row.runtime_role || '').trim(),
    directHost: hostname,
    directConnection: true,
    bypassRls: boolean(row.bypass_rls, 'bypass_rls'),
    superuser: boolean(row.superuser, 'superuser'),
    createRole: boolean(row.create_role, 'create_role'),
    createDb: boolean(row.create_db, 'create_db')
  };
}

async function measureDatabaseIdentity(databaseUrl, env = process.env) {
  const connection = parsePostgresConnection(databaseUrl, env);
  const client = new Client({
    connectionString: connection.connectionString,
    ssl: connection.ssl,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
    application_name: 'opscore-self-hosted-release-identity-collector'
  });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT current_setting('server_version') AS server_version,
              current_database() AS database,
              current_user AS runtime_role,
              r.rolbypassrls AS bypass_rls,
              r.rolsuper AS superuser,
              r.rolcreaterole AS create_role,
              r.rolcreatedb AS create_db
         FROM pg_roles r
        WHERE r.rolname = current_user`
    );
    if (result.rows.length !== 1) throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_ROLE_NOT_FOUND');
    return databaseIdentityFromRow(result.rows[0], connection.hostname);
  } catch (error) {
    if (String(error && error.message || '').startsWith('SELF_HOSTED_COLLECTOR_')) throw error;
    throw new Error('SELF_HOSTED_COLLECTOR_DATABASE_PROBE_FAILED:' + String(error && error.code || 'UNKNOWN'));
  } finally {
    await client.end().catch(() => {});
  }
}

function sourceCommit(env = process.env) {
  const configured = String(env.OPSC_SOURCE_COMMIT_SHA || '').trim().toLowerCase();
  let actual = '';
  try {
    actual = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim().toLowerCase();
  } catch {
    if (!configured) throw new Error('SELF_HOSTED_COLLECTOR_SOURCE_COMMIT_UNAVAILABLE');
  }
  if (configured && actual && configured !== actual) {
    throw new Error('SELF_HOSTED_COLLECTOR_SOURCE_COMMIT_MISMATCH');
  }
  const commit = configured || actual;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SELF_HOSTED_COLLECTOR_SOURCE_COMMIT_INVALID');
  return commit;
}

async function collectIdentity(args, env = process.env) {
  const archivePath = path.resolve(args.archive);
  if (!fs.statSync(archivePath).isFile()) throw new Error('SELF_HOSTED_COLLECTOR_ARCHIVE_NOT_FILE');
  const host = parseHttpsOrigin(env.OPSC_SELF_HOSTED_HOST);
  const issuer = String(env.OPSC_SELF_HOSTED_ISSUED_BY || '').trim();
  if (!issuer) throw new Error('SELF_HOSTED_COLLECTOR_ISSUER_REQUIRED');
  const [archiveSha256, tlsCertificateSha256, databaseIdentity] = await Promise.all([
    sha256File(archivePath),
    measureTlsCertificate(host.origin),
    measureDatabaseIdentity(env.OPSC_SELF_HOSTED_DATABASE_URL, env)
  ]);
  const partial = {
    schemaVersion: require('../src/self-hosted-release-proof').SCHEMA_VERSION,
    sourceCommit: sourceCommit(env),
    archiveSha256,
    host: host.origin,
    tlsCertificateSha256,
    databaseIdentity,
    generatedAt: new Date().toISOString(),
    issuedBy: issuer
  };
  const privateKeyPem = fs.readFileSync(path.resolve(args.privateKey), 'utf8');
  return identityScript.buildIdentity(partial, privateKeyPem, args.keyId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const identity = await collectIdentity(args);
  const output = path.resolve(args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, JSON.stringify(identity, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write('SELF_HOSTED_IDENTITY_COLLECTED_AND_SIGNED ' + output + '\n');
  process.stdout.write('SOURCE_COMMIT ' + identity.sourceCommit + '\n');
  process.stdout.write('ARCHIVE_SHA256 ' + identity.archiveSha256 + '\n');
  process.stdout.write('TLS_CERTIFICATE_SHA256 ' + identity.tlsCertificateSha256 + '\n');
  process.stdout.write('DATABASE ' + identity.databaseIdentity.database + '\n');
  process.stdout.write('RUNTIME_ROLE ' + identity.databaseIdentity.runtimeRole + '\n');
  process.stdout.write('ATTESTATION_KEY_ID ' + identity.attestation.keyId + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(String(error && error.message || error) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  parseHttpsOrigin,
  parsePostgresConnection,
  sha256File,
  databaseIdentityFromRow,
  measureTlsCertificate,
  measureDatabaseIdentity,
  sourceCommit,
  collectIdentity
};
