const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {openDb} = require('../src/db');
const {Store} = require('../src/store');
const config = require('../src/config');

function fixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-evidence-resilience-'));
  const dbPath = path.join(repo, 'opscore.db');
  const oldRepo = process.env.OPSC_REPOSITORY_PATH;
  const oldDb = process.env.OPSC_SQLITE_PATH;
  process.env.OPSC_REPOSITORY_PATH = repo;
  process.env.OPSC_SQLITE_PATH = dbPath;
  const db = openDb(dbPath);
  const store = new Store(db, {...config, sqlitePath: dbPath});
  const b = store.bootstrap({orgName:'Evidence Resilience', email:`owner-${crypto.randomUUID()}@example.test`, password:'Strong-pass-2026'});
  const ctx = {organizationId:b.orgId, userId:b.userId, role:'owner', scopes:['*']};
  return {repo, db, store, ctx, restore() {
    db.close();
    if (oldRepo === undefined) delete process.env.OPSC_REPOSITORY_PATH; else process.env.OPSC_REPOSITORY_PATH = oldRepo;
    if (oldDb === undefined) delete process.env.OPSC_SQLITE_PATH; else process.env.OPSC_SQLITE_PATH = oldDb;
    fs.rmSync(repo, {recursive:true, force:true});
  }};
}

test('evidence initiation is idempotent for retried requests', () => {
  const f = fixture();
  try {
    const wo = f.store.createWorkOrder(f.ctx, {title:'Retry-safe evidence'});
    const payload = {workOrderId:wo.id, body:{fileName:'proof.txt',mediaType:'text/plain',totalBytes:4,sha256:crypto.createHash('sha256').update('real').digest('hex')}};
    const first = f.store.idempotentWrite(f.ctx, 'evidence_upload_initiate', 'evidence-init-1', payload, () => f.store.initiateEvidenceUpload(f.ctx, {...payload.body, workOrderId: wo.id}));
    const replay = f.store.idempotentWrite(f.ctx, 'evidence_upload_initiate', 'evidence-init-1', payload, () => f.store.initiateEvidenceUpload(f.ctx, {...payload.body, workOrderId: wo.id}));
    assert.equal(first.__idempotent, false);
    assert.equal(replay.__idempotent, true);
    assert.equal(replay.payload.uploadId, first.payload.uploadId);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM evidence_uploads WHERE organization_id=?').get(f.ctx.organizationId).n, 1);
    assert.throws(() => f.store.idempotentWrite(f.ctx, 'evidence_upload_initiate', 'evidence-init-1', {...payload, body:{...payload.body,fileName:'changed.txt'}}, () => f.store.initiateEvidenceUpload(f.ctx, {...payload.body, workOrderId: wo.id})), /IDEMPOTENCY_KEY_REUSED/);
  } finally { f.restore(); }
});

test('evidence chunk upload recovers a crash orphan when bytes and digest match', () => {
  const f = fixture();
  try {
    const wo = f.store.createWorkOrder(f.ctx, {title:'Orphan recovery'});
    const buf = Buffer.from('real');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const u = f.store.initiateEvidenceUpload(f.ctx, {workOrderId:wo.id,fileName:'proof.txt',mediaType:'text/plain',totalBytes:buf.length,sha256:sha});
    const row = f.db.prepare('SELECT storage_key FROM evidence_uploads WHERE id=?').get(u.uploadId);
    const fp = path.join(process.env.OPSC_RELEASE_VERIFICATION_ROOT || process.env.OPSC_REPOSITORY_PATH, row.storage_key, 'chunk-0.bin');
    fs.mkdirSync(path.dirname(fp), {recursive:true});
    fs.writeFileSync(fp, buf, {flag:'wx'});
    const out = f.store.putEvidenceChunk(f.ctx, u.uploadId, 0, buf.toString('base64'));
    assert.equal(out.status, 'ready');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM evidence_upload_chunks WHERE upload_id=?').get(u.uploadId).n, 1);
    assert.equal(fs.readFileSync(fp).toString(), 'real');
  } finally { f.restore(); }
});

test('evidence chunk upload rejects a conflicting crash orphan instead of overwriting it', () => {
  const f = fixture();
  try {
    const wo = f.store.createWorkOrder(f.ctx, {title:'Orphan conflict'});
    const expected = Buffer.from('real');
    const sha = crypto.createHash('sha256').update(expected).digest('hex');
    const u = f.store.initiateEvidenceUpload(f.ctx, {workOrderId:wo.id,fileName:'proof.txt',mediaType:'text/plain',totalBytes:expected.length,sha256:sha});
    const row = f.db.prepare('SELECT storage_key FROM evidence_uploads WHERE id=?').get(u.uploadId);
    const fp = path.join(process.env.OPSC_RELEASE_VERIFICATION_ROOT || process.env.OPSC_REPOSITORY_PATH, row.storage_key, 'chunk-0.bin');
    fs.mkdirSync(path.dirname(fp), {recursive:true});
    fs.writeFileSync(fp, Buffer.from('evil'), {flag:'wx'});
    assert.throws(() => f.store.putEvidenceChunk(f.ctx, u.uploadId, 0, expected.toString('base64')), /EVIDENCE_CHUNK_STORAGE_CONFLICT/);
    assert.equal(fs.readFileSync(fp).toString(), 'evil');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM evidence_upload_chunks WHERE upload_id=?').get(u.uploadId).n, 0);
  } finally { f.restore(); }
});

test('mobile critical-write contract includes evidence upload initiation', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../mobile/src/api.js'), 'utf8');
  assert.match(src, /evidence-uploads/);
  assert.match(src, /criticalWrite/);
});
