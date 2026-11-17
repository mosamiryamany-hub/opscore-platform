'use strict';

const READ_ONLY_PRODUCTION_VERIFICATION_PATHS = new Set([
  '/api/verify/deployment',
  '/api/verify/release',
  '/verify/release.json',
  '/api/verify/database',
  '/api/verify/database-security'
]);

function requestPath(req) {
  try {
    const host = String(req && req.headers && req.headers.host || 'localhost');
    return new URL(String(req && req.url || '/'), 'https://' + host).pathname;
  } catch {
    return '';
  }
}

function isReadOnlyProductionVerificationRequest(req) {
  return String(req && req.method || '').toUpperCase() === 'GET'
    && READ_ONLY_PRODUCTION_VERIFICATION_PATHS.has(requestPath(req));
}

function evaluateProductionGate(config, env, productionSafetyGate) {
  try {
    const decision = productionSafetyGate(config, env);
    return { blocked: false, mode: decision && decision.mode || 'unknown', reasonCode: null };
  } catch (error) {
    const reasonCode = String(error && (error.code || error.message) || '');
    if (['PRODUCTION_HOLD_ACTIVE', 'PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED'].includes(reasonCode)) {
      return { blocked: true, mode: 'maintenance', reasonCode };
    }
    throw error;
  }
}

module.exports = {
  evaluateProductionGate,
  isReadOnlyProductionVerificationRequest
};
