'use strict';
const {warn}=require('./observability');
const { performance } = require('node:perf_hooks');
const { id, now } = require('./security');

class WorkerResourceGuard {
  constructor(opts = {}) {
    const numberSetting = (key, provided, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
      const raw = provided ?? process.env[key] ?? fallback;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`INVALID_WORKER_CONFIG_${key}`);
      return value;
    };
    this.maxHeapBytes = numberSetting('OPSC_WORKER_MAX_HEAP_MB', opts.maxHeapMb, 512, { min: 64, max: 1024 * 1024 }) * 1024 * 1024;
    this.maxDbLatencyMs = numberSetting('OPSC_WORKER_MAX_DB_LATENCY_MS', opts.maxDbLatencyMs, 250, { min: 1, max: 600000 });
    this.maxConcurrent = numberSetting('OPSC_WORKER_MAX_ACTIVE_JOBS', opts.maxConcurrent, 1, { min: 1, max: 10000 });
    this.pressureThreshold = numberSetting('OPSC_WORKER_PRESSURE_THRESHOLD', opts.pressureThreshold, 3, { min: 1, max: 100000 });
    this.cooldownMs = numberSetting('OPSC_WORKER_CIRCUIT_COOLDOWN_MS', opts.cooldownMs, 30000, { min: 1, max: 86400000 });
    this.active = 0;
    this.states = new Map();
  }
  metrics(db) {
    const started = performance.now();
    db.prepare('SELECT 1').get();
    const dbLatencyMs = performance.now() - started;
    const heapUsed = process.memoryUsage().heapUsed;
    return {
      heapUsedBytes: heapUsed,
      heapLimitBytes: this.maxHeapBytes,
      heapUtilization: heapUsed / this.maxHeapBytes,
      dbLatencyMs,
      activeJobs: this.active,
      maxConcurrent: this.maxConcurrent
    };
  }
  state(queue) {
    return this.states.get(queue) || { status: 'closed', pressureEvents: 0, openedAt: 0 };
  }
  _isCritical(queue) { return queue === 'billing' || queue === 'incident'; }
  _baseDecision(db, queue) {
    const m = this.metrics(db);
    const pressured = m.heapUsedBytes >= this.maxHeapBytes || m.dbLatencyMs >= this.maxDbLatencyMs || m.activeJobs >= this.maxConcurrent;
    const critical = this._isCritical(queue);
    return {
      metrics: m,
      pressured,
      critical,
      allow: !pressured || critical,
      action: pressured && !critical ? 'defer_noncritical' : 'process',
      reason: !pressured ? 'healthy' : critical ? 'critical_queue_bypass' : m.heapUsedBytes >= this.maxHeapBytes ? 'heap_limit' : m.dbLatencyMs >= this.maxDbLatencyMs ? 'db_latency' : 'concurrency'
    };
  }
  decision(db, queue) {
    const d = this._baseDecision(db, queue);
    return {allow:d.allow, action:d.action, reason:d.reason, metrics:d.metrics};
  }
  admit(db, queue, organizationId) {
    const base = this._baseDecision(db, queue);
    const m = base.metrics;
    if (base.critical) {
      this._record(db, organizationId, queue, 'critical_bypass', base.reason, m);
      return { allow:true, action:'process', reason:base.reason, metrics:m };
    }
    let s = this.state(queue);
    if (s.status === 'open') {
      if (Date.now() - s.openedAt < this.cooldownMs) {
        this._record(db, organizationId, queue, 'defer', 'worker_circuit_open', m);
        return { allow:false, action:'defer_all', reason:'worker_circuit_open', metrics:m };
      }
      s = {...s, status:'half-open'};
      this.states.set(queue, s);
    }
    if (!base.pressured) {
      this.states.set(queue, {status:'closed', pressureEvents:0, openedAt:0});
      return {allow:true, action:'process', reason:'healthy', metrics:m};
    }
    s.pressureEvents += 1;
    if (s.pressureEvents >= this.pressureThreshold) {
      s.status='open'; s.openedAt=Date.now(); this.states.set(queue,s);
      this._record(db, organizationId, queue, 'trip', 'resource_pressure', m);
      return {allow:false, action:'defer_all', reason:'worker_circuit_tripped', metrics:m};
    }
    this.states.set(queue,s);
    this._record(db, organizationId, queue, 'pressure', 'resource_pressure', m);
    return {allow:false, action:'defer_all', reason:'resource_pressure', metrics:m};
  }
  _record(db, organizationId, queue, action, reason, metrics) {
    try {
      if (organizationId) {
        db.prepare('INSERT INTO worker_guard_events(id,organization_id,queue_name,action,reason,metrics_json,created_at) VALUES(?,?,?,?,?,?,?)')
          .run(id('wg'), organizationId, queue, action, reason, JSON.stringify(metrics), now());
      } else {
        db.prepare('INSERT INTO worker_guard_system_events(id,queue_name,action,reason,metrics_json,created_at) VALUES(?,?,?,?,?,?)')
          .run(id('wgs'), queue, action, reason, JSON.stringify(metrics), now());
      }
    } catch (persistError) {
      warn('worker_guard_event_persist_failed', { organizationId, queue, action, reason, error: persistError });
    }
  }
}
module.exports = { WorkerResourceGuard };
