'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseDatabaseUrl, readKey, pgPassEscape, encryptFile, decryptFile } = require('../scripts/backup-postgres-encrypted');

test('PostgreSQL backup URL parser rejects unsupported protocols and missing credentials', () => {
  assert.equal(parseDatabaseUrl('postgresql://backup:secret@db.example.test:5432/opscore').hostname, 'db.example.test');
  assert.throws(() => parseDatabaseUrl('https://db.example.test/opscore'), /BACKUP_DATABASE_URL_INVALID/);
  assert.throws(() => parseDatabaseUrl('postgresql://backup@db.example.test/opscore'), /BACKUP_DATABASE_URL_INVALID/);
});

test('backup encryption key must decode to exactly 32 bytes', () => {
  assert.equal(readKey(crypto.randomBytes(32).toString('base64')).length, 32);
  assert.throws(() => readKey(Buffer.from('too short').toString('base64')), /BACKUP_KEY_MUST_BE_BASE64_32_BYTES/);
});

test('AES-256-GCM backup round-trip succeeds and tampering is rejected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-backup-test-'));
  const input = path.join(dir, 'source.dump');
  const encrypted = path.join(dir, 'source.enc');
  const restored = path.join(dir, 'restored.dump');
  const tampered = path.join(dir, 'tampered.enc');
  const rejected = path.join(dir, 'rejected.dump');
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(input, crypto.randomBytes(4096), { mode: 0o600 });
    await encryptFile(input, encrypted, key);
    await decryptFile(encrypted, restored, key);
    assert.deepEqual(fs.readFileSync(restored), fs.readFileSync(input));
    const bytes = fs.readFileSync(encrypted);
    bytes[bytes.length - 1] ^= 0x01;
    fs.writeFileSync(tampered, bytes, { mode: 0o600 });
    await assert.rejects(() => decryptFile(tampered, rejected, key));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pgpass values escape delimiters and reject line breaks', () => {
  assert.equal(pgPassEscape('user:part\\name'), 'user\\:part\\\\name');
  assert.throws(() => pgPassEscape('bad\nentry'), /BACKUP_PGPASS_VALUE_INVALID/);
});
