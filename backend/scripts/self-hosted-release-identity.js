'use strict';

/**
 * Build a self-hosted release identity file (SELF_HOSTED_RELEASE_IDENTITY.json)
 * from an operator-supplied partial JSON. The detached attestation digest is
 * computed here so the identity can be verified later by
 * src/self-hosted-release-proof.js.
 *
 * The script performs no network access and never reads credentials: the operator
 * supplies already-measured facts (commit SHA, archive SHA-256, TLS certificate
 * SHA-256, database identity flags).
 *
 * Usage:
 *   node scripts/self-hosted-release-identity.js --input partial.json --output identity.json
 *   node scripts/self-hosted-release-identity.js --print-partial
 */

const fs = require('node:fs');
const path = require('node:path');
const proof = require('../src/self-hosted-release-proof');

const PARTIAL_TEMPLATE = {
  schemaVersion: proof.SCHEMA_VERSION,
  sourceCommit: '<40-hex git commit of main used to build the archive>',
  archiveSha256: '<sha256 of the OpsCore release archive>',
  host: 'https://opscore.example.com',
  tlsCertificateSha256: '<sha256 of the PEM TLS certificate served on that host>',
  databaseIdentity: {
    engine: 'postgres',
    serverVersion: '18.1',
    database: 'opscore',
    runtimeRole: 'opscore_runtime',
    directHost: 'db.example.com',
    directConnection: true,
    bypassRls: false,
    superuser: false,
    createRole: false,
    createDb: false
  },
  generatedAt: '<ISO-8601 UTC timestamp of measurement>',
  issuedBy: '<operator identity that performed the measurements>'
};

function parseArgs(argv) {
  const args = { input: null, output: null, printPartial: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') args.input = argv[++i];
    else if (token === '--output') args.output = argv[++i];
    else if (token === '--print-partial') args.printPartial = true;
    else throw new Error('SELF_HOSTED_IDENTITY_ARGUMENT_INVALID:' + token);
  }
  return args;
}

function buildIdentity(partial) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error('SELF_HOSTED_IDENTITY_PARTIAL_INVALID');
  }
  if ('attestation' in partial) {
    throw new Error('SELF_HOSTED_IDENTITY_PARTIAL_HAS_ATTESTATION');
  }
  const identity = {};
  for (const field of proof.ATTESTED_FIELDS) identity[field] = partial[field];
  identity.attestation = {
    algorithm: 'sha256',
    digest: proof.attestationDigest(identity)
  };
  return identity;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printPartial) {
    process.stdout.write(JSON.stringify(PARTIAL_TEMPLATE, null, 2) + '\n');
    return 0;
  }
  if (!args.input || !args.output) {
    throw new Error('SELF_HOSTED_IDENTITY_INPUT_AND_OUTPUT_REQUIRED');
  }
  const partial = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
  const identity = buildIdentity(partial);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(identity, null, 2) + '\n');
  process.stdout.write('SELF_HOSTED_IDENTITY_WRITTEN ' + path.resolve(args.output) + '\n');
  process.stdout.write('ATTESTATION_SHA256 ' + identity.attestation.digest + '\n');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    process.stderr.write(String(err && err.message || err) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { PARTIAL_TEMPLATE, parseArgs, buildIdentity };
