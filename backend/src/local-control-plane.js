'use strict';
const crypto = require('node:crypto');
const { requireRole } = require('./rbac');
const { id, now } = require('./security');

function canonical(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function text(v, max = 200) { return String(v ?? '').trim().slice(0, max); }

function ensureSchema(db) {
  // PostgreSQL control-plane tables are provisioned by migrations, not runtime DDL.
  if (db.engine === 'postgres') return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      flag_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      reason TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id,flag_key)
    );
    CREATE INDEX IF NOT EXISTS idx_feature_flags_org ON feature_flags(organization_id,enabled,flag_key);
    CREATE TABLE IF NOT EXISTS safe_mode_states (
      organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      reason TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_plane_runs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      run_type TEXT NOT NULL,
      result_json TEXT NOT NULL,
      result_sha256 TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_control_plane_runs_org_created ON control_plane_runs(organization_id,created_at);
  `);
}

function attach(Store) {
  const p = Store.prototype;
  p._controlPlaneEnsure = function () {
    try { ensureSchema(this.db); }
    catch (error) {
      // Postgres may reject multi-statement SQLite DDL batches; tables are provisioned by migration/ops.
      const msg = String(error && error.message || error);
      if (!/already exists|duplicate/i.test(msg)) {
        // Soft-fail only when core control-plane tables are already readable.
        try {
          this.db.prepare('SELECT 1 AS ok FROM safe_mode_states LIMIT 1').get();
        } catch (_) {
          throw error;
        }
      }
    }
  };

  p.listFeatureFlags = function (ctx) {
    requireRole(ctx.role, 'read');
    this._controlPlaneEnsure();
    return this.db.prepare('SELECT flag_key,enabled,reason,updated_by,created_at,updated_at FROM feature_flags WHERE organization_id=? ORDER BY flag_key').all(ctx.organizationId)
      .map(r => ({ ...r, enabled: Boolean(r.enabled) }));
  };

  p.setFeatureFlag = function (ctx, d = {}) {
    requireRole(ctx.role, 'admin');
    this._controlPlaneEnsure();
    const key = text(d.key || d.flagKey || '', 80).toLowerCase();
    if (!/^[a-z][a-z0-9._-]{1,79}$/.test(key)) throw new Error('FEATURE_FLAG_INVALID');
    const enabled = Boolean(d.enabled);
    const reason = text(d.reason || '', 300);
    const t = now();
    this.db.prepare(`INSERT INTO feature_flags(id,organization_id,flag_key,enabled,reason,updated_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(organization_id,flag_key) DO UPDATE SET enabled=excluded.enabled,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .run(id('flag'), ctx.organizationId, key, enabled ? 1 : 0, reason, ctx.userId, t, t);
    return this.db.prepare('SELECT flag_key,enabled,reason,updated_by,created_at,updated_at FROM feature_flags WHERE organization_id=? AND flag_key=?').get(ctx.organizationId, key);
  };

  p.getSafeMode = function (ctx) {
    requireRole(ctx.role, 'read');
    this._controlPlaneEnsure();
    const row = this.db.prepare('SELECT enabled,reason,updated_by,updated_at FROM safe_mode_states WHERE organization_id=?').get(ctx.organizationId);
    return {
      schemaVersion: 'opscore.safe-mode.v1',
      enabled: Boolean(row?.enabled),
      reason: row?.reason || '',
      updatedBy: row?.updated_by || null,
      updatedAt: row?.updated_at || null,
      semantics: 'Safe Mode does not mutate data automatically; clients should disable non-essential writes and integrations while enabled.'
    };
  };

  p.setSafeMode = function (ctx, d = {}) {
    requireRole(ctx.role, 'admin');
    this._controlPlaneEnsure();
    const enabled = Boolean(d.enabled);
    const reason = text(d.reason || (enabled ? 'Operator activated safe mode' : 'Operator cleared safe mode'), 300);
    const t = now();
    this.db.prepare(`INSERT INTO safe_mode_states(organization_id,enabled,reason,updated_by,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .run(ctx.organizationId, enabled ? 1 : 0, reason, ctx.userId, t);
    return this.getSafeMode(ctx);
  };

  p.createRecoveryBundle = function (ctx, maxRows = 5000) {
    requireRole(ctx.role, 'admin');
    this._controlPlaneEnsure();
    let exported = { tables: {}, note: 'export_unavailable' };
    try { exported = this.exportOrganizationSnapshot(ctx, maxRows); }
    catch (error) {
      exported = { tables: {}, note: 'export_partial_or_unavailable', error: String(error && error.message || error).slice(0, 200) };
    }
    const bundle = {
      schemaVersion: 'opscore.recovery-bundle.v1',
      organizationId: ctx.organizationId,
      createdAt: now(),
      export: exported,
      controlPlane: {
        safeMode: this.getSafeMode(ctx),
        featureFlags: this.listFeatureFlags(ctx)
      }
    };
    const digest = sha(bundle);
    const out = { ...bundle, bundleSha256: digest };
    const t = now();
    this.db.prepare('INSERT INTO control_plane_runs(id,organization_id,run_type,result_json,result_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id('recovery'), ctx.organizationId, 'recovery_bundle', JSON.stringify(out), digest, ctx.userId, t);
    return out;
  };

  p.verifyRecoveryBundle = function (ctx, bundle) {
    requireRole(ctx.role, 'admin');
    this._controlPlaneEnsure();
    if (!bundle || bundle.schemaVersion !== 'opscore.recovery-bundle.v1') throw new Error('RECOVERY_BUNDLE_INVALID');
    if (bundle.organizationId !== ctx.organizationId) throw new Error('RECOVERY_BUNDLE_TENANT_MISMATCH');
    const supplied = String(bundle.bundleSha256 || '');
    const copy = { ...bundle };
    delete copy.bundleSha256;
    const recomputed = sha(copy);
    const valid = supplied.length === 64 && /^[a-f0-9]{64}$/.test(supplied) && supplied === recomputed;
    return {
      schemaVersion: 'opscore.recovery-verify.v1',
      valid,
      organizationId: ctx.organizationId,
      bundleSha256: supplied,
      recomputedSha256: recomputed,
      rowCounts: Object.fromEntries(Object.entries(bundle.export?.tables || {}).map(([name, body]) => [name, Array.isArray(body?.rows) ? body.rows.length : 0])),
      importMode: 'dry_run_only',
      note: valid ? 'Bundle integrity and tenant binding verified. This endpoint does not overwrite live records.' : 'Bundle hash mismatch; do not import.'
    };
  };

  p.controlPlaneSnapshot = function (ctx) {
    requireRole(ctx.role, 'read');
    this._controlPlaneEnsure();
    let twin = { snapshotId: null, stateSha256: null, openStatusCount: 0, signals: { overdueWorkOrders: 0, unassignedActiveWorkOrders: 0 } };
    let health = { outbox: { failed: 0, deadLetterPresentation: 0 }, storage: {} };
    let runtime = { requests: 0, errors: 0, errorRate: 0, avgLatencyMs: 0 };
    try { twin = this.platformTwin(ctx, { persist: false }) || twin; } catch (_) { /* twin optional on sparse tenants */ }
    try { health = this.operationsHealthCenter(ctx) || health; } catch (_) { /* health optional */ }
    try { runtime = this.runtimeObservability(ctx) || runtime; } catch (_) { /* runtime optional */ }
    const flags = this.listFeatureFlags(ctx);
    const safeMode = this.getSafeMode(ctx);
    const anomalies = [];
    const failedOutbox = Number(health.outbox?.failed || 0);
    const deadLetters = Number(health.outbox?.deadLetterPresentation || 0);
    if (failedOutbox > 0) anomalies.push({ code: 'OUTBOX_FAILURES', severity: failedOutbox >= 5 ? 'high' : 'medium', count: failedOutbox, action: 'Inspect failed integration deliveries before replay.' });
    if (deadLetters > 0) anomalies.push({ code: 'OUTBOX_DEAD_LETTER_CANDIDATE', severity: 'high', count: deadLetters, action: 'Review attempts>=5 and quarantine or replay intentionally.' });
    if (twin.signals.overdueWorkOrders > 0) anomalies.push({ code: 'OVERDUE_WORK', severity: 'high', count: twin.signals.overdueWorkOrders, action: 'Re-plan overdue work and confirm ownership.' });
    if (twin.signals.unassignedActiveWorkOrders > 0) anomalies.push({ code: 'UNASSIGNED_ACTIVE_WORK', severity: 'medium', count: twin.signals.unassignedActiveWorkOrders, action: 'Review qualified capacity and assignment.' });
    if (runtime.errorRate >= 0.05) anomalies.push({ code: 'RUNTIME_ERROR_RATE', severity: 'high', count: runtime.errors, action: 'Inspect recent route errors using correlation IDs.' });
    if (safeMode.enabled) anomalies.unshift({ code: 'SAFE_MODE_ACTIVE', severity: 'critical', count: 1, action: 'Restrict non-essential writes and integrations until cleared.' });
    const status = anomalies.some(x => x.severity === 'critical') ? 'critical' : anomalies.some(x => x.severity === 'high') ? 'attention' : anomalies.length ? 'watch' : 'nominal';
    const result = {
      schemaVersion: 'opscore.control-plane.v1',
      evaluatedAt: now(),
      status,
      safeMode,
      featureFlags: flags,
      twin: { snapshotId: twin.snapshotId, stateSha256: twin.stateSha256, openStatusCount: twin.openStatusCount, signals: twin.signals },
      runtime: { requests: runtime.requests, errors: runtime.errors, errorRate: runtime.errorRate, avgLatencyMs: runtime.avgLatencyMs },
      outbox: health.outbox,
      storage: health.storage,
      anomalies,
      governance: {
        automaticRemediation: false,
        humanApprovalRequired: true,
        tenantScoped: true
      }
    };
    const digest = sha(result);
    result.resultSha256 = digest;
    this.db.prepare('INSERT INTO control_plane_runs(id,organization_id,run_type,result_json,result_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id('control'), ctx.organizationId, 'diagnostic_snapshot', JSON.stringify(result), digest, ctx.userId, result.evaluatedAt);
    return result;
  };
}

module.exports = { attach, ensureSchema };
