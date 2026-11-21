'use strict';

const signedTenantContextPolicy = require('./signed-tenant-context-policy');
const { buildUnknownRoutePath } = require('./production-api-route-acceptance-policy');
const apiInventory = require('../docs/API_INVENTORY.json');

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
  // Evidence binary download is exercised by the candidate collector after upload
  // complete. It is intentionally outside the 67 signed-context inventory count;
  // allow only this exact GET under the same candidate boundary controls.
  if (method === 'GET' && /^\/api\/v1\/attachments\/[^/]+$/.test(pathname)) return true;
  // Session-isolation collector seeds two principals then authenticates via
  // mobile-login. Login is intentionally outside the 67 signed-context inventory;
  // allow only this exact POST under the same candidate boundary controls.
  if (method === 'POST' && pathname === '/api/v1/auth/mobile-login') return true;
  // The acceptance collector must prove an unknown API path returns the real
  // router 404 while the candidate remains held. Permit only the commit-bound
  // marker path, GET-only, under the same exact-deployment token + OIDC boundary.
  const candidateCommit = String(env.VERCEL_GIT_COMMIT_SHA || env.OPSC_RELEASE_CI_COMMIT || env.OPSC_SOURCE_COMMIT_SHA || '').trim().toLowerCase();
  if (method === 'GET' && /^[a-f0-9]{40}$/.test(candidateCommit)
      && pathname === buildUnknownRoutePath(candidateCommit)) return true;
  return ['read', 'write'].some(operation =>
    signedTenantContextPolicy.isSignedTenantContextRouteDefinition(method, pathname, operation)
  );
}

// The candidate collectors need one narrowly scoped read-only database identity
// inspection while the staged deployment is held. It is intentionally not part of
// the 67 business-route manifest and cannot be reached without both candidate-token
// authorization and a Vercel-trusted OIDC request to this exact unaliased deployment.
function isAuthorizedProductionCandidateUnknownRouteProbeRequest(req, env = process.env, readiness = {}) {
  const candidateCommit = String(env.VERCEL_GIT_COMMIT_SHA || env.OPSC_RELEASE_CI_COMMIT || env.OPSC_SOURCE_COMMIT_SHA || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(candidateCommit)
    && String(req && req.method || '').trim().toUpperCase() === 'GET'
    && requestPath(req) === buildUnknownRoutePath(candidateCommit)
    && isCandidateRequestOnExactDeployment(req, env, readiness);
}

// The 358-route acceptance collector must reach real handlers while the candidate
// stays held, so that each route answers with its own contract (200 for public JSON,
// 401/403 for auth-gated) instead of being short-circuited by the hold with 503.
// This is an exact-shape inventory bypass, not a hold release:
//   * method + path must match an API_INVENTORY row after the commit-bound marker
//     substitution the collector itself performs;
//   * all four candidate proofs (probe token, Vercel OIDC, exact unaliased
//     deployment host, held candidate) must still validate;
//   * authentication and tenant authorization are NOT bypassed - the request is
//     only forwarded to the router, which answers 401/403 as usual;
//   * the public alias keeps returning 503 because the host check fails there.
const ROUTE_ACCEPTANCE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ROUTE_ACCEPTANCE_EXTRA_PATHS = new Set(['/metrics']);
let routeAcceptanceIndexCache = { commit: '', index: null };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeAcceptancePathMatcher(routePattern, commit12) {
  const marker = 'opscore-probe-' + commit12 + '-\\d+';
  const source = String(routePattern || '');
  let pattern = '';
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith('{param}')) { pattern += 'work-orders'; i += 7; continue; }
    if (rest.startsWith('([A-Za-z0-9_-]+)')) { pattern += marker; i += 16; continue; }
    if (rest.startsWith('(\\d+)')) { pattern += '1'; i += 5; continue; }
    const placeholder = /^\{[^}]+\}/.exec(rest);
    if (placeholder) { pattern += marker; i += placeholder[0].length; continue; }
    pattern += escapeRegExp(source[i]);
    i += 1;
  }
  return new RegExp('^' + pattern + '$');
}

