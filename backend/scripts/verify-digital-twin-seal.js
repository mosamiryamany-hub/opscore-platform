#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyDigitalTwinSeal } = require('../src/digital-twin-seal');

function fail(reason, code = 2) {
  process.stdout.write(JSON.stringify({ schemaVersion: 'opscore.digital-twin-seal-verifier.v1', status: 'FAIL', reason }, null, 2) + '\n');
  process.exitCode = code;
}

const [sealPath, publicKeyPath] = process.argv.slice(2);
if (!sealPath || !publicKeyPath || sealPath.startsWith('--') || publicKeyPath.startsWith('--')) {
  fail('USAGE: node scripts/verify-digital-twin-seal.js <envelope.json> <trusted-public-key.pem>');
} else {
  try {
    const envelope = JSON.parse(fs.readFileSync(path.resolve(sealPath), 'utf8'));
    const publicKey = crypto.createPublicKey(fs.readFileSync(path.resolve(publicKeyPath)));
    const verified = verifyDigitalTwinSeal(envelope, publicKey);
    process.stdout.write(JSON.stringify({
      schemaVersion: 'opscore.digital-twin-seal-verifier.v1',
      status: verified.valid ? 'PASS' : 'FAIL',
      verification: verified,
      independentPublicationVerified: false,
      note: 'Signature verification does not prove an external provider retained this file immutably.'
    }, null, 2) + '\n');
    if (!verified.valid) process.exitCode = 1;
  } catch (error) {
    fail(error?.message || 'SEAL_VERIFICATION_FAILED', 1);
  }
}
