'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');

const {Store} = require('../src/store');
const config = require('../src/config');
const {openDb} = require('../src/db');
const {safeError} = require('../src/egress-guard');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-hardening-'));
  const dbPath = path.join(root, 'opscore.db');
  return {root, dbPath, db: openDb(dbPath), repository: path.join(root, 'files')};
}

function close(f) {
  try { f.db.close(); } catch {}
  fs.rmSync(f.root, {recursive: true, force: true});
}

function owner(store, orgName, emailValue) {
  return store.bootstrap({
    orgName,
    email: emailValue,
    password: 'Owner-strong-pass-2026'
  });
}

test('multi-organization login is explicit and session-bound to the selected organization', () => {
  const f = fixture();
  try {
    const s = new Store(f.db, {sessionTtlHours: 24});
    const firstBoot = owner(s, 'Org A', 'multi@example.test');
    const first = s.login('multi@example.test', 'Owner-strong-pass-2026');
    const secondOrgId = 'org_b_' + crypto.randomUUID();
    const created = new Date().toISOString();
    f.db.prepare('INSERT INTO organizations(id,name,created_at) VALUES(?,?,?)').run(secondOrgId, 'Org B', created);
    f.db.prepare('INSERT INTO memberships(user_id,organization_id,role,created_at) VALUES(?,?,?,?)').run(first.userId, secondOrgId, 'admin', created);

    let pending;
    assert.throws(() => s.login('multi@example.test', 'Owner-strong-pass-2026'), err => {
      pending = err;
      return err.message === 'MULTIPLE_ORGANIZATIONS';
    });
    assert.deepEqual(pending.details.organizations.map(x => x.id).sort(), [first.organizationId, secondOrgId].sort());

    const selected = s.login('multi@example.test', 'Owner-strong-pass-2026', secondOrgId);
    assert.equal(selected.organizationId, secondOrgId);
    const current = s.session(selected.token);
    assert.equal(current.organizationId, secondOrgId);
    assert.equal(current.role, 'admin');
  } finally {
    close(f);
  }
});

