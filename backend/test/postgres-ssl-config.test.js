'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePostgresConnectionString } = require('../src/adapters/postgres');

test('PostgreSQL adapter loads OPSC_PG_CA_CERT from a PEM file path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-pg-ca-'));
  const caFile = path.join(dir, 'ca.crt');
  const pem = '-----BEGIN CERTIFICATE-----\\nTEST-CA\\n-----END CERTIFICATE-----\\n';
  try {
    fs.writeFileSync(caFile, pem, { mode: 0o600 });
    const normalized = normalizePostgresConnectionString(
      'postgresql://runtime:secret@db.example.test:5432/opscore?sslmode=verify-full&sslrootcert=system',
      { OPSC_PG_CA_CERT: caFile }
    );
    assert.equal(normalized.tls.ca.toString(), pem);
    assert.equal(new URL(normalized.connectionString).searchParams.has('sslmode'), false);
    assert.equal(new URL(normalized.connectionString).searchParams.has('sslrootcert'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PostgreSQL adapter accepts an inline PEM CA and rejects unreadable CA paths', () => {
  const pem = '-----BEGIN CERTIFICATE-----\\nINLINE-CA\\n-----END CERTIFICATE-----\\n';
  const normalized = normalizePostgresConnectionString(
    'postgresql://runtime:secret@db.example.test:5432/opscore?sslmode=verify-full',
    { OPSC_PG_CA_CERT: pem }
  );
  assert.equal(normalized.tls.ca, pem);
  assert.throws(() => normalizePostgresConnectionString(
    'postgresql://runtime:secret@db.example.test:5432/opscore?sslmode=verify-full',
    { OPSC_PG_CA_CERT: '/definitely/missing/opscore-ca.pem' }
  ), /POSTGRES_TLS_CA_FILE_UNREADABLE/);
});

test('PostgreSQL adapter can load a CA path from the connection URL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-pg-ca-url-'));
  const caFile = path.join(dir, 'ca.crt');
  const pem = '-----BEGIN CERTIFICATE-----\\nURL-CA\\n-----END CERTIFICATE-----\\n';
  try {
    fs.writeFileSync(caFile, pem, { mode: 0o600 });
    const url = new URL('postgresql://runtime:secret@db.example.test:5432/opscore');
    url.searchParams.set('sslmode', 'verify-full');
    url.searchParams.set('sslrootcert', caFile);
    const normalized = normalizePostgresConnectionString(url.toString(), {});
    assert.equal(normalized.tls.ca.toString(), pem);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