function routeAcceptanceProbeIndex(commit) {
  if (routeAcceptanceIndexCache.commit === commit && routeAcceptanceIndexCache.index) {
    return routeAcceptanceIndexCache.index;
  }
  const commit12 = commit.slice(0, 12);
  const index = new Map();
  for (const row of (apiInventory && apiInventory.routes) || []) {
    const method = String(row && row.method || '').trim().toUpperCase();
    const route = String(row && row.route || '').trim();
    if (!ROUTE_ACCEPTANCE_METHODS.has(method)) continue;
    if (!(route.startsWith('/api/') || ROUTE_ACCEPTANCE_EXTRA_PATHS.has(route))) continue;
    if (route.includes('?') || route.includes('#')) continue;
    if (!index.has(method)) index.set(method, []);
    index.get(method).push(routeAcceptancePathMatcher(route, commit12));
  }
  for (const method of ROUTE_ACCEPTANCE_EXTRA_PATHS) { /* literal path is added below */ }
  const getMatchers = index.get('GET') || [];
  for (const literal of ROUTE_ACCEPTANCE_EXTRA_PATHS) {
    getMatchers.push(new RegExp('^' + escapeRegExp(literal) + '$'));
  }
  index.set('GET', getMatchers);
  routeAcceptanceIndexCache = { commit, index };
  return index;
}

function isAuthorizedProductionCandidateRouteAcceptanceProbeRequest(req, env = process.env, readiness = {}) {
  const method = String(req && req.method || '').trim().toUpperCase();
  if (!ROUTE_ACCEPTANCE_METHODS.has(method)) return false;
  const commit = String(
    env.VERCEL_GIT_COMMIT_SHA || env.OPSC_RELEASE_CI_COMMIT || env.OPSC_SOURCE_COMMIT_SHA || ''
  ).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) return false;
  const pathname = requestPath(req);
  if (!(pathname.startsWith('/api/') || ROUTE_ACCEPTANCE_EXTRA_PATHS.has(pathname))) return false;
  if (!isCandidateRequestOnExactDeployment(req, env, readiness)) return false;
  const matchers = routeAcceptanceProbeIndex(commit).get(method) || [];
  return matchers.some(matcher => matcher.test(pathname));
}

function trustedOidcPresent(req) {
  const trustedOidcToken = String(
    (req && req.headers && (req.headers['x-opscore-trusted-oidc-idp-token']
      || req.headers['x-vercel-trusted-oidc-idp-token'])) || ''
  ).trim();
  if (!trustedOidcToken) return false;
  const oidcParts = trustedOidcToken.split('.');
  return oidcParts.length === 3 && oidcParts.every(part => /^[A-Za-z0-9_-]+$/.test(part));
}

function exactUnaliasedDeploymentHostMatched(req, env = process.env) {
  const deploymentUrl = String(env.VERCEL_URL || '').trim();
  // VERCEL_URL is a bare hostname, never a URL, path, or explicit port.
  if (!deploymentUrl || !/^[a-z0-9.-]+$/i.test(deploymentUrl)) return false;
  let deploymentHost = '';
  try {
    const parsed = new URL('https://' + deploymentUrl);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/'
        || parsed.search || parsed.hash) return false;
    deploymentHost = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!CANDIDATE_DEPLOYMENT_HOST.test(deploymentHost)) return false;
  const requestHost = String(req && req.headers && req.headers.host || '').trim().toLowerCase();
  return Boolean(requestHost) && requestHost === deploymentHost;
}

function isAuthorizedProductionCandidateDatabaseIdentityRequest(req, env = process.env, readiness = {}) {
  if (String(req && req.method || '').trim().toUpperCase() !== 'GET') return false;
  if (requestPath(req) !== PRODUCTION_DATABASE_IDENTITY_PATH) return false;

  // A) held-candidate collector path: preserve the existing probe + OIDC + exact-host boundary.
  if (isCandidateRequestOnExactDeployment(req, env, readiness)) return true;

  // B) post-publish staged diagnostic: release proof must already verify in-process;
  // require trusted Vercel OIDC and this exact unaliased deployment host.
  if (readiness && readiness.productionReleaseVerified === true
      && trustedOidcPresent(req)
      && exactUnaliasedDeploymentHostMatched(req, env)) {
    return true;
  }
  return false;
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
  isAuthorizedProductionCandidateUnknownRouteProbeRequest,
  isAuthorizedProductionCandidateRouteAcceptanceProbeRequest,
  isAuthorizedProductionCandidateDatabaseIdentityRequest
};