test('schema v22 backfills legacy sessions and permanently binds them to one organization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-session-migration-'));
  const dbPath = path.join(root, 'legacy.db');
  try {
    const old = new DatabaseSync(dbPath);
    old.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE memberships (user_id TEXT NOT NULL, organization_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO organizations VALUES ('org-old-a','Old A','2026-01-01T00:00:00.000Z');
      INSERT INTO organizations VALUES ('org-old-b','Old B','2026-01-01T00:00:01.000Z');
      INSERT INTO users VALUES ('user-old','old@example.test','x','active','2026-01-01T00:00:00.000Z');
      INSERT INTO memberships VALUES ('user-old','org-old-a','owner','2026-01-01T00:00:00.000Z');
      INSERT INTO memberships VALUES ('user-old','org-old-b','admin','2026-01-01T00:00:01.000Z');
      INSERT INTO sessions VALUES ('ses-old','user-old','legacy-hash','2099-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
      PRAGMA user_version=21;
    `);
    old.close();
    const db = openDb(dbPath);
    const row = db.prepare('SELECT organization_id FROM sessions WHERE id=?').get('ses-old');
    assert.equal(row.organization_id, 'org-old-a');
    db.close();
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('attachment persistence rolls back database state when activity/outbox recording fails', () => {
  const f = fixture();
  const previous = process.env.OPSC_REPOSITORY_PATH;
  process.env.OPSC_REPOSITORY_PATH = f.repository;
  try {
    const s = new Store(f.db, config);
    owner(s, 'Attachment Org', 'attach@example.test');
    const o = s.login('attach@example.test', 'Owner-strong-pass-2026');
    const w = s.createWorkOrder(o, {title: 'Attachment integrity'});
    const originalActivity = s._activity.bind(s);
    s._activity = () => { throw new Error('AUDIT_ACTIVITY_FAIL'); };
    assert.throws(() => s.storeAttachment(o, {
      workOrderId: w.id,
      fileName: 'note.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from('hello attachment').toString('base64')
    }), /AUDIT_ACTIVITY_FAIL/);
    s._activity = originalActivity;
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attachments WHERE organization_id=?').get(o.organizationId).n, 0);
    const files = fs.existsSync(f.repository) ? fs.readdirSync(f.repository, {recursive: true}).filter(x => { const abs = path.join(f.repository, x); return fs.existsSync(abs) && fs.statSync(abs).isFile(); }) : [];
    assert.equal(files.length, 0);
  } finally {
    if (previous === undefined) delete process.env.OPSC_REPOSITORY_PATH;
    else process.env.OPSC_REPOSITORY_PATH = previous;
    close(f);
  }
});

test('evidence completion is transactional and retryable after a post-write failure', () => {
  const f = fixture();
  const previous = process.env.OPSC_REPOSITORY_PATH;
  process.env.OPSC_REPOSITORY_PATH = f.repository;
  try {
    const s = new Store(f.db, config);
    owner(s, 'Evidence Org', 'evidence@example.test');
    const o = s.login('evidence@example.test', 'Owner-strong-pass-2026');
    const w = s.createWorkOrder(o, {title: 'Evidence integrity'});
    const content = Buffer.from('evidence transaction');
    const upload = s.initiateEvidenceUpload(o, {
      workOrderId: w.id,
      fileName: 'evidence.txt',
      mediaType: 'text/plain',
      totalBytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    });
    s.putEvidenceChunk(o, upload.uploadId, 0, content.toString('base64'));
    const originalActivity = s._activity.bind(s);
    s._activity = () => { throw new Error('EVIDENCE_ACTIVITY_FAIL'); };
    assert.throws(() => s.completeEvidenceUpload(o, upload.uploadId), /EVIDENCE_ACTIVITY_FAIL/);
    s._activity = originalActivity;
    const state = f.db.prepare('SELECT status,committed_attachment_id FROM evidence_uploads WHERE id=?').get(upload.uploadId);
    assert.equal(state.status, 'ready');
    assert.equal(state.committed_attachment_id, null);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attachments WHERE organization_id=?').get(o.organizationId).n, 0);
    const retry = s.completeEvidenceUpload(o, upload.uploadId);
    assert.equal(retry.file_name, 'evidence.txt');
    assert.equal(f.db.prepare('SELECT status FROM evidence_uploads WHERE id=?').get(upload.uploadId).status, 'committed');
  } finally {
    if (previous === undefined) delete process.env.OPSC_REPOSITORY_PATH;
    else process.env.OPSC_REPOSITORY_PATH = previous;
    close(f);
  }
});

test('weak tenant master keys fail closed and sensitive field reveals are audited without plaintext', () => {
  const f = fixture();
  const previous = process.env.OPSC_TENANT_MASTER_KEY;
  try {
    const s = new Store(f.db, config);
    owner(s, 'Crypto Org', 'crypto@example.test');
    const o = s.login('crypto@example.test', 'Owner-strong-pass-2026');
    process.env.OPSC_TENANT_MASTER_KEY = 'too-short';
    assert.throws(() => s.protectTenantField(o, {fieldName: 'secret', value: 'value'}), /TENANT_MASTER_KEY_TOO_WEAK/);
    process.env.OPSC_TENANT_MASTER_KEY = 'test-tenant-master-key-2026-very-strong-32-bytes';
    const protectedValue = s.protectTenantField(o, {fieldName: 'secret', value: 'value'});
    const revealed = s.revealTenantField(o, {fieldName: 'secret', ciphertext: protectedValue.ciphertext});
    assert.equal(revealed.value, 'value');
    const row = f.db.prepare("SELECT action,metadata_json FROM audit_log WHERE organization_id=? AND action='tenant_field_revealed' ORDER BY rowid DESC LIMIT 1").get(o.organizationId);
    assert.ok(row);
    assert.equal(JSON.parse(row.metadata_json).value, undefined);
    assert.equal(JSON.parse(row.metadata_json).fieldName, 'secret');
  } finally {
    if (previous === undefined) delete process.env.OPSC_TENANT_MASTER_KEY;
    else process.env.OPSC_TENANT_MASTER_KEY = previous;
    close(f);
  }
});

test('safe error handling rejects arbitrary exception text as public error codes', () => {
  assert.equal(safeError(new Error('Unexpected database password=super-secret')) .code, 'ERROR');
  assert.equal(safeError(new Error('KNOWN_ERROR:details')) .code, 'KNOWN_ERROR');
});
