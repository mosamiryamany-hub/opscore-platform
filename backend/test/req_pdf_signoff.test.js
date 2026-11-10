'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('../src/db');
const { Store } = require('../src/store');

function fixture() {
  const p = path.join(os.tmpdir(), `opscore-req-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-req-files-${crypto.randomUUID()}`);
  const prev = process.env.OPSC_REPOSITORY_PATH;
  process.env.OPSC_REPOSITORY_PATH = filesDir;
  return { db, p, filesDir, prev };
}
function close(f) {
  f.db.close();
  for (const x of [f.p, `${f.p}-shm`, `${f.p}-wal`]) try { fs.unlinkSync(x); } catch {}
  try { fs.rmSync(f.filesDir, { recursive: true, force: true }); } catch {}
  if (f.prev === undefined) delete process.env.OPSC_REPOSITORY_PATH;
  else process.env.OPSC_REPOSITORY_PATH = f.prev;
}

// minimal 1x1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('REQ-03: customer signoff accepts optional PNG signature image', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Sig Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const c = s.createCustomer(o, { name: 'Cust' });
    const w = s.createWorkOrder(o, { title: 'Sign job', customerId: c.id });
    const out = s.customerSignoff(o, {
      workOrderId: w.id,
      signerName: 'Ali Client',
      acknowledgement: 'Work accepted',
      signatureImageBase64: PNG_1X1.toString('base64')
    });
    assert.equal(out.has_signature_image, 1);
    assert.ok(out.signature_image_sha256);
    assert.equal(out.signature_image_sha256, crypto.createHash('sha256').update(PNG_1X1).digest('hex'));
    // non-PNG rejected
    assert.throws(
      () => s.customerSignoff(o, {
        workOrderId: w.id,
        signerName: 'Bad',
        acknowledgement: 'x',
        signatureImageBase64: Buffer.from('not-png').toString('base64')
      }),
      /SIGNATURE_IMAGE_NOT_PNG/
    );
  } finally { close(f); }
});

test('REQ-02: estimate and invoice PDF generated from stored data with integrity hash', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Pdf Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const c = s.createCustomer(o, { name: 'Acme' });
    const est = s.createEstimate(o, {
      customerId: c.id,
      currency: 'SAR',
      lines: [{ description: 'Service visit', quantity: 1, unitPrice: 150 }]
    });
    const pdf = s.renderEstimatePdf(o, est.id);
    assert.ok(pdf.buffer);
    assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.sha256);
    assert.equal(pdf.sha256.length, 64);
    assert.match(pdf.fileName, /\.pdf$/);

    const inv = s.createInvoice(o, {
      customerId: c.id,
      currency: 'SAR',
      lines: [{ description: 'Service visit', quantity: 1, unitPrice: 150 }]
    });
    const ipdf = s.renderInvoicePdf(o, inv.id);
    assert.equal(ipdf.buffer.subarray(0, 5).toString(), '%PDF-');
    assert.ok(ipdf.sha256);

    const w = s.createWorkOrder(o, { title: 'Close job', customerId: c.id });
    const cpdf = s.renderCompletionPdf(o, w.id);
    assert.equal(cpdf.buffer.subarray(0, 5).toString(), '%PDF-');
  } finally { close(f); }
});
