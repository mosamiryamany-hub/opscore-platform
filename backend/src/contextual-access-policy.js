'use strict';

/**
 * Pure policy evaluator used by API/worker tests and as the reference
 * contract for database RLS. It never replaces database enforcement.
 */
function withinWindow(now, startsAt, endsAt) {
  const t = Date.parse(now), s = Date.parse(startsAt), e = Date.parse(endsAt);
  return Number.isFinite(t) && Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e;
}
function haversineMeters(a, b) {
  const rad = Math.PI / 180, R = 6371000;
  const dLat = (b.lat-a.lat)*rad, dLon = (b.lon-a.lon)*rad;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(Math.min(1, Math.max(0,x))));
}
function evaluateContext({role, allowedRoles, actorPoint, taskPoint, radiusMeters=50,
  now, startsAt, endsAt, gpsMaxAgeSeconds=120, gpsCapturedAt}) {
  const roleOk = Array.isArray(allowedRoles) && allowedRoles.includes(role);
  const distance = actorPoint && taskPoint ? haversineMeters(actorPoint, taskPoint) : Infinity;
  const spatialOk = distance <= radiusMeters;
  const temporalOk = withinWindow(now, startsAt, endsAt);
  const gpsAgeOk = Number.isFinite(Date.parse(now)) && Number.isFinite(Date.parse(gpsCapturedAt))
    && (Date.parse(now)-Date.parse(gpsCapturedAt))/1000 <= gpsMaxAgeSeconds;
  return {allow: roleOk && spatialOk && temporalOk && gpsAgeOk, roleOk, spatialOk, temporalOk, gpsAgeOk, distanceMeters: distance};
}
/**
 * Domain-aware gate: membership role + optional domain scope list from governance policy.
 * Policy object is expected from Store.getDomainIsolationPolicy (operational_configs).
 */
function evaluateDomainContext({ role, policy, requiredScope = null, claimedFingerprint = null }) {
  const mode = policy && policy.mode ? policy.mode : 'organization';
  const enforced = Boolean(policy && policy.enforced);
  const allowedScopes = Array.isArray(policy && policy.allowedScopes) ? policy.allowedScopes : [];
  let scopeOk = true;
  if (enforced && requiredScope && allowedScopes.length) {
    scopeOk = allowedScopes.includes(requiredScope) || role === 'admin' || role === 'owner';
  }
  let fingerprintOk = true;
  if (enforced && policy && policy.fingerprint && claimedFingerprint) {
    const expected = typeof policy.fingerprint === 'string'
      ? policy.fingerprint
      : (policy.fingerprint.value || policy.fingerprint.hash || '');
    fingerprintOk = !expected || expected === claimedFingerprint;
  }
  return {
    allow: scopeOk && fingerprintOk,
    scopeOk,
    fingerprintOk,
    mode,
    enforced
  };
}

module.exports = { evaluateContext, evaluateDomainContext, haversineMeters, withinWindow };

