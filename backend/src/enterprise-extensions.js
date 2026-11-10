'use strict';
const {warn}=require('./observability');
const crypto = require('node:crypto');
const {id, now} = require('./security');
const {requireRole} = require('./rbac');
const {audit} = require('./audit');
function clean(v, fallback = '') {
  return String(v ?? fallback).trim();
}
function optional(v) {
  return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();
}
function iso(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function parseJson(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
function assertTenantRow(db, table, idv, orgId) {
  const row = db.prepare(`SELECT id FROM ${ table } WHERE id=? AND organization_id=?`).get(idv, orgId);
  if (!row)
    throw new Error('NOT_FOUND');
  return row;
}
function minutesFromMidnight(d) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function addBusinessMinutes(start, minutes, week, exceptions) {
  let cur = new Date(start);
  let remaining = Math.max(0, Math.floor(minutes));
  const byDate = new Map(exceptions.map(x => [
    x.date,
    x
  ]));
  const defaultDay = day => week[String(day)] || [];
  let guard = 0;
  while (remaining > 0 && guard++ < 200000) {
    const date = cur.toISOString().slice(0, 10);
    const ex = byDate.get(date);
    let windows = [];
    if (ex) {
      if (ex.is_working)
        windows = [[
            ex.start_minutes,
            ex.end_minutes
          ]];
    } else
      windows = defaultDay(cur.getUTCDay());
    const m = minutesFromMidnight(cur);
    let advanced = false;
    for (const w of windows) {
      const start = Number(w[0]), end = Number(w[1]);
      if (!(end > start))
        continue;
      let pos = m;
      if (pos < start) {
        cur.setUTCHours(Math.floor(start / 60), start % 60, 0, 0);
        pos = start;
      }
      if (pos >= end)
        continue;
      const available = end - pos;
      if (remaining <= available) {
        cur = new Date(cur.getTime() + remaining * 60000);
        remaining = 0;
        advanced = true;
        break;
      }
      remaining -= available;
      cur.setUTCHours(23, 59, 59, 999);
      advanced = true;
      break;
    }
    if (remaining <= 0)
      break;
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1, 0, 0, 0));
    if (!advanced)
      continue;
  }
  if (guard >= 200000)
    throw new Error('BUSINESS_CALENDAR_TOO_LARGE');
  return cur.toISOString();
}
function attach(Store) {
  const proto = Store.prototype;
  proto.universalSearch = function (ctx, raw) {
    requireRole(ctx.role, 'read');
    const q = clean(raw.q);
    const limit = Math.max(1, Math.min(Number(raw.limit) || 50, 100));
    if (q.length < 2)
      throw new Error('SEARCH_QUERY_TOO_SHORT');
    const like = `%${ q.replaceAll('%', '\\%').replaceAll('_', '\\_') }%`;
    const out = [];
    const push = (type, rows) => rows.forEach(r => out.push({
      ...r,
      type
    }));
    push('work_order', this.db.prepare(`SELECT id,number,title,status,priority,updated_at FROM work_orders WHERE organization_id=? AND (number LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`).all(ctx.organizationId, like, like, limit));
    push('customer', this.db.prepare(`SELECT id,name,email,phone,updated_at FROM customers WHERE organization_id=? AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`).all(ctx.organizationId, like, like, like, limit));
    push('site', this.db.prepare(`SELECT id,name,address,updated_at FROM sites WHERE organization_id=? AND (name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`).all(ctx.organizationId, like, like, limit));
    push('asset', this.db.prepare(`SELECT id,name,asset_type,status,updated_at FROM assets WHERE organization_id=? AND (name LIKE ? ESCAPE '\\' OR asset_type LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`).all(ctx.organizationId, like, like, limit));
    return {
      schemaVersion: 'opscore.universal-search.v1',
      query: q,
      results: out.slice(0, limit),
      limit
    };
  };
  proto.bulkWorkOrders = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const ids = [...new Set((Array.isArray(d.workOrderIds) ? d.workOrderIds : []).map(String).filter(Boolean))];
    if (!ids.length || ids.length > 200)
      throw new Error('BULK_WORK_ORDER_LIMIT');
    const op = clean(d.operation);
    const allowed = [
      'status',
      'priority',
      'assign'
    ];
    if (!allowed.includes(op))
      throw new Error('BULK_OPERATION_INVALID');
    if (op === 'status' && ![
        'open',
        'in_progress',
        'blocked',
        'completed',
        'cancelled'
      ].includes(clean(d.value)))
      throw new Error('INVALID_STATUS');
    if (op === 'priority' && ![
        'low',
        'normal',
        'high',
        'urgent'
      ].includes(clean(d.value)))
      throw new Error('INVALID_PRIORITY');
    if (op === 'assign') {
      const u = clean(d.value);
      const user = this.db.prepare('SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.organization_id=? AND u.status=\'active\'').get(u, ctx.organizationId);
      if (!user)
        throw new Error('INVALID_ASSIGNEE');
    }
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      ids,
      op,
      value: d.value
    })).digest('hex');
    const job = id('bulk'), t = now();
    let changed = 0, failed = [];
    const outer = this._txDepth === 0;
    if (outer)
      this.db.exec('BEGIN IMMEDIATE');
    this._txDepth++;
    try {
      for (const wid of ids) {
        try {
          const w = this.db.prepare('SELECT * FROM work_orders WHERE id=? AND organization_id=?').get(wid, ctx.organizationId);
          if (!w) {
            failed.push({
              id: wid,
              code: 'NOT_FOUND'
            });
            continue;
          }
          if (op === 'status' && w.status === clean(d.value))
            continue;
          if (op === 'status')
            this.updateWorkOrder(ctx, wid, {
              status: clean(d.value),
              transitionReason: clean(d.reason) || 'Bulk operation'
            });
          else if (op === 'priority')
            this.updateWorkOrder(ctx, wid, { priority: clean(d.value) });
          else
            this.updateWorkOrder(ctx, wid, { assignedTo: clean(d.value) });
          changed++;
        } catch (e) {
          failed.push({
            id: wid,
            code: String(e?.message || 'FAILED')
          });
        }
      }
      const status = failed.length ? changed ? 'partial' : 'failed' : 'completed';
      const result = {
        schemaVersion: 'opscore.bulk-work-order.v1',
        jobId: job,
        operation: op,
        requestedCount: ids.length,
        affectedCount: changed,
        failedCount: failed.length,
        failures: failed
      };
      this.db.prepare('INSERT INTO work_order_bulk_jobs VALUES (?,?,?,?,?,?,?,?,?,?)').run(job, ctx.organizationId, op, ids.length, changed, status, requestHash, JSON.stringify(result), ctx.userId, t);
      audit(this.db, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'bulk_work_order',
        resourceType: 'work_order_bulk_job',
        resourceId: job,
        metadata: {
          operation: op,
          requested: ids.length,
          affected: changed,
          failed: failed.length
        }
      });
      this._txDepth--;
      if (outer)
        this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this._txDepth = Math.max(0, this._txDepth - 1);
      if (outer)
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackError) {
          warn('transaction.rollback_failed', { operation: 'transactional_operation', error: rollbackError });
        }
      ;
      throw e;
    }
  };
  proto.createApprovalRequest = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const et = clean(d.entityType), eid = clean(d.entityId), action = clean(d.action), reason = clean(d.reason);
    if (![
        'work_order',
        'appointment',
        'inventory',
        'asset',
        'contract'
      ].includes(et) || !eid || !action || reason.length < 3)
      throw new Error('INVALID_APPROVAL_REQUEST');
    if (et === 'work_order')
      assertTenantRow(this.db, 'work_orders', eid, ctx.organizationId);
    const existing = this.db.prepare('SELECT * FROM approval_requests WHERE organization_id=? AND entity_type=? AND entity_id=? AND action=? AND status=?').get(ctx.organizationId, et, eid, action, 'pending');
    if (existing)
      return {
        ...existing,
        reused: true
      };
    const idv = id('apr'), t = now();
    this.db.prepare('INSERT INTO approval_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(idv, ctx.organizationId, et, eid, action, reason, 'pending', ctx.userId, null, null, t, null);
    this._activity(ctx, et, eid, 'approval_requested', `Approval requested: ${ action }`, { approvalId: idv });
    return this.db.prepare('SELECT * FROM approval_requests WHERE id=?').get(idv);
  };
  proto.listApprovalRequests = function (ctx, status) {
    requireRole(ctx.role, 'read');
    const q = status ? ' AND status=?' : '';
    return this.db.prepare(`SELECT * FROM approval_requests WHERE organization_id=?${ q } ORDER BY created_at DESC LIMIT 500`).all(...status ? [
      ctx.organizationId,
      status
    ] : [ctx.organizationId]);
  };
  proto.decideApproval = function (ctx, idv, d) {
    requireRole(ctx.role, 'admin');
    const a = this.db.prepare('SELECT * FROM approval_requests WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!a)
      throw new Error('NOT_FOUND');
    if (a.status !== 'pending')
      throw new Error('APPROVAL_NOT_PENDING');
    const decision = clean(d.decision);
    if (![
        'approved',
        'rejected'
      ].includes(decision))
      throw new Error('INVALID_APPROVAL_DECISION');
    const t = now();
    this.db.prepare('UPDATE approval_requests SET status=?,decided_by=?,decision_reason=?,decided_at=? WHERE id=? AND organization_id=? AND status=\'pending\'').run(decision, ctx.userId, clean(d.reason) || null, t, idv, ctx.organizationId);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'approval_decision',
      resourceType: 'approval_request',
      resourceId: idv,
      metadata: {
        decision,
        entityType: a.entity_type,
        entityId: a.entity_id,
        action: a.action
      }
    });
    return this.db.prepare('SELECT * FROM approval_requests WHERE id=?').get(idv);
  };
  proto.inventoryLedger = function (ctx, filters = {}) {
    requireRole(ctx.role, 'read');
    let sql = 'SELECT l.*,p.sku,p.name part_name,il.name location_name FROM inventory_ledger l JOIN parts p ON p.id=l.part_id JOIN inventory_locations il ON il.id=l.location_id WHERE l.organization_id=?';
    const args = [ctx.organizationId];
    if (filters.partId) {
      sql += ' AND l.part_id=?';
      args.push(filters.partId);
    }
    if (filters.locationId) {
      sql += ' AND l.location_id=?';
      args.push(filters.locationId);
    }
    if (filters.workOrderId) {
      sql += ' AND l.work_order_id=?';
      args.push(filters.workOrderId);
    }
    return this.db.prepare(sql + ' ORDER BY l.created_at DESC LIMIT 500').all(...args);
  };
  proto.recordInventoryLedger = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const part = assertTenantRow(this.db, 'parts', d.partId, ctx.organizationId), loc = assertTenantRow(this.db, 'inventory_locations', d.locationId, ctx.organizationId);
    const delta = Number(d.quantityDelta), reason = clean(d.reason);
    if (!Number.isInteger(delta) || !delta || !reason)
      throw new Error('INVALID_INVENTORY_LEDGER');
    if (d.workOrderId)
      assertTenantRow(this.db, 'work_orders', d.workOrderId, ctx.organizationId);
    const stock = this.db.prepare('SELECT * FROM inventory_stock WHERE organization_id=? AND part_id=? AND location_id=?').get(ctx.organizationId, part.id, loc.id);
    if (!stock)
      throw new Error('STOCK_NOT_FOUND');
    const balance = Number(stock.quantity) + delta;
    if (balance < 0)
      throw new Error('INSUFFICIENT_STOCK');
    const t = now(), lid = id('ile');
    this.db.prepare('UPDATE inventory_stock SET quantity=?,updated_at=? WHERE id=? AND organization_id=?').run(balance, t, stock.id, ctx.organizationId);
    this.db.prepare('INSERT INTO inventory_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(lid, ctx.organizationId, part.id, loc.id, optional(d.workOrderId), clean(d.sourceType) || 'manual', optional(d.sourceId), delta, balance, reason, ctx.userId, t);
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'inventory_ledger_adjustment',
      resourceType: 'inventory_ledger',
      resourceId: lid,
      metadata: {
        partId: part.id,
        locationId: loc.id,
        delta,
        balance
      }
    });
    return this.db.prepare('SELECT * FROM inventory_ledger WHERE id=?').get(lid);
  };
  proto.createBusinessCalendar = function (ctx, d) {
    this._requireOwnerOrAdmin(ctx);
    const name = clean(d.name), tz = clean(d.timezone || 'UTC');
    const week = d.week && typeof d.week === 'object' ? d.week : {
      '0': [],
      '1': [[
          540,
          1020
        ]],
      '2': [[
          540,
          1020
        ]],
      '3': [[
          540,
          1020
        ]],
      '4': [[
          540,
          1020
        ]],
      '5': [[
          540,
          1020
        ]],
      '6': []
    };
    for (const k of Object.keys(week))
      for (const w of week[k])
        if (!Array.isArray(w) || w.length !== 2 || Number(w[0]) < 0 || Number(w[1]) > 1440 || Number(w[1]) <= Number(w[0]))
          throw new Error('INVALID_BUSINESS_CALENDAR');
    if (!name)
      throw new Error('INVALID_BUSINESS_CALENDAR');
    const cid = id('cal'), t = now();
    this.db.prepare('INSERT INTO business_calendars VALUES (?,?,?,?,?,?,?,?,?)').run(cid, ctx.organizationId, name, tz, JSON.stringify(week), 1, ctx.userId, t, t);
    return this.getBusinessCalendar(ctx, cid);
  };
  proto.getBusinessCalendar = function (ctx, idv) {
    const r = this.db.prepare('SELECT * FROM business_calendars WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!r)
      throw new Error('NOT_FOUND');
    return {
      ...r,
      week: parseJson(r.week_json, {})
    };
  };
  proto.listBusinessCalendars = function (ctx) {
    requireRole(ctx.role, 'read');
    return this.db.prepare('SELECT * FROM business_calendars WHERE organization_id=? ORDER BY name').all(ctx.organizationId).map(r => ({
      ...r,
      week: parseJson(r.week_json, {})
    }));
  };
  proto.addBusinessCalendarException = function (ctx, d) {
    requireRole(ctx.role, 'write');
    const c = assertTenantRow(this.db, 'business_calendars', d.calendarId, ctx.organizationId), date = clean(d.date), reason = clean(d.reason);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !reason)
      throw new Error('INVALID_CALENDAR_EXCEPTION');
    const working = Boolean(d.isWorking);
    const s = d.startMinutes == null ? null : Number(d.startMinutes), e = d.endMinutes == null ? null : Number(d.endMinutes);
    if (working && (!(Number.isInteger(s) && Number.isInteger(e)) || e <= s))
      throw new Error('INVALID_CALENDAR_EXCEPTION');
    const idv = id('calx'), t = now();
    this.db.prepare('INSERT INTO business_calendar_exceptions VALUES (?,?,?,?,?,?,?,?,?)').run(idv, ctx.organizationId, c.id, date, working ? 1 : 0, working ? s : null, working ? e : null, reason, t);
    return this.db.prepare('SELECT * FROM business_calendar_exceptions WHERE id=?').get(idv);
  };
  proto.businessDueAt = function (ctx, d) {
    requireRole(ctx.role, 'read');
    const c = this.getBusinessCalendar(ctx, d.calendarId);
    const ex = this.db.prepare('SELECT date,is_working,start_minutes,end_minutes FROM business_calendar_exceptions WHERE organization_id=? AND calendar_id=?').all(ctx.organizationId, c.id);
    const start = iso(d.startAt);
    const minutes = Number(d.minutes);
    if (!start || !Number.isInteger(minutes) || minutes < 0)
      throw new Error('INVALID_BUSINESS_DUE');
    return {
      schemaVersion: 'opscore.business-sla.v1',
      calendarId: c.id,
      startAt: start,
      minutes,
      dueAt: addBusinessMinutes(start, minutes, c.week, ex),
      timezone: c.timezone,
      note: 'Deterministic calendar calculation; it does not imply an external timezone database beyond the supplied calendar definition.'
    };
  };
  proto.dispatchEligibility = function (ctx, workOrderId) {
    requireRole(ctx.role, 'read');
    const w = assertTenantRow(this.db, 'work_orders', workOrderId, ctx.organizationId);
    const req = this.db.prepare(`SELECT DISTINCT json_extract(metadata_json,'$.requiredSkill') skill FROM activity_log WHERE organization_id=? AND entity_type='work_order' AND entity_id=? AND json_extract(metadata_json,'$.requiredSkill') IS NOT NULL`).all(ctx.organizationId, w.id).map(x => x.skill);
    const tech = this.listTechnicians(ctx);
    return tech.map(t => {
      const skills = this.db.prepare('SELECT skill,level FROM technician_skills WHERE organization_id=? AND user_id=?').all(ctx.organizationId, t.user_id);
      const have = new Set(skills.map(s => s.skill));
      const conflicts = this.db.prepare('SELECT COUNT(*) c FROM appointments WHERE organization_id=? AND technician_id=? AND status IN (\'scheduled\',\'confirmed\',\'en_route\')').get(ctx.organizationId, t.user_id).c;
      const reasons = [];
      for (const rs of req)
        if (!have.has(rs))
          reasons.push(`MISSING_SKILL:${ rs }`);
      if (conflicts >= 3)
        reasons.push('CAPACITY_HIGH');
      return {
        technicianId: t.user_id,
        eligible: reasons.length === 0,
        reasons,
        activeAppointments: conflicts,
        skills
      };
    }).filter(x => x.eligible || x.reasons.length);
  };
  // Mirrors scripts/migration-preflight.js so the API and the release gate never disagree.
  // Migration numbers start at 000, and 6-8 are reserved historical numbers (not gaps).
  proto.releaseMigrationPreflight = function (ctx) {
    requireRole(ctx.role, 'admin');
    const fs = require('node:fs');
    const path = require('node:path');
    const { parseMigrationFilename, compareMigrationFilenames } = require('./postgres-migration-plan');
    const base = path.resolve(__dirname, '..', 'sql', 'postgres');
    const files = fs.readdirSync(base).filter(parseMigrationFilename).sort(compareMigrationFilenames);
    const parsed = files.map(parseMigrationFilename);
    const identifiers = parsed.map(x => String(x.number).padStart(3, '0') + x.suffix);
    const duplicateNumbers = [...new Set(identifiers.filter((x,i,a)=>a.indexOf(x)!==i))];
    const numeric = [...new Set(parsed.map(x=>x.number))].sort((a,b)=>a-b);
    const reserved = new Set([6,7,8]), missing = [];
    if (numeric.length) for (let n=numeric[0]; n<=numeric[numeric.length-1]; n++) if (!numeric.includes(n)) missing.push(n);
    const gaps = missing.filter(n=>!reserved.has(n));
    const digest = crypto.createHash('sha256');
    for (const f of files) { digest.update(f); digest.update('\0'); digest.update(fs.readFileSync(path.join(base,f))); digest.update('\0'); }
    return {
      schemaVersion:'opscore.migration-preflight.v2', migrationCount:files.length, files,
      contiguous:gaps.length===0&&duplicateNumbers.length===0, gaps,
      reservedHistoricalGaps:missing.filter(n=>reserved.has(n)), duplicateNumbers,
      legacyFilenameAliases:{'044_system_tables_rls.sql':'040_system_tables_rls.sql'},
      sha256:digest.digest('hex')
    };
  };
  proto.createApprovalRequirement = function (ctx, d) {
    return this.createApprovalRequest(ctx, d);
  };
}
module.exports = { attach };
