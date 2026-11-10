'use strict';
const {warn}=require('./observability');
const {id, now} = require('./security');
const {requireRole} = require('./rbac');
const {audit} = require('./audit');
function text(v) {
  return String(v ?? '').trim();
}
function money(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0)
    return fallback;
  return Number(n.toFixed(2));
}
function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function iso(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function parseLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 500)
    throw new Error('INVALID_COMMERCIAL_LINES');
  const out = lines.map((x, i) => {
    const description = text(x?.description);
    const quantity = positive(x?.quantity);
    const unitPrice = money(x?.unitPrice, -1);
    if (!description || quantity === null || unitPrice < 0 || description.length > 500)
      throw new Error(`INVALID_COMMERCIAL_LINE:${ i + 1 }`);
    return {
      description,
      quantity,
      unitPrice,
      lineTotal: Number((quantity * unitPrice).toFixed(2))
    };
  });
  return out;
}
function totals(lines, discountAmount, taxRate) {
  const subtotal = Number(lines.reduce((n, x) => n + x.lineTotal, 0).toFixed(2));
  const discount = Math.min(money(discountAmount), subtotal);
  const taxable = Number((subtotal - discount).toFixed(2));
  const tax = Number((taxable * Math.max(0, Number(taxRate || 0)) / 100).toFixed(2));
  return {
    subtotal,
    discount,
    tax,
    total: Number((taxable + tax).toFixed(2))
  };
}
function attach(Store) {
  const p = Store.prototype;
  p._nextCommercialNumber = function (prefix, table, ctx) {
    const year = new Date().getUTCFullYear();
    const key = `${ prefix }-${ year }-`;
    const row = this.db.prepare(`SELECT number FROM ${ table } WHERE organization_id=? AND number LIKE ? ORDER BY number DESC LIMIT 1`).get(ctx.organizationId, `${ key }%`);
    const last = row?.number ? Number(String(row.number).slice(key.length)) : 0;
    return `${ key }${ String(Number.isFinite(last) ? last + 1 : 1).padStart(6, '0') }`;
  };
  p._commercialCustomer = function (ctx, customerId) {
    const c = this.db.prepare('SELECT id,name,email,phone FROM customers WHERE id=? AND organization_id=? AND status=\'active\'').get(customerId, ctx.organizationId);
    if (!c)
      throw new Error('INVALID_CUSTOMER');
    return c;
  };
  p.createEstimate = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const customer = this._commercialCustomer(ctx, d.customerId);
    const currency = text(d.currency || this.getFinancialSettings(ctx).currency || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new Error('INVALID_CURRENCY');
    const lines = parseLines(d.lines);
    const t = totals(lines, d.discountAmount, d.taxRate);
    const validUntil = d.validUntil == null || d.validUntil === '' ? null : iso(d.validUntil);
    if (d.validUntil && !validUntil)
      throw new Error('INVALID_DATE');
    const wo = d.workOrderId ? this.db.prepare('SELECT id FROM work_orders WHERE id=? AND organization_id=?').get(d.workOrderId, ctx.organizationId) : null;
    if (d.workOrderId && !wo)
      throw new Error('NOT_FOUND');
    const outer = this._txDepth === 0;
    if (outer)
      this.db.exec('BEGIN IMMEDIATE');
    this._txDepth++;
    try {
      const idv = id('est'), number = this._nextCommercialNumber('EST', 'estimates', ctx), createdAt = now();
      this.db.prepare('INSERT INTO estimates (id,organization_id,customer_id,work_order_id,number,status,currency,subtotal,discount,tax,total,valid_until,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(idv, ctx.organizationId, customer.id, wo?.id || null, number, 'draft', currency, t.subtotal, t.discount, t.tax, t.total, validUntil, text(d.notes), ctx.userId, createdAt, createdAt);
      const ins = this.db.prepare('INSERT INTO estimate_lines (id,organization_id,estimate_id,description,quantity,unit_price,line_total,created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const line of lines)
        ins.run(id('estline'), ctx.organizationId, idv, line.description, line.quantity, line.unitPrice, line.lineTotal, createdAt);
      audit(this.db, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'estimate_create',
        resourceType: 'estimate',
        resourceId: idv,
        metadata: {
          number,
          total: t.total,
          lineCount: lines.length
        }
      });
      this._activity(ctx, 'estimate', idv, 'estimate.created', `Estimate ${number} created`, {
        number,
        total: t.total,
        currency,
        customerId: customer.id,
        lineCount: lines.length
      });
      const out = this.getEstimate(ctx, idv);
      this._txDepth--;
      if (outer)
        this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this._txDepth = Math.max(0, this._txDepth - 1);
      if (outer) {
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackError) {
          warn('transaction.rollback_failed', { operation: 'transactional_operation', error: rollbackError });
        }
      }
      throw e;
    }
  };
  p.getEstimate = function (ctx, idv) {
    requireRole(ctx.role, 'read');
    const e = this.db.prepare('SELECT e.*,c.name customer_name,c.email customer_email,w.number work_order_number FROM estimates e LEFT JOIN customers c ON c.id=e.customer_id LEFT JOIN work_orders w ON w.id=e.work_order_id WHERE e.id=? AND e.organization_id=?').get(idv, ctx.organizationId);
    if (!e)
      throw new Error('NOT_FOUND');
    return {
      ...e,
      lines: this.db.prepare('SELECT id,description,quantity,unit_price,line_total,created_at FROM estimate_lines WHERE estimate_id=? AND organization_id=? ORDER BY created_at,id').all(idv, ctx.organizationId)
    };
  };
  p.listEstimates = function (ctx, status = null) {
    requireRole(ctx.role, 'read');
    const args = [ctx.organizationId], where = ['e.organization_id=?'];
    if (status) {
      where.push('e.status=?');
      args.push(text(status));
    }
    return this.db.prepare(`SELECT e.*,c.name customer_name,w.number work_order_number FROM estimates e LEFT JOIN customers c ON c.id=e.customer_id LEFT JOIN work_orders w ON w.id=e.work_order_id WHERE ${ where.join(' AND ') } ORDER BY e.created_at DESC LIMIT 500`).all(...args);
  };
  p.updateEstimateStatus = function (ctx, idv, status) {
    requireRole(ctx.role, 'write');
    const allowed = {
      draft: [
        'sent',
        'cancelled'
      ],
      sent: [
        'accepted',
        'rejected',
        'expired',
        'cancelled'
      ],
      accepted: [],
      rejected: [],
      expired: [],
      cancelled: []
    };
    const next = text(status);
    const e = this.db.prepare('SELECT * FROM estimates WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!e)
      throw new Error('NOT_FOUND');
    if (!(allowed[e.status] || []).includes(next))
      throw new Error('INVALID_ESTIMATE_TRANSITION');
    if (next === 'accepted' && e.valid_until && new Date(e.valid_until) < new Date())
      throw new Error('ESTIMATE_EXPIRED');
    const t = now();
    this.db.prepare('UPDATE estimates SET status=?,updated_at=? WHERE id=? AND organization_id=?').run(next, t, idv, ctx.organizationId);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'estimate_status',
      resourceType: 'estimate',
      resourceId: idv,
      metadata: {
        from: e.status,
        to: next
      }
    });
    this._activity(ctx, 'estimate', idv, 'estimate.status_changed', `Estimate status ${e.status} → ${next}`, { from: e.status, to: next, number: e.number });
    return this.getEstimate(ctx, idv);
  };
  p.convertEstimateToWorkOrder = function (ctx, idv, data = {}) {
    requireRole(ctx.role, 'write');
    const e = this.db.prepare('SELECT * FROM estimates WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!e)
      throw new Error('NOT_FOUND');
    if (e.status !== 'accepted')
      throw new Error('ESTIMATE_NOT_ACCEPTED');
    if (e.work_order_id)
      return {
        created: false,
        workOrder: this.getWorkOrder(ctx, e.work_order_id),
        estimate: this.getEstimate(ctx, idv)
      };
    const lines = this.db.prepare('SELECT description,quantity,unit_price FROM estimate_lines WHERE estimate_id=? AND organization_id=? ORDER BY created_at,id').all(idv, ctx.organizationId);
    const description = lines.map(x => `${ x.description } × ${ x.quantity } @ ${ x.unit_price }`).join('; ');
    const workOrder = this.createWorkOrder(ctx, {
      customerId: e.customer_id,
      title: text(data.title) || `Quoted work ${ e.number }`,
      description: text(data.description) || description,
      priority: text(data.priority) || 'normal',
      siteId: data.siteId || undefined
    });
    this.db.prepare('UPDATE estimates SET work_order_id=?,updated_at=? WHERE id=? AND organization_id=?').run(workOrder.id, now(), idv, ctx.organizationId);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'estimate_convert_work_order',
      resourceType: 'estimate',
      resourceId: idv,
      metadata: { workOrderId: workOrder.id }
    });
    return {
      created: true,
      workOrder,
      estimate: this.getEstimate(ctx, idv)
    };
  };
  p.createInvoice = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const customer = this._commercialCustomer(ctx, d.customerId);
    let estimate = null;
    if (d.estimateId) {
      estimate = this.db.prepare('SELECT * FROM estimates WHERE id=? AND organization_id=?').get(d.estimateId, ctx.organizationId);
      if (!estimate)
        throw new Error('NOT_FOUND');
      if (estimate.status !== 'accepted')
        throw new Error('ESTIMATE_NOT_ACCEPTED');
      if (estimate.customer_id !== customer.id)
        throw new Error('CUSTOMER_MISMATCH');
    }
    const currency = text(d.currency || estimate?.currency || this.getFinancialSettings(ctx).currency || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new Error('INVALID_CURRENCY');
    let sourceLines = d.lines;
    if (!sourceLines && estimate)
      sourceLines = this.db.prepare('SELECT description,quantity,unit_price FROM estimate_lines WHERE estimate_id=? AND organization_id=? ORDER BY created_at,id').all(estimate.id, ctx.organizationId).map(x => ({
        description: x.description,
        quantity: x.quantity,
        unitPrice: x.unit_price
      }));
    let lines = parseLines(sourceLines || []);
    const t = totals(lines, d.discountAmount ?? estimate?.discount, d.taxRate ?? ((estimate && estimate.subtotal - estimate.discount > 0) ? estimate.tax / (estimate.subtotal - estimate.discount) * 100 : 0));
    const dueAt = d.dueAt == null || d.dueAt === '' ? null : iso(d.dueAt);
    if (d.dueAt && !dueAt)
      throw new Error('INVALID_DATE');
    const woId = d.workOrderId || estimate?.work_order_id || null;
    if (woId && !this.db.prepare('SELECT id FROM work_orders WHERE id=? AND organization_id=?').get(woId, ctx.organizationId))
      throw new Error('NOT_FOUND');
    const outer = this._txDepth === 0;
    if (outer)
      this.db.exec('BEGIN IMMEDIATE');
    this._txDepth++;
    try {
      const idv = id('inv'), number = this._nextCommercialNumber('INV', 'invoices', ctx), tNow = now();
      this.db.prepare('INSERT INTO invoices (id,organization_id,customer_id,work_order_id,estimate_id,number,status,currency,subtotal,discount,tax,total,amount_paid,due_at,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(idv, ctx.organizationId, customer.id, woId, estimate?.id || null, number, 'draft', currency, t.subtotal, t.discount, t.tax, t.total, 0, dueAt, text(d.notes), ctx.userId, tNow, tNow);
      const ins = this.db.prepare('INSERT INTO invoice_lines (id,organization_id,invoice_id,description,quantity,unit_price,line_total,created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const line of lines)
        ins.run(id('invline'), ctx.organizationId, idv, line.description, line.quantity, line.unitPrice, line.lineTotal, tNow);
      audit(this.db, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'invoice_create',
        resourceType: 'invoice',
        resourceId: idv,
        metadata: {
          number,
          total: t.total,
          estimateId: estimate?.id || null
        }
      });
      this._activity(ctx, 'invoice', idv, 'invoice.created', `Invoice ${number} created`, {
        number,
        total: t.total,
        currency,
        customerId: customer.id,
        workOrderId: woId,
        estimateId: estimate?.id || null
      });
      const out = this.getInvoice(ctx, idv);
      this._txDepth--;
      if (outer)
        this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this._txDepth = Math.max(0, this._txDepth - 1);
      if (outer) {
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackError) {
          warn('transaction.rollback_failed', { operation: 'transactional_operation', error: rollbackError });
        }
      }
      throw e;
    }
  };
  p.getInvoice = function (ctx, idv) {
    requireRole(ctx.role, 'read');
    const inv = this.db.prepare('SELECT i.*,c.name customer_name,c.email customer_email,w.number work_order_number,e.number estimate_number FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN work_orders w ON w.id=i.work_order_id LEFT JOIN estimates e ON e.id=i.estimate_id WHERE i.id=? AND i.organization_id=?').get(idv, ctx.organizationId);
    if (!inv)
      throw new Error('NOT_FOUND');
    return {
      ...inv,
      lines: this.db.prepare('SELECT id,description,quantity,unit_price,line_total,created_at FROM invoice_lines WHERE invoice_id=? AND organization_id=? ORDER BY created_at,id').all(idv, ctx.organizationId)
    };
  };
  p.listInvoices = function (ctx, status = null) {
    requireRole(ctx.role, 'read');
    const args = [ctx.organizationId], where = ['i.organization_id=?'];
    if (status) {
      where.push('i.status=?');
      args.push(text(status));
    }
    return this.db.prepare(`SELECT i.*,c.name customer_name,w.number work_order_number,e.number estimate_number FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN work_orders w ON w.id=i.work_order_id LEFT JOIN estimates e ON e.id=i.estimate_id WHERE ${ where.join(' AND ') } ORDER BY i.created_at DESC LIMIT 500`).all(...args);
  };
  p.updateInvoiceStatus = function (ctx, idv, status) {
    requireRole(ctx.role, 'write');
    const next = text(status), allowed = {
        draft: [
          'issued',
          'void'
        ],
        issued: [
          'partially_paid',
          'paid',
          'overdue',
          'void'
        ],
        partially_paid: [
          'paid',
          'overdue'
        ],
        overdue: [
          'partially_paid',
          'paid'
        ],
        paid: [],
        void: []
      };
    const inv = this.db.prepare('SELECT * FROM invoices WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!inv)
      throw new Error('NOT_FOUND');
    if (!(allowed[inv.status] || []).includes(next))
      throw new Error('INVALID_INVOICE_TRANSITION');
    if (next === 'paid' && Number(inv.amount_paid) < Number(inv.total))
      throw new Error('INVOICE_PAYMENT_INCOMPLETE');
    const t = now();
    this.db.prepare('UPDATE invoices SET status=?,updated_at=? WHERE id=? AND organization_id=?').run(next, t, idv, ctx.organizationId);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'invoice_status',
      resourceType: 'invoice',
      resourceId: idv,
      metadata: {
        from: inv.status,
        to: next
      }
    });
    this._activity(ctx, 'invoice', idv, 'invoice.status_changed', 'Invoice status changed', { from: inv.status, to: next, number: inv.number });

    return this.getInvoice(ctx, idv);
  };
  p.recordInvoicePayment = function (ctx, idv, amount, meta = {}) {
    requireRole(ctx.role, 'write');
    const n = money(amount, -1);
    if (n <= 0) throw new Error('INVALID_PAYMENT_AMOUNT');
    const outerTx = this._txDepth === 0;
    if (outerTx) this.db.exec('BEGIN IMMEDIATE');
    this._txDepth++;
    try {
      const inv = this.db.prepare('SELECT * FROM invoices WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
      if (!inv) throw new Error('NOT_FOUND');
      if (['draft','void'].includes(inv.status)) throw new Error('INVOICE_PAYMENT_NOT_ALLOWED');
      const idem = meta?.idempotencyKey ? text(meta.idempotencyKey) : null;
      if (idem) {
        const prior = this.db.prepare('SELECT amount FROM invoice_payments WHERE organization_id=? AND idempotency_key=?').get(ctx.organizationId, idem);
        if (prior) {
          if (Number(prior.amount) !== n) throw new Error('PAYMENT_IDEMPOTENCY_CONFLICT');
          this._txDepth--; if (outerTx) this.db.exec('COMMIT');
          return this.getInvoice(ctx, idv);
        }
      }
      const ledgerPaid = Number(this.db.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM invoice_payments WHERE organization_id=? AND invoice_id=?').get(ctx.organizationId,idv)?.paid || 0);
      const recordedPaid = Number(inv.amount_paid || 0);
      if (Math.abs(ledgerPaid - recordedPaid) > 0.009) throw new Error('INVOICE_PAYMENT_LEDGER_MISMATCH');
      const newPaid = Number((ledgerPaid + n).toFixed(2));
      if (newPaid > Number(inv.total) + 0.000001) throw new Error('PAYMENT_EXCEEDS_BALANCE');
      const next = newPaid >= Number(inv.total) ? 'paid' : 'partially_paid';
      const t = now();
      const paymentId = id('pay');
      const source = text(meta?.source || 'local_manual');
      if (!['local_manual','stripe'].includes(source)) throw new Error('INVALID_PAYMENT_SOURCE');
      this.db.prepare('INSERT INTO invoice_payments(id,organization_id,invoice_id,amount,source,provider_reference,idempotency_key,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(paymentId,ctx.organizationId,idv,n,source,meta?.providerReference ? text(meta.providerReference) : null,idem,ctx.userId,t);
      this.db.prepare('UPDATE invoices SET amount_paid=?,status=?,updated_at=? WHERE id=? AND organization_id=?').run(newPaid,next,t,idv,ctx.organizationId);
      audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'invoice_payment_recorded',resourceType:'invoice',resourceId:idv,metadata:{amount:n,amountPaid:newPaid,status:next,paymentId,source}});
      this._activity(ctx,'invoice',idv,'invoice.payment_recorded','Invoice payment recorded',{amount:n,amountPaid:newPaid,status:next,number:inv.number,paymentId,source});
      const pendingRecon=this.db.prepare("SELECT id FROM operational_jobs WHERE organization_id=? AND queue_name='billing' AND job_type='invoice_reconciliation' AND status IN ('queued','processing') AND entity_type='invoice' AND entity_id=? LIMIT 1").get(ctx.organizationId,idv);
      if(!pendingRecon && typeof this.enqueueOperationalJob==='function')
        this.enqueueOperationalJob(ctx,{queueName:'billing',jobType:'invoice_reconciliation',entityType:'invoice',entityId:idv,payload:{provider:'local'}});
      this._txDepth--; if (outerTx) this.db.exec('COMMIT');
      return this.getInvoice(ctx, idv);
    } catch (e) {
      this._txDepth=Math.max(0,this._txDepth-1); if (outerTx) { try{this.db.exec('ROLLBACK')}catch(rollbackError){warn('transaction.rollback_failed',{operation:'record_invoice_payment',error:rollbackError})} } throw e;
    }
  };


  // REQ-02: PDF generation from stored commercial / completion data only (no fabricated figures)
  p.renderEstimatePdf = function (ctx, estimateId) {
    requireRole(ctx.role, 'read');
    const est = this.getEstimate(ctx, estimateId);
    const { pdfForEstimate } = require('./pdf');
    const pdf = pdfForEstimate(est);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'pdf_render',
      resourceType: 'estimate',
      resourceId: estimateId,
      metadata: { sha256: pdf.sha256, bytes: pdf.bytes }
    });
    return { ...pdf, fileName: `estimate-${est.number || estimateId}.pdf` };
  };
  p.renderInvoicePdf = function (ctx, invoiceId) {
    requireRole(ctx.role, 'read');
    const inv = this.getInvoice(ctx, invoiceId);
    const { pdfForInvoice } = require('./pdf');
    const pdf = pdfForInvoice(inv);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'pdf_render',
      resourceType: 'invoice',
      resourceId: invoiceId,
      metadata: { sha256: pdf.sha256, bytes: pdf.bytes }
    });
    return { ...pdf, fileName: `invoice-${inv.number || invoiceId}.pdf` };
  };
  p.renderCompletionPdf = function (ctx, workOrderId) {
    requireRole(ctx.role, 'read');
    const pkg = this.completionPackage(ctx, workOrderId);
    const { pdfForCompletion } = require('./pdf');
    const pdf = pdfForCompletion(pkg);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'pdf_render',
      resourceType: 'work_order',
      resourceId: workOrderId,
      metadata: { kind: 'completion', sha256: pdf.sha256, bytes: pdf.bytes }
    });
    return { ...pdf, fileName: `completion-${pkg.workOrder?.number || workOrderId}.pdf` };
  };
}

module.exports = { attach };
