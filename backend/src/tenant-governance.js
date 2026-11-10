'use strict';
const {warn}=require('./observability');
const {id, now} = require('./security');
const {requireRole} = require('./rbac');
const {audit} = require('./audit');
const {requestHash} = require('./operation-envelope');

const STATUSES = ['active','read_only','suspended','closed'];
const TRANSITIONS = {
  active: new Set(['active','read_only','suspended','closed']),
  read_only: new Set(['read_only','active','suspended','closed']),
  suspended: new Set(['suspended','active','read_only','closed']),
  closed: new Set(['closed'])
};
function clean(v, fallback='') { return v == null || String(v).trim()==='' ? fallback : String(v).trim(); }
function attach(Store) {
  const p = Store.prototype;
  p.organizationGovernance = function(ctx) {
    requireRole(ctx.role, 'read');
    const row = this.db.prepare(`SELECT organization_id,status,reason,changed_by,changed_at,version FROM organization_governance WHERE organization_id=?`).get(ctx.organizationId);
    if (!row) return {schemaVersion:'opscore.organization-governance.v1', organizationId:ctx.organizationId, status:'active', reason:'', version:0, changedBy:null, changedAt:null};
    return {schemaVersion:'opscore.organization-governance.v1', organizationId:row.organization_id, status:row.status, reason:row.reason, version:row.version, changedBy:row.changed_by, changedAt:row.changed_at};
  };
  p.changeOrganizationStatus = function(ctx, d = {}) {
    requireRole(ctx.role, 'admin');
    const target = clean(d.status);
    if (!STATUSES.includes(target)) throw new Error('ORGANIZATION_STATUS_INVALID');
    const current = this.organizationGovernance(ctx);
    if (current.status === 'closed' && target !== 'closed') throw new Error('ORGANIZATION_CLOSED');
    if (!TRANSITIONS[current.status].has(target)) throw new Error('ORGANIZATION_STATUS_TRANSITION_INVALID');
    const reason = clean(d.reason);
    if (target !== current.status && reason.length < 3) throw new Error('ORGANIZATION_STATUS_REASON_REQUIRED');
    const t = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO organization_governance (organization_id,status,reason,changed_by,changed_at,version) VALUES (?,?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at,version=organization_governance.version+1`).run(ctx.organizationId,target,reason,ctx.userId,t,current.version + 1);
      audit(this.db,{organizationId:ctx.organizationId,actorUserId:ctx.userId,action:'organization_status_change',resourceType:'organization',resourceId:ctx.organizationId,metadata:{from:current.status,to:target,reason}});
      this.db.exec('COMMIT');
    } catch(e) { try { this.db.exec('ROLLBACK'); } catch (rollbackError) { warn('transaction.rollback_failed', { operation: 'tenant_governance', error: rollbackError }); } throw e; }
    return this.organizationGovernance(ctx);
  };
  p.organizationWriteAllowed = function(ctx) {
    return this.organizationGovernance(ctx).status === 'active';
  };
  p.recordConfigChange = function(ctx, configRow, action, reason) {
    const r = configRow || {};
    this.db.prepare(`INSERT INTO configuration_change_log (id,organization_id,config_id,config_key,version,action,actor_user_id,reason,correlation_id,request_hash_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      id('cchg'),ctx.organizationId,r.id || null,r.config_key || r.configKey || 'unknown',Number(r.version || 0),action,ctx.userId,clean(reason,'unspecified'),clean(ctx.correlationId),requestHash({key:r.config_key || r.configKey || null,value:r.config_value_json ? JSON.parse(r.config_value_json) : r.value,version:r.version || null,action}) ,now());
  };
  p.listConfigChanges = function(ctx, key, limit=100) {
    requireRole(ctx.role,'read');
    const n=Math.max(1,Math.min(500,Number(limit)||100));
    const k=clean(key);
    return this.db.prepare(`SELECT * FROM configuration_change_log WHERE organization_id=?${k?' AND config_key=?':''} ORDER BY created_at DESC LIMIT ?`).all(...(k?[ctx.organizationId,k,n]:[ctx.organizationId,n]));
  };

  /**
   * Domain isolation policy from real operational_configs (sector-neutral).
   * Keys: domain.isolation, domain.allowed_scopes, domain.operating_region
   */
  p.getDomainIsolationPolicy = function(ctx) {
    requireRole(ctx.role, 'read');
    const keys = ['domain.isolation', 'domain.allowed_scopes', 'domain.operating_region', 'tenant.domain_fingerprint'];
    const rows = this.db.prepare(
      `SELECT config_key, config_value_json, version, status FROM operational_configs
       WHERE organization_id=? AND status='active' AND config_key IN (${keys.map(()=>'?').join(',')})
       ORDER BY version DESC`
    ).all(ctx.organizationId, ...keys);
    const byKey = {};
    for (const r of rows) {
      if (byKey[r.config_key]) continue; // highest version first
      try { byKey[r.config_key] = JSON.parse(r.config_value_json || '{}'); }
      catch { byKey[r.config_key] = r.config_value_json; }
    }
    const isolation = byKey['domain.isolation'] || { mode: 'organization' };
    const allowedScopes = byKey['domain.allowed_scopes'] || { scopes: [] };
    const region = byKey['domain.operating_region'] || null;
    const fingerprint = byKey['tenant.domain_fingerprint'] || null;
    return {
      schemaVersion: 'opscore.domain-isolation.v1',
      organizationId: ctx.organizationId,
      mode: isolation.mode || 'organization',
      allowedScopes: Array.isArray(allowedScopes.scopes) ? allowedScopes.scopes : [],
      operatingRegion: region,
      fingerprint,
      enforced: isolation.mode === 'strict' || isolation.enforce === true
    };
  };

  /**
   * Enforce membership + optional domain fingerprint before privileged work.
   * Does not invent tables — uses memberships + operational_configs only.
   */
  p.assertDomainAccess = function(ctx, requiredScope = null) {
    const mem = this.db.prepare(
      'SELECT role, status FROM memberships WHERE organization_id=? AND user_id=? LIMIT 1'
    ).get(ctx.organizationId, ctx.userId);
    if (!mem || (mem.status && mem.status !== 'active')) {
      const e = new Error('DOMAIN_MEMBERSHIP_FORBIDDEN');
      e.status = 403;
      throw e;
    }
    const policy = this.getDomainIsolationPolicy(ctx);
    if (policy.enforced && requiredScope && policy.allowedScopes.length) {
      if (!policy.allowedScopes.includes(requiredScope) && ctx.role !== 'admin' && ctx.role !== 'owner') {
        const e = new Error('DOMAIN_SCOPE_FORBIDDEN');
        e.status = 403;
        e.details = { requiredScope, allowedScopes: policy.allowedScopes };
        throw e;
      }
    }
    // Fingerprint claim from client headers must match stored fingerprint when present
    const claimed = ctx.domainFingerprint || ctx.headersFingerprint || null;
    if (policy.enforced && policy.fingerprint && claimed) {
      const expected = typeof policy.fingerprint === 'string' ? policy.fingerprint : (policy.fingerprint.value || policy.fingerprint.hash || '');
      if (expected && claimed !== expected) {
        const e = new Error('DOMAIN_FINGERPRINT_MISMATCH');
        e.status = 403;
        throw e;
      }
    }
    return { ok: true, policy, membershipRole: mem.role };
  };

}
module.exports = {attach, STATUSES};
