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
  const p = path.join(os.tmpdir(), `opscore-demo-${crypto.randomUUID()}.db`);
  const db = openDb(p);
  const filesDir = path.join(os.tmpdir(), `opscore-demo-files-${crypto.randomUUID()}`);
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

test('A1 demo closeout path produces WO, evidence, signoff, invoice and PDFs', () => {
  const f = fixture(), s = new Store(f.db, { sessionTtlHours: 24 });
  try {
    s.bootstrap({ orgName: 'Demo Org', email: 'owner@example.com', password: 'Strong-pass-2026' });
    const o = s.login('owner@example.com', 'Strong-pass-2026');
    const out = s.runDemoCloseoutPath(o);
    assert.equal(out.schemaVersion, 'opscore.demo-closeout-path.v1');
    assert.ok(out.workOrderId);
    assert.ok(out.invoiceId);
    assert.ok(out.pdf.completionSha256);
    assert.ok(out.pdf.invoiceSha256);
    assert.equal(out.pdf.completionSha256.length, 64);
    const stepNames = out.steps.map((x) => x.step);
    assert.ok(stepNames.includes('create_customer'));
    assert.ok(stepNames.includes('create_work_order'));
    assert.ok(stepNames.includes('attach_evidence'));
    assert.ok(stepNames.includes('customer_signoff'));
    assert.ok(stepNames.includes('create_invoice'));
    assert.ok(stepNames.includes('render_completion_pdf'));
    // PDFs are valid
    const cpdf = s.renderCompletionPdf(o, out.workOrderId);
    assert.equal(cpdf.buffer.subarray(0, 5).toString(), '%PDF-');
    const ipdf = s.renderInvoicePdf(o, out.invoiceId);
    assert.equal(ipdf.buffer.subarray(0, 5).toString(), '%PDF-');
    // map may include check-in point
    assert.ok(out.dispatcherMapPointCount >= 0);
    assert.ok(out.notificationProviders);
  } finally {
    close(f);
  }
});
