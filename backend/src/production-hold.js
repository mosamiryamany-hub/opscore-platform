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
const CANDIDATE_DEPLOYMENT_HOST = /^opscore-platform-[a-z0-9-]+-mosamiryamany-1692\.vercel\.app$/;

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

function candidateProbeBoundaryDenialReason(req, env = process.env, readiness = {}) {
  const suppliedProbe = String(req && req.headers && req.headers['x-opscore-signed-context-probe'] || '').trim();
  if (!suppliedProbe) return 'probe_header_missing';

  const policyReason = signedTenantContextPolicy.candidateProbeDenialReason(req, env, readiness);
  if (policyReason) return policyReason;

  const deploymentUrl = String(env.VERCEL_URL || '').trim();
  if (!deploymentUrl) return 'deployment_url_missing';
  let deploymentHost = '';
  try {
    const parsed = new URL('https://' + deploymentUrl);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return 'deployment_url_invalid';
    }
    deploymentHost = parsed.hostname.toLowerCase();
  } catch {
    return 'deployment_url_invalid';
  }
  if (!CANDIDATE_DEPLOYMENT_HOST.test(deploymentHost)) return 'deployment_host_not_allowed';

  const requestHost = String(req && req.headers && req.headers.host || '').trim().toLowerCase();
  if (!requestHost) return 'request_host_missing';
  if (requestHost !== deploymentHost) return 'request_host_mismatch';

  // Prefer application header: some platforms reserve/strip x-vercel-* on inbound client requests.
  const trustedOidcToken = String(
    (req && req.headers && (req.headers['x-opscore-trusted-oidc-idp-token'] || req.headers['x-vercel-trusted-oidc-idp-token'])) || ''
  ).trim();
  if (!trustedOidcToken) return 'trusted_oidc_header_missing';
  const oidcParts = trustedOidcToken.split('.');
  if (oidcParts.length !== 3 || oidcParts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return 'trusted_oidc_header_invalid';
  }
  return null;
}

function isCandidateRequestOnExactDeployment(req, env = process.env, readiness = {}) {
  return candidateProbeBoundaryDenialReason(req, env, readiness) === null;
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
  candidateProbeBoundaryDenialReason,
  isAuthorizedProductionCandidateProbeRequest,
  isAuthorizedProductionCandidateDatabaseIdentityRequest
};
