'use strict';
/**
 * Pure-JS PDF writer for OpsCore commercial/ops documents.
 * Data is supplied by the caller from stored rows only — never fabricated.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, '?');
}

function money(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2);
}

function padRight(s, n) {
  s = String(s ?? '');
  if (s.length > n) return s.slice(0, n - 1) + '\u2026';
  return s + ' '.repeat(Math.max(0, n - s.length));
}

function padLeft(s, n) {
  s = String(s ?? '');
  if (s.length > n) return s.slice(0, n);
  return ' '.repeat(Math.max(0, n - s.length)) + s;
}

function buildDocumentPdf(opts) {
  const orgName = opts.orgName || 'OpsCore Organization';
  const docTitle = opts.docTitle || 'Document';
  const docNumber = opts.docNumber || '';
  const metaLines = opts.metaLines || [];
  const bodyLines = opts.bodyLines || [];
  const footerNote = opts.footerNote || 'Generated from stored OpsCore data only.';

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const fontSize = 10;
  const titleSize = 16;
  const headerSize = 12;

  const lines = [];
  lines.push({ text: orgName, size: headerSize, gap: 6 });
  lines.push({ text: docTitle, size: titleSize, gap: 4 });
  if (docNumber) lines.push({ text: 'Document No. ' + docNumber, size: fontSize, gap: 8 });
  lines.push({ text: '------------------------------------------------------------------------', size: 9, gap: 8 });
  for (const m of metaLines) lines.push({ text: m, size: fontSize, gap: 2 });
  lines.push({ text: '------------------------------------------------------------------------', size: 9, gap: 10 });
  for (const b of bodyLines) lines.push({ text: b, size: fontSize, gap: 2 });
  lines.push({ text: '------------------------------------------------------------------------', size: 9, gap: 10 });
  lines.push({ text: footerNote, size: 9, gap: 4 });

  function render(extraFooterLines) {
    let y = pageHeight - margin;
    const ops = [];
    const all = lines.concat((extraFooterLines || []).map((t) => ({ text: t, size: 9, gap: 3 })));
    for (const row of all) {
      if (y < margin + 20) break;
      const sz = row.size || fontSize;
      ops.push('BT /F1 ' + sz + ' Tf 1 0 0 1 ' + margin + ' ' + y + ' Tm (' + esc(row.text) + ') Tj ET');
      y -= (row.gap != null ? row.gap : 2) + sz * 0.9;
    }
    const stream = ops.join('\n');
    const streamBytes = Buffer.byteLength(stream, 'utf8');
    const objects = [];
    objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
    objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
    objects.push(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        pageWidth +
        ' ' +
        pageHeight +
        '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n'
    );
    objects.push('4 0 obj<< /Length ' + streamBytes + ' >>stream\n' + stream + '\nendstream\nendobj\n');
    objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += obj;
    }
    const xrefPos = Buffer.byteLength(pdf, 'utf8');
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += 'trailer<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
    return Buffer.from(pdf, 'utf8');
  }

  const crypto = require('node:crypto');
  const payloadCanon = JSON.stringify({
    orgName,
    docTitle,
    docNumber,
    metaLines,
    bodyLines,
    footerNote
  });
  const contentSha = crypto.createHash('sha256').update(payloadCanon).digest('hex');
  const extraFooter = ['Content SHA-256: ' + contentSha];
  if (opts.generatedAt) extraFooter.push('Generated at: ' + String(opts.generatedAt));
  const buf = render(extraFooter);
  const fileSha = crypto.createHash('sha256').update(buf).digest('hex');

  return {
    buffer: buf,
    contentType: 'application/pdf',
    sha256: fileSha,
    contentSha256: contentSha,
    bytes: buf.length
  };
}

function lineTable(items) {
  const rows = [
    padRight('Description', 36) + padLeft('Qty', 8) + padLeft('Unit', 12) + padLeft('Total', 12)
  ];
  rows.push(
    padRight('-----------------------------------', 36) +
      padLeft('------', 8) +
      padLeft('----------', 12) +
      padLeft('----------', 12)
  );
  for (const it of items || []) {
    rows.push(
      padRight(it.description || '', 36) +
        padLeft(String(it.quantity ?? ''), 8) +
        padLeft(money(it.unitPrice), 12) +
        padLeft(money(it.lineTotal), 12)
    );
  }
  return rows;
}

function orgNameFromCtx(est) {
  return est.organization_name || est.orgName || 'OpsCore';
}

function pdfForEstimate(est) {
  const items = Array.isArray(est.lines) ? est.lines : [];
  const body = [
    ...lineTable(items),
    '',
    padRight('Subtotal', 56) + padLeft(money(est.subtotal), 12),
    padRight('Discount', 56) + padLeft(money(est.discount), 12),
    padRight('Tax', 56) + padLeft(money(est.tax), 12),
    padRight('TOTAL', 56) + padLeft(money(est.total), 12)
  ];
  return buildDocumentPdf({
    orgName: orgNameFromCtx(est),
    docTitle: 'ESTIMATE / QUOTE',
    docNumber: est.number || est.id,
    metaLines: [
      'Status: ' + (est.status || '—'),
      'Customer: ' + (est.customer_name || est.customerId || '—'),
      'Currency: ' + (est.currency || '—'),
      'Created: ' + (est.created_at || '—')
    ],
    bodyLines: body,
    footerNote: 'Integrity: totals derived from stored commercial lines only. No fabricated amounts.'
  });
}

function pdfForInvoice(inv) {
  const items = Array.isArray(inv.lines) ? inv.lines : [];
  const body = [
    ...lineTable(items),
    '',
    padRight('Subtotal', 56) + padLeft(money(inv.subtotal), 12),
    padRight('Discount', 56) + padLeft(money(inv.discount), 12),
    padRight('Tax', 56) + padLeft(money(inv.tax), 12),
    padRight('TOTAL', 56) + padLeft(money(inv.total), 12),
    padRight('Amount paid', 56) + padLeft(money(inv.amount_paid), 12)
  ];
  return buildDocumentPdf({
    orgName: orgNameFromCtx(inv),
    docTitle: 'INVOICE',
    docNumber: inv.number || inv.id,
    metaLines: [
      'Status: ' + (inv.status || '—'),
      'Customer: ' + (inv.customer_name || inv.customerId || '—'),
      'Currency: ' + (inv.currency || '—'),
      'Created: ' + (inv.created_at || '—'),
      'Due: ' + (inv.due_at || '—')
    ],
    bodyLines: body,
    footerNote: 'Integrity: totals derived from stored commercial lines only. No fabricated amounts.'
  });
}

function pdfForCompletion(pkg) {
  const w = pkg.workOrder || {};
  const body = [
    'Evidence attachments: ' + (pkg.attachments || []).length,
    'Customer sign-offs: ' + (pkg.signoffs || []).length,
    'Safety acknowledgements: ' + (pkg.safety || []).length,
    'Parts lines: ' + (pkg.parts || []).length,
    'Workflow transitions: ' + (pkg.workflowTransitions || []).length,
    '',
    'Completion package SHA-256: ' + (pkg.completionSha256 || '—')
  ];
  if (pkg.completionAssurance) {
    body.push(
      'Completion ready: ' +
        (pkg.completionAssurance.ready ? 'yes' : 'no') +
        (pkg.completionAssurance.blockers && pkg.completionAssurance.blockers.length
          ? ' | Blockers: ' + pkg.completionAssurance.blockers.join(', ')
          : '')
    );
  }
  if (pkg.checkIn) {
    body.unshift(
      'GPS check-in: ' +
        (pkg.checkIn.at || '—') +
        ' @ ' +
        pkg.checkIn.latitude +
        ',' +
        pkg.checkIn.longitude +
        ' (+/-' +
        (pkg.checkIn.accuracyMeters ?? '—') +
        ' m)'
    );
  }
  return buildDocumentPdf({
    orgName: w.customerName ? 'OpsCore / ' + w.customerName : 'OpsCore',
    docTitle: 'WORK ORDER CLOSEOUT REPORT',
    docNumber: w.number || w.id || '',
    metaLines: [
      'Title: ' + (w.title || '—'),
      'Status: ' + (w.status || '—'),
      'Customer: ' + (w.customerName || '—'),
      'Site: ' + (w.siteName || '—'),
      'Generated: ' + (pkg.generatedAt || '—')
    ],
    bodyLines: body,
    footerNote: 'Integrity: generated from stored completion package only.'
  });
}

module.exports = {
  buildDocumentPdf,
  buildPdf: function (title, lines) {
    return buildDocumentPdf({
      orgName: 'OpsCore',
      docTitle: title,
      docNumber: '',
      metaLines: [],
      bodyLines: lines
    });
  },
  pdfForEstimate,
  pdfForInvoice,
  pdfForCompletion
};
