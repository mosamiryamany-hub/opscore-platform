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

const PRODUCTION_DATABASE_IDENTITY_PATH = '/api/internal/production-database-identity';
const CANDIDATE_DEPLOYMENT_HOST = /^opscore-platform-[a-z0-9-]+-mosamiryamany-1692\\.vercel\\.app$/;

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

function isCandidateRequestOnExactDeployment(req, env = process.env, readiness = {}) {
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
  return CANDIDATE_DEPLOYMENT_HOST.test(deploymentHost)
    && requestHost === deploymentHost
    && trustedOidcToken.split('.').length === 3
    && trustedOidcToken.split('.').every(part => part.length > 0);
}

function isAuthorizedProductionCandidateProbeRequest(req, env = process.env, readiness = {}) {
  if (!isCandidateRequestOnExactDeployment(req, env, readiness)) return false;
  const method = String(req && req.method || '').trim().toUpperCase();
  const pathname = requestPath(req);
  return ['read', 'write'].some(operation =>
    signedTenantContextPolicy.isSignedTenantContextRouteDefinition(method, pathname, operation)
  );
}

// The candidate collectors need one narrowly scoped read-only database identity
// inspection while the staged deployment is held. It is intentionally not part of
// the 67 business-route manifest and cannot be reached without both candidate-token
// authorization and a Vercel-trusted OIDC request to this exact unaliased deployment.
function isAuthorizedProductionCandidateDatabaseIdentityRequest(req, env = process.env, readiness = {}) {
  return String(req && req.method || '').trim().toUpperCase() === 'GET'
    && requestPath(req) === PRODUCTION_DATABASE_IDENTITY_PATH
    && isCandidateRequestOnExactDeployment(req, env, readiness);
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
  isAuthorizedProductionCandidateProbeRequest,
  isAuthorizedProductionCandidateDatabaseIdentityRequest
};
