'use strict';

const crypto = require('node:crypto');
const { requireRole } = require('./rbac');
const { id, now } = require('./security');
const { audit, verifyAuditChain } = require('./audit');
const { warn } = require('./observability');

function stable(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stable);
  return Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])]));
}
function sha(v) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
}
function text(v, max = 240) {
  return String(v ?? '').trim().slice(0, max);
}
function int(v, fallback = 50, max = 500) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
}
function parse(v, fallback = null) {
  try { return JSON.parse(v); } catch { return fallback; }
}
function safeJson(v) {
  return JSON.stringify(v === undefined ? null : v);
}
function distanceMeters(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180, r = 6371000;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(Math.min(1, Math.max(0, x))));
}

const SCENARIOS = Object.freeze({
  'outbox-backlog': {
    description: 'Queued integration deliveries exceed the safe backlog threshold.',
    detector: 'outbox_queue_depth'
  },
  'worker-degradation': {
    description: 'Workers have expired processing leases and require governed recovery.',
    detector: 'stale_processing_jobs'
  },
  'geofence-anomalies': {
    description: 'Field check-ins are materially outside the assigned site radius.',
    detector: 'geofence_distance'
  },
  'runtime-failure': {
    description: 'The current process records a sustained runtime error spike.',
    detector: 'runtime_error_rate'
  },
  'capacity-pressure': {
    description: 'Open work exceeds currently available execution capacity.',
    detector: 'capacity_pressure'
  },
  'dependency-outage': {
    description: 'Integration delivery errors identify an unavailable dependency.',
    detector: 'dependency_failure'
  },
  'cascading-worker-failure': {
    description: 'A worker degradation cascades into queued delivery pressure and runtime errors.',
    detector: 'composite'
  }
});

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_guardrail_policies(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('suggest','approve','deny')),
      max_change REAL,
      allow_in_safe_mode INTEGER NOT NULL DEFAULT 0 CHECK(allow_in_safe_mode IN (0,1)),
      rule_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id,action_type)
    );
    CREATE INDEX IF NOT EXISTS idx_guardrail_policies_org_action
      ON operational_guardrail_policies(organization_id,action_type,enabled);

    CREATE TABLE IF NOT EXISTS causal_evidence_runs(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      incident_ref TEXT,
      graph_json TEXT NOT NULL,
      graph_sha256 TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_causal_evidence_org_created
      ON causal_evidence_runs(organization_id,created_at);

    CREATE TABLE IF NOT EXISTS autopilot_outcomes(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      proposal_id TEXT NOT NULL REFERENCES autopilot_proposals(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      outcome_status TEXT NOT NULL CHECK(outcome_status IN ('resolved','partial','unresolved','unverified')),
      recovery_time_ms INTEGER,
      side_effects_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      outcome_sha256 TEXT NOT NULL,
      measured_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      measured_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_autopilot_outcomes_org_action
      ON autopilot_outcomes(organization_id,action_type,measured_at);
    CREATE INDEX IF NOT EXISTS idx_autopilot_outcomes_org_proposal
      ON autopilot_outcomes(organization_id,proposal_id,measured_at);

    CREATE TABLE IF NOT EXISTS operational_simulation_runs(
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scenario TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('apply','rollback')),
      detection_ms INTEGER NOT NULL,
      detected INTEGER NOT NULL CHECK(detected IN (0,1)),
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      result_sha256 TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_simulation_runs_org_created
      ON operational_simulation_runs(organization_id,created_at);
  `);
}

function scenarioDefaults(name) {
  if (!SCENARIOS[name]) throw new Error('SIMULATION_SCENARIO_INVALID');
  return {
    scenario: name,
    now: now(),
    dependency: 'maps:osrm',
    staleJobs: 6,
    queuedOutbox: 8,
    failedDependencies: 4,
    geofenceAnomalies: 2,
    runtimeRequests: 20,
    runtimeErrors: 4,
    overdueWorkOrders: 6
  };
}

function install(Store) {
  const p = Store.prototype;

  p._fabricEnsure = function () { ensureSchema(this.db); };

  p.listGuardrailPolicies = function (ctx, q = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    const args = [ctx.organizationId];
    let where = 'organization_id=?';
    if (q.actionType) { where += ' AND action_type=?'; args.push(text(q.actionType, 100)); }
    if (q.enabled !== undefined) { where += ' AND enabled=?'; args.push(q.enabled ? 1 : 0); }
    return this.db.prepare(`SELECT * FROM operational_guardrail_policies WHERE ${where} ORDER BY action_type`).all(...args)
      .map(r => ({ ...r, allowInSafeMode: Boolean(r.allow_in_safe_mode), rule: parse(r.rule_json, {}) }));
  };

  p.setGuardrailPolicy = function (ctx, d = {}) {
    requireRole(ctx.role, 'admin');
    this._fabricEnsure();
    const actionType = text(d.actionType, 100);
    const mode = text(d.mode, 20);
    if (!/^[a-z0-9._-]{2,100}$/.test(actionType) || !['suggest', 'approve', 'deny'].includes(mode)) {
      throw new Error('GUARDRAIL_POLICY_INVALID');
    }
    const maxChange = d.maxChange === undefined || d.maxChange === null ? null : Number(d.maxChange);
    if (maxChange !== null && (!Number.isFinite(maxChange) || maxChange < 0)) throw new Error('GUARDRAIL_MAX_CHANGE_INVALID');
    const allowInSafeMode = Boolean(d.allowInSafeMode);
    const rule = d.rule && typeof d.rule === 'object' && !Array.isArray(d.rule) ? d.rule : {};
    const t = now();
    const existing = this.db.prepare('SELECT id FROM operational_guardrail_policies WHERE organization_id=? AND action_type=?')
      .get(ctx.organizationId, actionType);
    const policyId = existing?.id || id('guard');
    if (existing) {
      this.db.prepare(`UPDATE operational_guardrail_policies
        SET mode=?,max_change=?,allow_in_safe_mode=?,rule_json=?,enabled=1,updated_at=?
        WHERE organization_id=? AND action_type=?`)
        .run(mode, maxChange, allowInSafeMode ? 1 : 0, safeJson(rule), t, ctx.organizationId, actionType);
    } else {
      this.db.prepare(`INSERT INTO operational_guardrail_policies
        (id,organization_id,action_type,mode,max_change,allow_in_safe_mode,rule_json,enabled,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,1,?,?,?)`)
        .run(policyId, ctx.organizationId, actionType, mode, maxChange, allowInSafeMode ? 1 : 0, safeJson(rule), ctx.userId, t, t);
    }
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'guardrail_policy_changed',
      resourceType: 'guardrail_policy',
      resourceId: policyId,
      metadata: { actionType, mode, maxChange, allowInSafeMode }
    });
    return this.db.prepare('SELECT * FROM operational_guardrail_policies WHERE organization_id=? AND action_type=?')
      .get(ctx.organizationId, actionType);
  };

  p.evaluateAutopilotPolicy = function (ctx, actionType, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    const safeMode = this.getSafeMode ? this.getSafeMode(ctx) : { enabled: false };
    const row = this.db.prepare(`SELECT * FROM operational_guardrail_policies
      WHERE organization_id=? AND action_type=? AND enabled=1`).get(ctx.organizationId, text(actionType, 100));
    const defaults = {
      mode: 'approve',
      maxChange: null,
      allowInSafeMode: false,
      rule: {}
    };
    const policy = row ? {
      mode: row.mode,
      maxChange: row.max_change,
      allowInSafeMode: Boolean(row.allow_in_safe_mode),
      rule: parse(row.rule_json, {})
    } : defaults;
    const change = d.change === undefined || d.change === null ? null : Number(d.change);
    const blockedBySafeMode = Boolean(safeMode.enabled && !policy.allowInSafeMode);
    const blockedByMaxChange = policy.maxChange !== null && change !== null && Number.isFinite(change) && change > Number(policy.maxChange);
    const blocked = policy.mode === 'deny' || blockedBySafeMode || blockedByMaxChange;
    const approvalRequired = !blocked && policy.mode !== 'suggest';
    return {
      schemaVersion: 'opscore.guardrail-decision.v1',
      actionType: text(actionType, 100),
      mode: policy.mode,
      allowed: !blocked,
      approvalRequired,
      blockedReason: policy.mode === 'deny' ? 'POLICY_DENY' :
        blockedBySafeMode ? 'SAFE_MODE_GUARDRAIL' :
        blockedByMaxChange ? 'MAX_CHANGE_EXCEEDED' : null,
      safeMode: Boolean(safeMode.enabled),
      maxChange: policy.maxChange,
      requestedChange: change,
      allowInSafeMode: policy.allowInSafeMode,
      rule: policy.rule
    };
  };

  p.learningLoop = function (ctx, q = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    const args = [ctx.organizationId];
    let where = 'organization_id=?';
    if (q.actionType) { where += ' AND action_type=?'; args.push(text(q.actionType, 100)); }
    args.push(int(q.limit, 100, 500));
    const rows = this.db.prepare(`SELECT * FROM autopilot_outcomes WHERE ${where}
      ORDER BY measured_at DESC LIMIT ?`).all(...args);
    const grouped = new Map();
    for (const r of rows) {
      const g = grouped.get(r.action_type) || { actionType: r.action_type, total: 0, resolved: 0, partial: 0, unresolved: 0, unverified: 0, recoveryTimesMs: [] };
      g.total++;
      g[r.outcome_status]++;
      if (Number.isFinite(Number(r.recovery_time_ms))) g.recoveryTimesMs.push(Number(r.recovery_time_ms));
      grouped.set(r.action_type, g);
    }
    const insights = [...grouped.values()].map(g => {
      const verified = g.resolved + g.partial + g.unresolved;
      const successRate = verified ? g.resolved / verified : null;
      const avgRecoveryTimeMs = g.recoveryTimesMs.length ?
        Math.round(g.recoveryTimesMs.reduce((a, b) => a + b, 0) / g.recoveryTimesMs.length) : null;
      return {
        actionType: g.actionType,
        samples: g.total,
        verifiedSamples: verified,
        resolved: g.resolved,
        partial: g.partial,
        unresolved: g.unresolved,
        unverified: g.unverified,
        successRate,
        avgRecoveryTimeMs
      };
    });
    return { schemaVersion: 'opscore.autopilot-learning.v1', samples: rows.length, insights };
  };

  p.recordAutopilotOutcome = function (ctx, d = {}) {
    requireRole(ctx.role, 'write');
    this._fabricEnsure();
    const proposalId = text(d.proposalId, 120);
    const row = this.db.prepare(`SELECT id,action_type,status,organization_id,executed_at,proposal_sha256
      FROM autopilot_proposals WHERE organization_id=? AND id=?`).get(ctx.organizationId, proposalId);
    if (!row) throw new Error('AUTOPILOT_PROPOSAL_NOT_FOUND');
    if (row.status !== 'executed') throw new Error('AUTOPILOT_OUTCOME_REQUIRES_EXECUTED');
    const status = text(d.outcomeStatus, 20);
    if (!['resolved', 'partial', 'unresolved', 'unverified'].includes(status)) throw new Error('AUTOPILOT_OUTCOME_INVALID');
    const recovery = d.recoveryTimeMs === undefined || d.recoveryTimeMs === null ? null : Number(d.recoveryTimeMs);
    if (recovery !== null && (!Number.isInteger(recovery) || recovery < 0)) throw new Error('AUTOPILOT_RECOVERY_TIME_INVALID');
    const sideEffects = Array.isArray(d.sideEffects) ? d.sideEffects : [];
    const evidence = d.evidence && typeof d.evidence === 'object' ? d.evidence : {};
    const outcome = {
      schemaVersion: 'opscore.autopilot-outcome.v1',
      proposalId: row.id,
      actionType: row.action_type,
      outcomeStatus: status,
      recoveryTimeMs: recovery,
      sideEffects,
      evidence
    };
    const digest = sha(outcome);
    const measuredAt = text(d.measuredAt || now(), 40);
    const oid = id('outcome');
    this.db.prepare(`INSERT INTO autopilot_outcomes
      (id,organization_id,proposal_id,action_type,outcome_status,recovery_time_ms,side_effects_json,evidence_json,outcome_sha256,measured_by,measured_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      oid, ctx.organizationId, row.id, row.action_type, status, recovery, safeJson(sideEffects), safeJson(evidence),
      digest, ctx.userId, measuredAt, now()
    );
    audit(this.db, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'autopilot_outcome_recorded',
      resourceType: 'autopilot_proposal',
      resourceId: row.id,
      metadata: { outcomeStatus: status, recoveryTimeMs: recovery, outcomeSha256: digest }
    });
    return { id: oid, ...outcome, outcomeSha256: digest, measuredAt };
  };

  p.recoverStaleOperationalJobs = function (ctx, d = {}) {
    requireRole(ctx.role, 'admin');
    const limit = int(d.limit, 20, 100);
    const t = now();
    const rows = this.db.prepare(`SELECT id,queue_name,job_type,attempts
      FROM operational_jobs
      WHERE organization_id=? AND status='processing' AND lease_until IS NOT NULL AND lease_until<? AND attempts<max_attempts
      ORDER BY lease_until,created_at LIMIT ?`).all(ctx.organizationId, t, limit);
    for (const r of rows) {
      this.db.prepare(`UPDATE operational_jobs
        SET status='queued',lease_until=NULL,available_at=?,updated_at=?,last_error=COALESCE(last_error,'worker lease expired; requeued by governed recovery')
        WHERE organization_id=? AND id=? AND status='processing'`).run(t, t, ctx.organizationId, r.id);
      audit(this.db, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'operational_job_requeued_by_governed_recovery',
        resourceType: 'operational_job',
        resourceId: r.id,
        metadata: { queue: r.queue_name, jobType: r.job_type, attempts: r.attempts }
      });
    }
    return {
      schemaVersion: 'opscore.worker-recovery.v1',
      recovered: rows.length,
      jobIds: rows.map(r => r.id),
      action: 'requeue_expired_leases',
      requiresHumanApproval: true
    };
  };

  p.detectOperationalFabric = function (ctx) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    const twin = this.platformTwin(ctx, { persist: true });
    const runtime = this.runtimeObservability(ctx);
    const outboxQueued = Number(this.db.prepare(`SELECT COUNT(*) n FROM integration_outbox
      WHERE organization_id=? AND status='queued'`).get(ctx.organizationId).n || 0);
    const failedDependencies = Number(this.db.prepare(`SELECT COUNT(*) n FROM integration_outbox
      WHERE organization_id=? AND status='failed' AND payload_json LIKE '%"dependency"%'`).get(ctx.organizationId).n || 0);
    const staleProcessingJobs = Number(this.db.prepare(`SELECT COUNT(*) n FROM operational_jobs
      WHERE organization_id=? AND status='processing' AND lease_until IS NOT NULL AND lease_until<?`).get(ctx.organizationId, now()).n || 0);
    const geofenceRows = this.db.prepare(`SELECT a.id,a.work_order_id,a.technician_id,
        s.latitude site_lat,s.longitude site_lon,a.checkin_latitude,a.checkin_longitude
        FROM appointments a JOIN work_orders w ON w.id=a.work_order_id
        LEFT JOIN sites s ON s.id=w.site_id
        WHERE a.organization_id=? AND a.checkin_latitude IS NOT NULL AND a.checkin_longitude IS NOT NULL
          AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`).all(ctx.organizationId);
    const geofenceAnomalies = geofenceRows.filter(r => distanceMeters(
      Number(r.site_lat), Number(r.site_lon), Number(r.checkin_latitude), Number(r.checkin_longitude)
    ) > 200).map(r => ({
      appointmentId: r.id, workOrderId: r.work_order_id, technicianId: r.technician_id,
      distanceMeters: Math.round(distanceMeters(Number(r.site_lat), Number(r.site_lon), Number(r.checkin_latitude), Number(r.checkin_longitude)))
    }));
    const capacityPressure = twin.openStatusCount > 0 && twin.signals.activeTechnicians === 0;
    const signals = {
      schemaVersion: 'opscore.operational-fabric-signals.v1',
      generatedAt: now(),
      twin: {
        snapshotId: twin.snapshotId,
        stateSha256: twin.stateSha256,
        openWorkOrders: twin.openStatusCount,
        overdueWorkOrders: twin.signals.overdueWorkOrders,
        unassignedActiveWorkOrders: twin.signals.unassignedActiveWorkOrders,
        activeTechnicians: twin.signals.activeTechnicians
      },
      outboxQueued,
      failedDependencies,
      staleProcessingJobs,
      geofenceAnomalies,
      runtime: {
        requests: runtime.requests,
        errors: runtime.errors,
        errorRate: runtime.errorRate,
        avgLatencyMs: runtime.avgLatencyMs
      },
      capacityPressure,
      detected: {
        outboxBacklog: outboxQueued >= 5,
        dependencyOutage: failedDependencies >= 2,
        workerDegradation: staleProcessingJobs > 0,
        geofenceAnomaly: geofenceAnomalies.length > 0,
        runtimeFailure: runtime.errorRate >= 0.05,
        capacityPressure
      }
    };
    return signals;
  };

  function makeScenarioArtifacts(store, ctx, name, cfg) {
    const created = { workOrders: [], appointments: [], jobs: [], outbox: [] };
    if (name === 'outbox-backlog' || name === 'cascading-worker-failure') {
      for (let i = 0; i < cfg.queuedOutbox; i++) {
        const oid = id('outbox');
        store.db.prepare(`INSERT INTO integration_outbox
          (id,organization_id,event_key,event_type,aggregate_type,aggregate_id,actor_user_id,payload_json,status,attempts,last_error,created_at,updated_at,delivered_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          oid, ctx.organizationId, `${name}:${oid}`, 'demo.integration.backlog', 'simulation', oid, ctx.userId,
          safeJson({ scenario: name, synthetic: true }), 'queued', 0, null, cfg.now, cfg.now, null
        );
        created.outbox.push(oid);
      }
    }
    if (name === 'dependency-outage' || name === 'cascading-worker-failure') {
      for (let i = 0; i < cfg.failedDependencies; i++) {
        const oid = id('outbox');
        store.db.prepare(`INSERT INTO integration_outbox
          (id,organization_id,event_key,event_type,aggregate_type,aggregate_id,actor_user_id,payload_json,status,attempts,last_error,created_at,updated_at,delivered_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          oid, ctx.organizationId, `${name}:dependency:${oid}`, 'demo.dependency.delivery', 'dependency', oid, ctx.userId,
          safeJson({ scenario: name, dependency: cfg.dependency }), 'failed', 5, 'SIMULATED_DEPENDENCY_OUTAGE', cfg.now, cfg.now, null
        );
        created.outbox.push(oid);
      }
    }
    if (name === 'worker-degradation' || name === 'cascading-worker-failure') {
      const expired = new Date(Date.now() - 60000).toISOString();
      for (let i = 0; i < cfg.staleJobs; i++) {
        const jid = id('job');
        store.db.prepare(`INSERT INTO operational_jobs
          (id,organization_id,queue_name,job_type,entity_type,entity_id,payload_json,status,attempts,max_attempts,available_at,lease_until,last_error,result_json,created_by,created_at,updated_at,completed_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          jid, ctx.organizationId, 'incident', 'simulation.worker', 'simulation', jid, safeJson({ scenario: name }),
          'processing', 2, 5, expired, expired, 'SIMULATED_WORKER_DEGRADATION', null, ctx.userId, cfg.now, cfg.now, null
        );
        created.jobs.push(jid);
      }
    }
    if (name === 'geofence-anomalies') {
      const customer = id('customer'), site = id('site'), technician = thisUser(store, ctx), t = cfg.now;
      store.db.prepare('INSERT INTO customers(id,organization_id,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .run(customer, ctx.organizationId, 'Simulation Customer', 'active', t, t);
      store.db.prepare('INSERT INTO sites(id,organization_id,customer_id,name,address,latitude,longitude,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(site, ctx.organizationId, customer, 'Simulation Site', 'Local Simulation', 30, 31, t, t);
      for (let i = 0; i < cfg.geofenceAnomalies; i++) {
        const wo = id('wo-sim'), ap = id('ap-sim');
        store.db.prepare(`INSERT INTO work_orders
          (id,organization_id,number,title,description,status,priority,customer_id,site_id,assigned_to,due_at,created_by,created_at,updated_at,asset_id,completion_policy_id,completion_policy_version)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(wo,ctx.organizationId,`SIM-GEOFENCE-${i+1}`,`Simulation geofence ${i+1}`,'Generated only for local simulation.','open','high',customer,site,technician,null,ctx.userId,t,t,null,null,null);
        store.db.prepare(`INSERT INTO appointments
          (id,organization_id,work_order_id,technician_id,start_at,end_at,status,created_by,created_at,updated_at,checkin_latitude,checkin_longitude,checkin_accuracy_m,checked_in_at,checked_in_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(ap,ctx.organizationId,wo,technician,new Date(Date.now()-600000).toISOString(),new Date(Date.now()+600000).toISOString(),'en_route',ctx.userId,t,t,31,32,8,t,technician);
        created.workOrders.push(wo);
        created.appointments.push(ap);
      }
    }
    if (name === 'runtime-failure' || name === 'cascading-worker-failure') {
      store._runtimeMetrics.requests += cfg.runtimeRequests;
      store._runtimeMetrics.errors += cfg.runtimeErrors;
    }
    if (name === 'capacity-pressure') {
      const t = cfg.now, due = new Date(Date.now() - 3600000).toISOString();
      for (let i = 0; i < cfg.overdueWorkOrders; i++) {
        const wo = id('wo-sim');
        store.db.prepare(`INSERT INTO work_orders
          (id,organization_id,number,title,description,status,priority,customer_id,site_id,assigned_to,due_at,created_by,created_at,updated_at,asset_id,completion_policy_id,completion_policy_version)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(wo,ctx.organizationId,`SIM-CAPACITY-${i+1}`,`Simulation capacity ${i+1}`,'Generated only for local simulation.','open',i<2?'urgent':'high',null,null,null,due,ctx.userId,t,t,null,null,null);
        created.workOrders.push(wo);
      }
    }
    return created;
  }

  function thisUser(store, ctx) {
    const row = store.db.prepare('SELECT id FROM users WHERE id=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=? AND m.organization_id=?)')
      .get(ctx.userId, ctx.userId, ctx.organizationId);
    if (!row) throw new Error('SIMULATION_ACTOR_INVALID');
    return row.id;
  }

  p.simulateOperationalScenario = function (ctx, d = {}) {
    requireRole(ctx.role, 'write');
    this._fabricEnsure();
    const name = text(d.scenario, 100);
    const cfg = Object.assign(scenarioDefaults(name), d);
    const mode = d.rollback === false ? 'apply' : 'rollback';
    const started = Date.now();
    const outerTx = this._txDepth === 0;
    if (outerTx) this.db.exec('BEGIN IMMEDIATE');
    this._txDepth++;
    let created = {};
    const runtimeBefore = { ...this._runtimeMetrics };
    try {
      const before = this.detectOperationalFabric(ctx);
      created = makeScenarioArtifacts(this, ctx, name, cfg);
      const after = this.detectOperationalFabric(ctx);
      const detectionMs = Date.now() - started;
      const detected = Object.values(after.detected).some(Boolean) &&
        (name === 'cascading-worker-failure' ? after.detected.workerDegradation && after.detected.outboxBacklog && after.detected.runtimeFailure : true);
      const result = {
        schemaVersion: 'opscore.operational-simulation.v1',
        scenario: name,
        description: SCENARIOS[name].description,
        detector: SCENARIOS[name].detector,
        detected,
        detectionMs,
        before,
        after,
        created,
        expected: {
          outboxBacklog: ['outbox-backlog','cascading-worker-failure'].includes(name),
          workerDegradation: ['worker-degradation','cascading-worker-failure'].includes(name),
          geofenceAnomaly: name === 'geofence-anomalies',
          runtimeFailure: ['runtime-failure','cascading-worker-failure'].includes(name),
          capacityPressure: name === 'capacity-pressure',
          dependencyOutage: ['dependency-outage','cascading-worker-failure'].includes(name)
        },
        rollback: mode === 'rollback'
      };
      const digest = sha(result);
      if (mode === 'apply') {
        const t = now();
        const simulationId = id('sim');
        this.db.prepare(`INSERT INTO operational_simulation_runs
          (id,organization_id,scenario,mode,detection_ms,detected,before_json,after_json,result_json,result_sha256,created_by,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          simulationId, ctx.organizationId, name, mode, detectionMs, detected ? 1 : 0,
          safeJson(before), safeJson(after), safeJson(result), digest, ctx.userId, t
        );
        audit(this.db, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId,
          action: 'operational_simulation_run',
          resourceType: 'operational_simulation',
          resourceId: simulationId,
          metadata: { scenario: name, detected, detectionMs, resultSha256: digest }
        });
      }
      this._txDepth--;
      if (outerTx) {
        if (mode === 'rollback') {
          this.db.exec('ROLLBACK');
          this._runtimeMetrics = runtimeBefore;
        } else this.db.exec('COMMIT');
      }
      return { ...result, resultSha256: digest, scenarioCatalog: SCENARIOS };
    } catch (e) {
      this._txDepth = Math.max(0, this._txDepth - 1);
      if (outerTx) { try { this.db.exec('ROLLBACK'); } catch (rollbackError) { warn('transaction.rollback_failed', { operation: 'operational_simulation', error: rollbackError }); } }
      throw e;
    }
  };

  p.getOperationalEvidenceCenter = function (ctx, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    if (this._autopilotEnsure) this._autopilotEnsure();
    const limit = int(d.limit, 100, 500);
    const signals = this.detectOperationalFabric(ctx);
    const graphRow = this.db.prepare(`SELECT id,graph_json,graph_sha256 FROM causal_evidence_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT 1`).get(ctx.organizationId);
    const graph = graphRow ? { id: graphRow.id, ...parse(graphRow.graph_json, { summary: {}, nodes: [], edges: [] }), graphSha256: graphRow.graph_sha256 } : { id: null, graphSha256: null, summary: {}, nodes: [], edges: [] };
    const proposals = this.db.prepare(`SELECT id,incident_ref,action_type,status,risk,approval_required,proposal_sha256,created_at,approved_at,executed_at
      FROM autopilot_proposals WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId, limit);
    const outcomes = this.db.prepare(`SELECT id,proposal_id,action_type,outcome_status,recovery_time_ms,outcome_sha256,measured_at
      FROM autopilot_outcomes WHERE organization_id=? ORDER BY measured_at DESC LIMIT ?`).all(ctx.organizationId, limit);
    const simulations = this.db.prepare(`SELECT id,scenario,mode,detection_ms,detected,result_sha256,created_at
      FROM operational_simulation_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId, limit);
    return {
      schemaVersion: 'opscore.operational-evidence-center.v1',
      generatedAt: now(),
      incidentRef: text(d.incidentRef, 120) || null,
      observe: signals,
      evidenceGraph: { id: graph.id, graphSha256: graph.graphSha256, summary: graph.summary, nodes: graph.nodes, edges: graph.edges },
      decisions: proposals,
      outcomes,
      simulations,
      integrity: this.verifyOperationalEvidence(ctx, { graphId: graph.id }),
      truthBoundary: 'Evidence aggregation and cryptographic verification only; it does not prove statistical causality or production certification.'
    };
  };

  p.exportOperationalReplayPackage = function (ctx, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    if (this._autopilotEnsure) this._autopilotEnsure();
    const incidentRef = text(d.incidentRef, 120) || null;
    const fromAt = text(d.fromAt || new Date(Date.now() - 24 * 3600000).toISOString(), 40);
    const toAt = text(d.toAt || now(), 40);
    if (!fromAt || Number.isNaN(Date.parse(fromAt))) throw new Error('REPLAY_FROM_INVALID');
    if (!toAt || Number.isNaN(Date.parse(toAt)) || Date.parse(toAt) < Date.parse(fromAt)) throw new Error('REPLAY_WINDOW_INVALID');
    const limit = int(d.limit, 250, 500);
    const auditRows = this.db.prepare(`SELECT id,actor_user_id,action,resource_type,resource_id,metadata_json,created_at,previous_hash,event_hash
      FROM audit_log WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC, id ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit)
      .map(r => ({ ...r, metadata: parse(r.metadata_json, {}) }));
    const decisions = this.db.prepare(`SELECT id,decision_type,input_json,rules_json,outcome_json,decision_sha256,created_by,created_at,replayed_at
      FROM decision_replays WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit)
      .map(r => ({ ...r, input: parse(r.input_json, {}), rules: parse(r.rules_json, []), outcome: parse(r.outcome_json, {}) }));
    const proposals = this.db.prepare(`SELECT id,incident_ref,action_type,target_json,reasons_json,risk,approval_required,status,proposal_json,proposal_sha256,created_by,approved_by,approved_at,executed_by,executed_at,created_at
      FROM autopilot_proposals WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit)
      .map(r => ({ ...r, target: parse(r.target_json, {}), reasons: parse(r.reasons_json, []), proposal: parse(r.proposal_json, {}) }));
    const outcomes = this.db.prepare(`SELECT id,proposal_id,action_type,outcome_status,recovery_time_ms,side_effects_json,evidence_json,outcome_sha256,measured_by,measured_at,created_at
      FROM autopilot_outcomes WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit)
      .map(r => ({ ...r, sideEffects: parse(r.side_effects_json, []), evidence: parse(r.evidence_json, {}) }));
    const simulations = this.db.prepare(`SELECT id,scenario,mode,detection_ms,detected,before_json,after_json,result_json,result_sha256,created_by,created_at
      FROM operational_simulation_runs WHERE organization_id=? AND created_at>=? AND created_at<=? ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit)
      .map(r => ({ ...r, before: parse(r.before_json, {}), after: parse(r.after_json, {}), result: parse(r.result_json, {}) }));
    const payload = { schemaVersion: 'opscore.operational-replay-package.v1', organizationId: ctx.organizationId, incidentRef, fromAt, toAt, audit: auditRows, decisions, proposals, outcomes, simulations };
    const packageSha256 = sha(payload);
    return { ...payload, packageSha256, replaySafety: 'READ_ONLY_DATA_PACKAGE; replaying this package does not execute actions.' };
  };

  p.verifyOperationalEvidence = function (ctx, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    if (this._autopilotEnsure) this._autopilotEnsure();
    const auditVerification = verifyAuditChain(this.db, ctx.organizationId);
    const graphRows = this.db.prepare(`SELECT id,graph_json,graph_sha256 FROM causal_evidence_runs WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId, int(d.limit, 50, 200));
    const graphs = graphRows.map(r => {
      const graph = parse(r.graph_json, null);
      const recomputed = graph ? sha(graph) : null;
      return { id: r.id, storedSha256: r.graph_sha256, recomputedSha256: recomputed, valid: Boolean(graph && recomputed === r.graph_sha256) };
    });
    const outcomeRows = this.db.prepare(`SELECT id,proposal_id,action_type,outcome_status,recovery_time_ms,side_effects_json,evidence_json,outcome_sha256
      FROM autopilot_outcomes WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId, int(d.limit, 50, 200));
    const outcomes = outcomeRows.map(r => {
      const payload = { schemaVersion: 'opscore.autopilot-outcome.v1', proposalId: r.proposal_id, actionType: r.action_type, outcomeStatus: r.outcome_status, recoveryTimeMs: r.recovery_time_ms, sideEffects: parse(r.side_effects_json, []), evidence: parse(r.evidence_json, {}) };
      const recomputed = sha(payload);
      return { id: r.id, storedSha256: r.outcome_sha256, recomputedSha256: recomputed, valid: recomputed === r.outcome_sha256 };
    });
    return { schemaVersion: 'opscore.operational-evidence-integrity.v1', audit: auditVerification, graphs, outcomes, valid: auditVerification.valid && graphs.every(x => x.valid) && outcomes.every(x => x.valid), checkedAt: now(), mode: 'read_only' };
  };

  p.evaluateAutopilotSafetyContract = function (ctx, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    if (this._autopilotEnsure) this._autopilotEnsure();
    const proposals = this.db.prepare(`SELECT id,action_type,status,risk,approval_required,target_json FROM autopilot_proposals
      WHERE organization_id=? AND status IN ('pending','approved') ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, int(d.limit, 100, 500));
    const checks = proposals.map(r => {
      const target = parse(r.target_json, {});
      const policy = this.evaluateAutopilotPolicy(ctx, r.action_type, { change: target.change });
      const approvalSatisfied = r.approval_required ? r.status === 'approved' : true;
      const executable = policy.allowed && approvalSatisfied;
      return { proposalId: r.id, actionType: r.action_type, status: r.status, risk: r.risk, policy, approvalSatisfied, executable };
    });
    return {
      schemaVersion: 'opscore.autopilot-safety-contract.v1',
      stages: ['observe','understand','simulate','decide','approve','act','verify','learn'],
      checks,
      executableCount: checks.filter(x => x.executable).length,
      blockedCount: checks.filter(x => !x.executable).length,
      invariant: 'No action is executable unless policy allows it and any required human approval is satisfied.',
      evaluatedAt: now()
    };
  };

  p.buildCausalEvidenceGraph = function (ctx, d = {}) {
    requireRole(ctx.role, 'read');
    this._fabricEnsure();
    if (this._autopilotEnsure) this._autopilotEnsure();
    const incidentRef = text(d.incidentRef, 120) || null;
    const fromAt = text(d.fromAt || new Date(Date.now() - 24 * 3600000).toISOString(), 40);
    const toAt = text(d.toAt || now(), 40);
    const limit = int(d.limit, 250, 500);
    const nodes = [], edges = [], nodeIndex = new Set(), edgeIndex = new Set();
    const addNode = (idValue, type, label, evidence = {}) => {
      const nid = `${type}:${idValue}`;
      if (!nodeIndex.has(nid)) {
        nodeIndex.add(nid);
        nodes.push({ id: nid, type, label: text(label, 160), evidence });
      }
      return nid;
    };
    const addEdge = (from, to, relation, evidence = {}) => {
      const key = `${from}|${to}|${relation}`;
      if (!edgeIndex.has(key)) {
        edgeIndex.add(key);
        edges.push({ from, to, relation, evidence });
      }
    };

    const signals = this.detectOperationalFabric(ctx);
    for (const a of [
      ...(signals.outboxQueued ? [{ code: 'OUTBOX_BACKLOG', count: signals.outboxQueued }] : []),
      ...(signals.failedDependencies ? [{ code: 'DEPENDENCY_OUTAGE', count: signals.failedDependencies }] : []),
      ...(signals.staleProcessingJobs ? [{ code: 'WORKER_DEGRADATION', count: signals.staleProcessingJobs }] : []),
      ...(signals.geofenceAnomalies.length ? [{ code: 'GEOFENCE_ANOMALY', count: signals.geofenceAnomalies.length }] : []),
      ...(signals.runtime.errorRate >= 0.05 ? [{ code: 'RUNTIME_FAILURE', count: signals.runtime.errors }] : []),
      ...(signals.capacityPressure ? [{ code: 'CAPACITY_PRESSURE', count: signals.twin.openWorkOrders }] : [])
    ]) {
      addNode(a.code, 'signal', a.code, { source: 'detectOperationalFabric', count: a.count });
    }

    const auditRows = this.db.prepare(`SELECT id,action,resource_type,resource_id,metadata_json,created_at
      FROM audit_log WHERE organization_id=? AND created_at>=? AND created_at<=?
      ORDER BY created_at ASC, id ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit);
    for (const r of auditRows) {
      const event = addNode(r.id, 'event', r.action, { createdAt: r.created_at, source: 'audit_log' });
      const resource = addNode(`${r.resource_type}:${r.resource_id || 'none'}`, 'resource', r.resource_type, {
        resourceId: r.resource_id, source: 'audit_log'
      });
      addEdge(event, resource, 'targets', { auditId: r.id });
      const meta = parse(r.metadata_json, {});
      if (String(r.action).includes('outbox') || String(meta.eventType || '').includes('integration')) {
        const dep = addNode(meta.dependency || 'integration_outbox', 'dependency', meta.dependency || 'integration_outbox', { source: 'audit_log', auditId: r.id });
        addEdge(event, dep, 'depends_on', { auditId: r.id });
      }
      for (const n of nodes.filter(n => n.type === 'signal').slice(0, 20)) addEdge(n.id, event, 'evidenced_by', { auditId: r.id });
    }

    const dependencyRows = this.db.prepare(`SELECT id,payload_json,event_type,status,created_at
      FROM integration_outbox
      WHERE organization_id=? AND created_at>=? AND created_at<=? AND status IN ('queued','failed')
      ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit);
    for (const r of dependencyRows) {
      const payload = parse(r.payload_json, {});
      const depName = text(payload.dependency || (String(r.event_type).startsWith('demo.') ? r.event_type : 'integration_outbox'), 120);
      const dep = addNode(depName, 'dependency', depName, {
        outboxId: r.id, status: r.status, eventType: r.event_type, createdAt: r.created_at, source: 'integration_outbox'
      });
      for (const sn of nodes.filter(n => n.type === 'signal' && (
        (n.label === 'OUTBOX_BACKLOG' && r.status === 'queued') ||
        (n.label === 'DEPENDENCY_OUTAGE' && r.status === 'failed')
      ))) addEdge(sn.id, dep, 'evidence_dependency', { outboxId: r.id });
    }

    const impact = addNode(`twin:${signals.twin.stateSha256}`, 'impact', 'Operational impact', {
      openWorkOrders: signals.twin.openWorkOrders,
      overdueWorkOrders: signals.twin.overdueWorkOrders,
      unassignedActiveWorkOrders: signals.twin.unassignedActiveWorkOrders,
      activeTechnicians: signals.twin.activeTechnicians,
      stateSha256: signals.twin.stateSha256
    });
    for (const n of nodes.filter(n => n.type === 'signal')) addEdge(n.id, impact, 'contributes_to', { stateSha256: signals.twin.stateSha256 });

    const decisions = this.db.prepare(`SELECT id,decision_type,decision_sha256,created_at
      FROM decision_replays WHERE organization_id=? AND created_at>=? AND created_at<=?
      ORDER BY created_at ASC LIMIT ?`).all(ctx.organizationId, fromAt, toAt, limit);
    for (const r of decisions) {
      const dn = addNode(r.id, 'decision', r.decision_type, { decisionSha256: r.decision_sha256, createdAt: r.created_at });
      addEdge(impact, dn, 'informed', { decisionSha256: r.decision_sha256 });
      const related = nodes.filter(n => n.type === 'signal');
      for (const sn of related) addEdge(sn.id, dn, 'informs', { decisionSha256: r.decision_sha256 });
    }

    const proposals = this.db.prepare(`SELECT id,action_type,status,proposal_sha256,created_at,executed_at
      FROM autopilot_proposals WHERE organization_id=? ORDER BY created_at DESC LIMIT ?`).all(ctx.organizationId, limit);
    for (const r of proposals) {
      const pn = addNode(r.id, 'decision', `Proposal: ${r.action_type}`, { status: r.status, proposalSha256: r.proposal_sha256 });
      addEdge(impact, pn, 'informs', { proposalSha256: r.proposal_sha256 });
    }

    const outcomes = this.db.prepare(`SELECT id,proposal_id,action_type,outcome_status,recovery_time_ms,outcome_sha256,measured_at
      FROM autopilot_outcomes WHERE organization_id=? ORDER BY measured_at DESC LIMIT ?`).all(ctx.organizationId, limit);
    for (const r of outcomes) {
      const on = addNode(r.id, 'outcome', r.outcome_status, { proposalId: r.proposal_id, actionType: r.action_type, recoveryTimeMs: r.recovery_time_ms, outcomeSha256: r.outcome_sha256 });
      const pn = addNode(r.proposal_id, 'decision', `Proposal: ${r.action_type}`, { status: 'executed' });
      addEdge(pn, on, 'resulted_in', { outcomeSha256: r.outcome_sha256 });
      addEdge(impact, on, 'measured_against', { outcomeSha256: r.outcome_sha256 });
    }

    const graph = {
      schemaVersion: 'opscore.causal-evidence-graph.v1',
      semantics: 'Evidence linkage graph; relationships are provenance links, not statistical proof of causality.',
      incidentRef, fromAt, toAt, nodes, edges,
      summary: {
        signals: nodes.filter(n => n.type === 'signal').length,
        events: nodes.filter(n => n.type === 'event').length,
        resources: nodes.filter(n => n.type === 'resource').length,
        dependencies: nodes.filter(n => n.type === 'dependency').length,
        impacts: nodes.filter(n => n.type === 'impact').length,
        decisions: nodes.filter(n => n.type === 'decision').length,
        outcomes: nodes.filter(n => n.type === 'outcome').length
      }
    };
    const digest = sha(graph);
    const runId = id('cgraph');
    this.db.prepare(`INSERT INTO causal_evidence_runs
      (id,organization_id,incident_ref,graph_json,graph_sha256,created_by,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(runId, ctx.organizationId, incidentRef, safeJson(graph), digest, ctx.userId, now());
    return { id: runId, ...graph, graphSha256: digest };
  };
}

module.exports = { install, ensureSchema, sha, SCENARIOS };
