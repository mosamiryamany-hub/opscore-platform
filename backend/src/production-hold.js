'use strict';

const signedTenantContextPolicy = require('./signed-tenant-context-policy');

const READ_ONLY_PRODUCTION_VERIFICATION_PATHS = new Set([
  '/api/health',
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

function isAuthorizedProductionCandidateProbeRequest(req, env = process.env, readiness = {}) {
  if (!signedTenantContextPolicy.isCandidateProbeAuthorized(req, env, readiness)) return false;
  const deploymentUrl = String(env.VERCEL_URL || '').trim();
  let deploymentHost = '';
  try {
    const parsed = new URL('https://' + deploymentUrl);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    deploymentHost = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  const requestHost = String(req && req.headers && req.headers.host || '').trim().toLowerCase();
  const trustedOidcToken = String(req && req.headers && req.headers['x-vercel-trusted-oidc-idp-token'] || '').trim();
  if (!deploymentHost.endsWith('.vercel.app') || requestHost !== deploymentHost || !trustedOidcToken) return false;
  const method = String(req && req.method || '').trim().toUpperCase();
  const pathname = requestPath(req);
  return ['read', 'write'].some(operation =>
    signedTenantContextPolicy.isSignedTenantContextRouteDefinition(method, pathname, operation)
  );
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
  isReadOnlyProductionVerificationRequest,
  isAuthorizedProductionCandidateProbeRequest
};
