'use strict';
const {warn}=require('./observability');
const crypto = require('node:crypto');
const {id, now} = require('./security');
const {requireRole} = require('./rbac');
const {audit, verifyAuditChain} = require('./audit');
function clean(v, f = '') {
  return String(v ?? f).trim();
}
function canonicalConfig(v) {
  return JSON.stringify({
    key: v.key,
    value: v.value,
    description: v.description || '',
    reason: v.reason || ''
  });
}
function attach(Store) {
  const p = Store.prototype;
  p.auditChainVerification = function (ctx) {
    requireRole(ctx.role, 'read');
    return {
      schemaVersion: 'opscore.audit-chain.v2',
      organizationId: ctx.organizationId,
      ...verifyAuditChain(this.db, ctx.organizationId),
      algorithm: 'SHA-256 chained events',
      tamperEvidence: true,
      note: 'Tamper-evident verification; this is not a blockchain or external immutable ledger.'
    };
  };
  p.createConfigVersion = function (ctx, d) {
    requireRole(ctx.role, 'admin');
    const key = clean(d.key), value = d.value;
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{1,120}$/.test(key) || value === undefined)
      throw new Error('INVALID_CONFIG');
    const dup = this.db.prepare('SELECT id FROM operational_configs WHERE organization_id=? AND config_key=? AND status IN (\'draft\',\'active\')').get(ctx.organizationId, key);
    const version = Number(this.db.prepare('SELECT COALESCE(MAX(version),0)+1 v FROM operational_configs WHERE organization_id=? AND config_key=?').get(ctx.organizationId, key).v);
    const t = now(), cid = id('cfg');
    this.db.prepare('INSERT INTO operational_configs (id,organization_id,config_key,config_value_json,version,status,created_by,description,reason,created_at,activated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(cid, ctx.organizationId, key, JSON.stringify(value), version, 'draft', ctx.userId, clean(d.description) || '', clean(d.reason) || '', t, null);
    this.recordConfigChange(ctx, {id: cid, config_key: key, config_value_json: JSON.stringify(value), version}, 'created', clean(d.reason) || 'config created');
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'config_create',
      resourceType: 'operational_config',
      resourceId: cid,
      metadata: {
        key,
        version
      }
    });
    return this.db.prepare('SELECT * FROM operational_configs WHERE id=?').get(cid);
  };
  p.activateConfigVersion = function (ctx, idv) {
    requireRole(ctx.role, 'admin');
    const r = this.db.prepare('SELECT * FROM operational_configs WHERE id=? AND organization_id=?').get(idv, ctx.organizationId);
    if (!r)
      throw new Error('NOT_FOUND');
    if (r.status !== 'draft')
      throw new Error('CONFIG_NOT_DRAFT');
    const t = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE operational_configs SET status=\'retired\' WHERE organization_id=? AND config_key=? AND status=\'active\'').run(ctx.organizationId, r.config_key);
      const q = this.db.prepare('UPDATE operational_configs SET status=\'active\',activated_at=? WHERE id=? AND organization_id=? AND status=\'draft\'').run(t, idv, ctx.organizationId);
      if (!q.changes)
        throw new Error('CONFIG_NOT_DRAFT');
      this.recordConfigChange(ctx, r, 'activated', r.reason || 'config activated');
      audit(this.db, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'config_activate',
        resourceType: 'operational_config',
        resourceId: idv,
        metadata: {
          key: r.config_key,
          version: r.version
        }
      });
      this.db.exec('COMMIT');
      return this.db.prepare('SELECT * FROM operational_configs WHERE id=?').get(idv);
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch (rollbackError) {
        warn('transaction.rollback_failed', { operation: 'transactional_operation', error: rollbackError });
      }
      throw e;
    }
  };
  p.listConfigVersions = function (ctx, key) {
    requireRole(ctx.role, 'read');
    const k = clean(key);
    return this.db.prepare('SELECT id,config_key,config_value_json,version,status,created_by,description,reason,created_at,activated_at FROM operational_configs WHERE organization_id=?' + (k ? ' AND config_key=?' : '') + ' ORDER BY config_key,version DESC').all(...k ? [
      ctx.organizationId,
      k
    ] : [ctx.organizationId]);
  };
  p.performanceSnapshot = function (ctx) {
    requireRole(ctx.role, 'read');
    const started = process.hrtime.bigint();
    const counts = {
      workOrders: this.db.prepare('SELECT COUNT(*) c FROM work_orders WHERE organization_id=?').get(ctx.organizationId).c,
      customers: this.db.prepare('SELECT COUNT(*) c FROM customers WHERE organization_id=?').get(ctx.organizationId).c,
      assets: this.db.prepare('SELECT COUNT(*) c FROM assets WHERE organization_id=?').get(ctx.organizationId).c
    };
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1000000;
    return {
      schemaVersion: 'opscore.performance-snapshot.v1',
      organizationId: ctx.organizationId,
      queries: 3,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      counts
    };
  };
}
module.exports = { attach };
