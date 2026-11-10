'use strict';

/**
 * Sector-aware circuit breaker.
 * Keys: organization + sector/operation (faults, line_migration, billing, sync, default).
 * Half-open probes after cooldown; deferred queue callback for open circuits.
 */
class GatewayCircuitBreaker {
  constructor(opts = {}) {
    this.failureThreshold = Math.max(1, Number(opts.failureThreshold || 3));
    this.cooldownMs = Math.max(1000, Number(opts.cooldownMs || 30000));
    this.successThreshold = Math.max(1, Number(opts.successThreshold || 2));
    this.states = new Map();
    this.db = opts.db || null;
    this.onDeferred = typeof opts.onDeferred === 'function' ? opts.onDeferred : null;
    this.halfOpenSuccesses = new Map();
  }
  setDb(db) { this.db = db || null; return this; }
  setDeferredHandler(fn) { this.onDeferred = typeof fn === 'function' ? fn : null; return this; }
  _key(org, name) { return `${org || '__global__'}:${name}`; }
  _load(name, org) {
    const key = this._key(org, name);
    if (!this.db) return this.states.get(key) || { status: 'closed', failures: 0, openedAt: 0 };
    const r = this.db.prepare(
      'SELECT status,failures,opened_at FROM gateway_circuit_states WHERE organization_id=? AND gateway_name=?'
    ).get(org || '__global__', name);
    const s = r
      ? { status: r.status, failures: Number(r.failures), openedAt: Number(r.opened_at || 0) }
      : { status: 'closed', failures: 0, openedAt: 0 };
    this.states.set(key, s);
    return s;
  }
  _save(name, s, org) {
    const key = this._key(org, name);
    this.states.set(key, s);
    if (this.db) {
      this.db.prepare(
        `INSERT INTO gateway_circuit_states(organization_id,gateway_name,status,failures,opened_at,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(organization_id,gateway_name) DO UPDATE SET
           status=excluded.status,failures=excluded.failures,opened_at=excluded.opened_at,updated_at=excluded.updated_at`
      ).run(org || '__global__', name, s.status, s.failures, s.openedAt, new Date().toISOString());
    }
  }
  /** Canonical sector names for multi-domain isolation of failure blast radius. */
  static sectors() {
    return ['faults', 'line_migration', 'appointments', 'billing', 'sync', 'maps', 'default'];
  }
  sectorKey(sector, operation) {
    const s = String(sector || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const op = operation ? String(operation).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) : '';
    return op ? `sector:${s}:${op}` : `sector:${s}`;
  }
  state(name, org) { return this._load(name, org); }
  allow(name, org) {
    const s = this.state(name, org);
    if (s.status === 'open' && Date.now() - s.openedAt < this.cooldownMs) return false;
    if (s.status === 'open') {
      s.status = 'half-open';
      this._save(name, s, org);
      this.halfOpenSuccesses.set(this._key(org, name), 0);
    }
    return true;
  }
  success(name, org) {
    const s = this.state(name, org);
    const key = this._key(org, name);
    if (s.status === 'half-open') {
      const n = (this.halfOpenSuccesses.get(key) || 0) + 1;
      this.halfOpenSuccesses.set(key, n);
      if (n < this.successThreshold) {
        this._save(name, { status: 'half-open', failures: 0, openedAt: s.openedAt }, org);
        return s;
      }
    }
    this.halfOpenSuccesses.delete(key);
    this._save(name, { status: 'closed', failures: 0, openedAt: 0 }, org);
    return s;
  }
  failure(name, org) {
    const s = this.state(name, org);
    s.failures++;
    if (s.status === 'half-open' || s.failures >= this.failureThreshold) {
      s.status = 'open';
      s.openedAt = Date.now();
    }
    this._save(name, s, org);
    this.halfOpenSuccesses.delete(this._key(org, name));
    return s;
  }
  snapshot(org) {
    if (this.db) {
      const rows = this.db.prepare(
        'SELECT gateway_name,status,failures,opened_at FROM gateway_circuit_states WHERE organization_id=? ORDER BY gateway_name'
      ).all(org || '__global__');
      return Object.fromEntries(
        rows.map(r => [r.gateway_name, { status: r.status, failures: Number(r.failures), openedAt: Number(r.opened_at || 0) }])
      );
    }
    // In-memory mode: keys are `${org}:${gateway}`; only the requested tenant's entries may be returned.
    const prefix = `${org || '__global__'}:`;
    return Object.fromEntries(
      [...this.states.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k.slice(prefix.length), { ...v }])
    );
  }
  async execute(name, fn, org) {
    if (!this.allow(name, org)) {
      const err = new Error('GATEWAY_CIRCUIT_OPEN');
      err.code = 'GATEWAY_CIRCUIT_OPEN';
      err.gateway = name;
      err.organizationId = org || null;
      if (this.onDeferred) {
        try {
          await this.onDeferred({ gateway: name, organizationId: org, reason: 'circuit_open' });
        } catch (deferredErr) {
          // Deferral is best-effort: the caller still receives GATEWAY_CIRCUIT_OPEN below.
          // Record the failure so a broken deferred queue is observable instead of silent.
          this.deferredHandlerErrors = (this.deferredHandlerErrors || 0) + 1;
          this.lastDeferredHandlerError = String(deferredErr && deferredErr.message || deferredErr).slice(0, 256);
        }
      }
      throw err;
    }
    try {
      const out = await fn();
      this.success(name, org);
      return out;
    } catch (e) {
      this.failure(name, org);
      throw e;
    }
  }
  /** Execute under a sector-scoped circuit (isolates blast radius across domains). */
  async executeSector(sector, fn, org, operation = null) {
    return this.execute(this.sectorKey(sector, operation), fn, org);
  }
}

module.exports = { GatewayCircuitBreaker };
