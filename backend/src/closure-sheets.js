'use strict';
const crypto = require('node:crypto');
const { id, now } = require('./security');
const { requireRole } = require('./rbac');
const { audit } = require('./audit');
function text(v) { return String(v ?? '').trim(); }
function dayRange(raw) {
  const d = new Date(String(raw || now()));
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, from: `${y}-${m}-${day}T00:00:00.000Z`, to: `${y}-${m}-${day}T23:59:59.999Z` };
}
function attach(Store) {
  const p = Store.prototype;
  p.compileClosureSheet = function (ctx, d = {}) {
    requireRole(ctx.role, 'write');
    const range = dayRange(d.date);
    const technicianId = text(d.technicianId) || null;
    const args = [ctx.organizationId, range.from, range.to];
    let techSql = '';
    if (technicianId) { techSql = ' AND a.technician_id=?'; args.push(technicianId); }
    const chunkSize=Math.min(500,Math.max(1,Number(d.chunkSize||100)));
    const maxItems=Math.min(10000,Math.max(chunkSize,Number(d.maxItems||5000)));
    const rows=[]; let lastTime='',lastId='';
    while(rows.length<maxItems){
      const pageArgs=[...args,lastTime,lastTime,lastId,Math.min(chunkSize,maxItems-rows.length)];
      const page=this.db.prepare(`SELECT w.id work_order_id,w.number,w.title,w.status,w.priority,w.updated_at closed_at,w.customer_id,a.technician_id,u.email technician_email,(SELECT COUNT(*) FROM attachments at WHERE at.organization_id=w.organization_id AND at.entity_type='work_order' AND at.entity_id=w.id) evidence_count,(SELECT COUNT(*) FROM customer_signoffs cs WHERE cs.organization_id=w.organization_id AND cs.work_order_id=w.id) signoff_count FROM work_orders w LEFT JOIN appointments a ON a.work_order_id=w.id AND a.organization_id=w.organization_id LEFT JOIN users u ON u.id=a.technician_id WHERE w.organization_id=? AND w.status='completed' AND w.updated_at>=? AND w.updated_at<=?${techSql} AND (w.updated_at>? OR (w.updated_at=? AND w.id>?)) ORDER BY w.updated_at,w.id LIMIT ?`).all(...pageArgs);
      if(!page.length) break; rows.push(...page); const last=page[page.length-1]; lastTime=last.closed_at; lastId=last.work_order_id; if(page.length<chunkSize) break;
    }
    if(rows.length>=maxItems) rows.length=maxItems;
    const items = rows.map(r => {
      const assurance = this.completionAssurance(ctx, r.work_order_id);
      const auditRows = this.db.prepare('SELECT action,resource_type,resource_id,created_at FROM audit_log WHERE organization_id=? AND resource_id=? ORDER BY created_at DESC LIMIT 20').all(ctx.organizationId, r.work_order_id);
      return { workOrderId: r.work_order_id, number: r.number, title: r.title, priority: r.priority, closedAt: r.closed_at, technicianId: r.technician_id || null, technicianEmail: r.technician_email || null, evidenceCount: Number(r.evidence_count || 0), signoffCount: Number(r.signoff_count || 0), assurance: { ready: assurance.ready, blockers: assurance.blockers }, auditCount: auditRows.length };
    });
    const blocked = items.filter(x => !x.assurance.ready);
    const digestPayload = { schemaVersion: 'opscore.closure-sheet.v1', organizationId: ctx.organizationId, date: range.date, technicianId, items, counts: { total: items.length, blocked: blocked.length, ready: items.length - blocked.length } };
    const sheetSha256 = crypto.createHash('sha256').update(JSON.stringify(digestPayload)).digest('hex');
    const payload = { ...digestPayload, compiledAt: now() };
    const sheetId = id('close');
    const status = blocked.length ? 'blocked' : 'ready';
    this.db.prepare(`INSERT INTO closure_sheets(id,organization_id,sheet_date,technician_id,status,item_count,blocked_count,sheet_sha256,rows_json,compiled_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,sheet_date,technician_id) DO UPDATE SET status=excluded.status,item_count=excluded.item_count,blocked_count=excluded.blocked_count,sheet_sha256=excluded.sheet_sha256,rows_json=excluded.rows_json,compiled_by=excluded.compiled_by,created_at=excluded.created_at`).run(sheetId, ctx.organizationId, range.date, technicianId, status, items.length, blocked.length, sheetSha256, JSON.stringify(items), ctx.userId, now());
    audit(this.db, { organizationId: ctx.organizationId, actorUserId: ctx.userId, action: 'closure_sheet_compiled', resourceType: 'closure_sheet', resourceId: sheetId, metadata: { date: range.date, technicianId, status, itemCount: items.length, blockedCount: blocked.length, sheetSha256 } });
    return { ...payload, status, sheetSha256, persisted: true, chunkSize, maxItems, truncated: items.length >= maxItems };
  };
  p.getClosureSheet = function (ctx, date, technicianId = null) {
    requireRole(ctx.role, 'read');
    const range = dayRange(date);
    const t = text(technicianId) || null;
    const row = t ? this.db.prepare('SELECT * FROM closure_sheets WHERE organization_id=? AND sheet_date=? AND technician_id=?').get(ctx.organizationId, range.date, t) : this.db.prepare('SELECT * FROM closure_sheets WHERE organization_id=? AND sheet_date=? AND technician_id IS NULL').get(ctx.organizationId, range.date);
    if (!row) throw new Error('NOT_FOUND');
    return { ...row, rows: JSON.parse(row.rows_json || '[]') };
  };
  p.verifyClosureSheet = function (ctx, date, technicianId = null) {
    requireRole(ctx.role, 'read');
    const stored = this.getClosureSheet(ctx, date, technicianId);
    const digestPayload = { schemaVersion: 'opscore.closure-sheet.v1', organizationId: ctx.organizationId, date: stored.sheet_date, technicianId: stored.technician_id || null, items: stored.rows, counts: { total: stored.item_count, blocked: stored.blocked_count, ready: stored.item_count - stored.blocked_count } };
    const expected = crypto.createHash('sha256').update(JSON.stringify(digestPayload)).digest('hex');
    return { schemaVersion:'opscore.closure-sheet.verification.v1', valid: expected === stored.sheet_sha256, expectedSha256: expected, storedSha256: stored.sheet_sha256, status: stored.status, itemCount: stored.item_count, blockedCount: stored.blocked_count };
  };

}
module.exports = { attach };
