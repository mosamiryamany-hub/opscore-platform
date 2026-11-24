'use strict';

/**
 * Build an Ed25519-signed self-hosted release identity.
 *
 * Usage:
 *   node scripts/self-hosted-release-identity.js --print-partial
 *   node scripts/self-hosted-release-identity.js --input partial.json --output identity.json --private-key operator-ed25519-private.pem --key-id buyer-release-2026
 *
 * The private key is read locally and is never copied to the identity file or
 * printed. The matching public key must be pinned in the buyer runtime as
 * OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY; OPSC_SELF_HOSTED_ATTESTATION_KEY_ID
 * may pin the expected key identifier.
 *
 * The signer is responsible for measuring every input fact. This script signs
 * operator-supplied measurements; it does not independently probe the archive,
 * TLS endpoint, or database.
 */

const crypto = require('node:crypto');
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
  const args = { input: null, output: null, privateKey: null, keyId: null, printPartial: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') args.input = argv[++i];
    else if (token === '--output') args.output = argv[++i];
    else if (token === '--private-key') args.privateKey = argv[++i];
    else if (token === '--key-id') args.keyId = argv[++i];
    else if (token === '--print-partial') args.printPartial = true;
    else throw new Error('SELF_HOSTED_IDENTITY_ARGUMENT_INVALID:' + token);
  }
  return args;
}

function buildIdentity(partial, privateKeyPem, keyId) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error('SELF_HOSTED_IDENTITY_PARTIAL_INVALID');
  }
  if ('attestation' in partial) {
    throw new Error('SELF_HOSTED_IDENTITY_PARTIAL_HAS_ATTESTATION');
  }
  if (!String(privateKeyPem || '').trim()) {
    throw new Error('SELF_HOSTED_IDENTITY_PRIVATE_KEY_REQUIRED');
  }
  if (!proof.KEY_ID_RE.test(String(keyId || ''))) {
    throw new Error('SELF_HOSTED_IDENTITY_KEY_ID_INVALID');
  }

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('SELF_HOSTED_IDENTITY_PRIVATE_KEY_TYPE_INVALID');
  }

  const identity = {};
  for (const field of proof.ATTESTED_FIELDS) identity[field] = partial[field];
  const signature = crypto.sign(
    null,
    proof.attestationPayload(identity, keyId),
    privateKey
  ).toString('base64');
  identity.attestation = { algorithm: 'ed25519', keyId, signature };
  return identity;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printPartial) {
    process.stdout.write(JSON.stringify(PARTIAL_TEMPLATE, null, 2) + '\n');
    return 0;
  }
  if (!args.input || !args.output || !args.privateKey || !args.keyId) {
    throw new Error('SELF_HOSTED_IDENTITY_INPUT_OUTPUT_PRIVATE_KEY_AND_KEY_ID_REQUIRED');
  }
  const partial = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
  const privateKeyPem = fs.readFileSync(path.resolve(args.privateKey), 'utf8');
  const identity = buildIdentity(partial, privateKeyPem, args.keyId);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(identity, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write('SELF_HOSTED_IDENTITY_WRITTEN ' + path.resolve(args.output) + '\n');
  process.stdout.write('ATTESTATION_ALGORITHM ed25519\n');
  process.stdout.write('ATTESTATION_KEY_ID ' + identity.attestation.keyId + '\n');
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
