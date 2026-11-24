'use strict';

const crypto = require('node:crypto');

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isPreview(env = process.env) {
  return String(env.VERCEL_ENV || '') === 'preview';
}

// Production signed tenant context is deliberately a second, independent gate.
// A Production environment switch is insufficient: the deployment's immutable
// release proof must already certify the exact 67-route Production evidence,
// and the global traffic hold must be explicitly open.
function candidateProbeDenialReason(req, env = process.env, readiness = {}, options = {}) {
  const allowConfiguredReleaseFlagsForIdentityRead = options.allowConfiguredReleaseFlagsForIdentityRead === true;
  if (String(env.VERCEL_ENV || '') !== 'production') return 'vercel_env';
  if (!enabled(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED)) return 'probe_disabled';
  if (String(env.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase() !== 'true') return 'hold_not_true';
  if (enabled(env.OPSC_RELEASE_VERIFIED) && !allowConfiguredReleaseFlagsForIdentityRead) return 'release_verified';
  if (enabled(env.OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED) && !allowConfiguredReleaseFlagsForIdentityRead) return 'production_signed_enabled';
  if (enabled(env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED)) return 'session_autobind_enabled';
  if (String(env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').trim().toLowerCase() !== 'true') return 'require_signed_missing';
  if (readiness.productionReleaseVerified === true) return 'readiness_release_verified';
  const expected = String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || '').trim();
  const supplied = String(req && req.headers && req.headers['x-opscore-signed-context-probe'] || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(expected)) return 'expected_token_invalid';
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return 'supplied_token_invalid';
  const expectedBytes = Buffer.from(expected, 'hex');
  const suppliedBytes = Buffer.from(supplied, 'hex');
  if (expectedBytes.length !== 32 || suppliedBytes.length !== expectedBytes.length) return 'token_length';
  if (!crypto.timingSafeEqual(expectedBytes, suppliedBytes)) return 'token_mismatch';
  return null;
}

function isCandidateProbeAuthorized(req, env = process.env, readiness = {}) {
  return candidateProbeDenialReason(req, env, readiness) === null;
}

function isSignedContextEnvironment(env = process.env, readiness = {}, req = null) {
  if (isPreview(env)) return true;
  if (isCandidateProbeAuthorized(req, env, readiness)) return true;
  return String(env.VERCEL_ENV || '') === 'production'
    && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED)
    && enabled(env.OPSC_RELEASE_VERIFIED)
    && String(env.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase() === 'false'
    && readiness.productionReleaseVerified === true;
}

const OPERATIONAL_SIGNED_READ_ROUTES = [
  ['GET', /^\/api\/v1\/customers$/],
  ['GET', /^\/api\/v1\/sites$/],
  ['GET', /^\/api\/v1\/appointments$/],
  ['GET', /^\/api\/v1\/appointments\/[^/]+$/],
  ['GET', /^\/api\/v1\/geofences$/],
  ['GET', /^\/api\/v1\/technicians$/],
  ['GET', /^\/api\/v1\/technicians\/availability$/],
  ['GET', /^\/api\/v1\/technicians\/skills$/],
  ['GET', /^\/api\/v1\/technicians\/[^/]+\/geofences$/],
  ['GET', /^\/api\/v1\/technicians\/trail$/],
  ['GET', /^\/api\/v1\/technicians\/trail\.geojson$/],
  ['GET', /^\/api\/v1\/geofences\/role-polygons$/],
  ['GET', /^\/api\/v1\/map\/viewport$/],
  ['GET', /^\/api\/v1\/customers\/[^/]+\/service-line$/],
  ['POST', /^\/api\/v1\/faults\/classify$/],
  ['POST', /^\/api\/v1\/geofences\/assert-access$/],
  ['POST', /^\/api\/v1\/geofences\/evaluate$/]
];

const OPERATIONAL_SIGNED_WRITE_ROUTES = [
  ['POST', /^\/api\/v1\/assets$/],
  ['PATCH', /^\/api\/v1\/assets\/[^/]+$/],
  ['POST', /^\/api\/v1\/assets\/[^/]+\/events$/],
  ['POST', /^\/api\/v1\/customers$/],
  ['PATCH', /^\/api\/v1\/customers\/[^/]+$/],
  ['POST', /^\/api\/v1\/customers\/[^/]+\/service-line$/],
  ['POST', /^\/api\/v1\/sites$/],
  ['PATCH', /^\/api\/v1\/sites\/[^/]+$/],
  ['POST', /^\/api\/v1\/faults$/],
  ['POST', /^\/api\/v1\/faults\/[^/]+\/transition$/],
  ['POST', /^\/api\/v1\/faults\/[^/]+\/unreachable$/],
  ['POST', /^\/api\/v1\/appointments$/],
  ['PATCH', /^\/api\/v1\/appointments\/[^/]+$/],
  ['POST', /^\/api\/v1\/appointments\/[^/]+\/on-my-way$/],
  ['POST', /^\/api\/v1\/appointments\/[^/]+\/reschedule$/],
  ['POST', /^\/api\/v1\/appointments\/[^/]+\/unreachable$/],
  ['POST', /^\/api\/v1\/geofences$/],
  ['POST', /^\/api\/v1\/geofences\/[^/]+\/technicians$/],
  ['POST', /^\/api\/v1\/geofences\/dynamic-events$/],
  ['POST', /^\/api\/v1\/technicians$/],
  ['POST', /^\/api\/v1\/technicians\/skills$/],
  ['POST', /^\/api\/v1\/technicians\/trail$/]
];

function routeAllowed(req, routes) {
  const method = String(req && req.method || '').toUpperCase();
  const pathname = String(req && req.url || '').split('?')[0];
  return routes.some(([expectedMethod, pattern]) => method === expectedMethod && pattern.test(pathname));
}


function candidateProbeRouteEnabled(req, env = process.env, readiness = {}, operation) {
  if (!isCandidateProbeAuthorized(req, env, readiness)) return false;
  const method = String(req && req.method || '').toUpperCase();
  const pathname = String(req && req.url || '').split('?')[0];
  return isSignedTenantContextRouteDefinition(method, pathname, operation);
}

function signedOperationalReadEnabled(req, env = process.env, readiness = {}) {
  return candidateProbeRouteEnabled(req, env, readiness, 'read')
    || (isSignedContextEnvironment(env, readiness, req)
      && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED)
      && routeAllowed(req, OPERATIONAL_SIGNED_READ_ROUTES));
}

function signedOperationalWriteEnabled(req, env = process.env, readiness = {}) {
  return candidateProbeRouteEnabled(req, env, readiness, 'write')
    || (isSignedContextEnvironment(env, readiness, req)
      && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_WRITE_ENABLED)
      && routeAllowed(req, OPERATIONAL_SIGNED_WRITE_ROUTES));
}

function signedWorkOrdersReadEnabled(req, env = process.env, readiness = {}) {
  const pathname = String(req && req.url || '').split('?')[0];
  const supportedReadPath = pathname === '/api/v1/work-orders'
    || /^\/api\/v1\/work-orders\/[^/]+$/.test(pathname)
    || /^\/api\/v1\/work-orders\/[^/]+\/(?:completion-package|timeline|handoff|operational-risk|comments|attachments|dispatch-candidates|parts|signoffs|why-blocked|changelog|verified-job-record|work-pack|completion-assurance|time-summary|first-time-right)$/.test(pathname);
  const workOrderRead = candidateProbeRouteEnabled(req, env, readiness, 'read')
    || (isSignedContextEnvironment(env, readiness, req)
      && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED)
      && String(req && req.method || '').toUpperCase() === 'GET'
      && supportedReadPath);
  return workOrderRead || signedOperationalReadEnabled(req, env, readiness);
}

function signedWorkOrdersWriteEnabled(req, env = process.env, readiness = {}) {
  const pathname = String(req && req.url || '').split('?')[0];
  const method = String(req && req.method || '').toUpperCase();
  const workOrderIdPath = /^\/api\/v1\/work-orders\/[^/]+$/;
  const supportedWritePath = (method === 'POST' && pathname === '/api/v1/work-orders')
    || (method === 'POST' && pathname === '/api/v1/work-orders/bulk')
    || (method === 'PATCH' && workOrderIdPath.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/comments$/.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/transition$/.test(pathname))
    || (method === 'DELETE' && workOrderIdPath.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/restore$/.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/evidence-uploads$/.test(pathname))
    || (method === 'PUT' && /^\/api\/v1\/evidence-uploads\/[^/]+\/chunks\/\d+$/.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/evidence-uploads\/[^/]+\/complete$/.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/attachments$/.test(pathname));
  const workOrderWrite = candidateProbeRouteEnabled(req, env, readiness, 'write')
    || (isSignedContextEnvironment(env, readiness, req)
      && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED)
      && supportedWritePath);
  return workOrderWrite || signedOperationalWriteEnabled(req, env, readiness);
}

function signedWorkOrdersContextEnabled(req, env = process.env, readiness = {}) {
  return signedWorkOrdersReadEnabled(req, env, readiness)
    || signedWorkOrdersWriteEnabled(req, env, readiness);
}

function signedAssetsReadEnabled(req, env = process.env, readiness = {}) {
  const pathname = String(req && req.url || '').split('?')[0];
  return (String(req && req.method || '').toUpperCase() === 'GET'
      && pathname === '/api/v1/assets'
      && candidateProbeRouteEnabled(req, env, readiness, 'read'))
    || (isSignedContextEnvironment(env, readiness, req)
      && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_ASSETS_READ_ENABLED)
      && String(req && req.method || '').toUpperCase() === 'GET'
      && pathname === '/api/v1/assets');
}

function signedSessionAutobindEnabled(env = process.env, readiness = {}) {
  return isSignedContextEnvironment(env, readiness)
    && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED);
}

function signedTenantContextRequired(env = process.env) {
  return enabled(env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT);
}

// Binary attachment download is intentionally a separate, single-route
// authorization exception. It is NOT part of the 67-route certification inventory,
// but it must still bind the authenticated session to signed PostgreSQL context.
// Candidate probes require the same per-request secret while Production is held;
// a real released Production runtime requires the full production signed-context gate.
function signedAttachmentDownloadContextEnabled(req, env = process.env, readiness = {}) {
  const method = String(req && req.method || '').toUpperCase();
  const pathname = String(req && req.url || '').split('?')[0];
  if (method !== 'GET' || !/^\/api\/v1\/attachments\/[^/]+$/.test(pathname)) return false;
  return isCandidateProbeAuthorized(req, env, readiness)
    || (String(env.VERCEL_ENV || '') === 'production' && isSignedContextEnvironment(env, readiness, req));
}

function signedContextRequested(req, env = process.env, readiness = {}) {
  return signedAttachmentDownloadContextEnabled(req, env, readiness)
    || signedSessionAutobindEnabled(env, readiness)
    || signedWorkOrdersContextEnabled(req, env, readiness)
    || signedAssetsReadEnabled(req, env, readiness);
}

// The worker rejects unsigned field-mode setSession calls when the hard cutover
// flag is enabled. Detect unsupported routes before trying that legacy bind so
// the HTTP layer can fail closed with an explicit route/configuration error.
function signedTenantContextRouteError(req, env = process.env, readiness = {}) {
  return signedTenantContextRequired(env) && !signedContextRequested(req, env, readiness)
    ? 'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
    : null;
}

function isSignedTenantContextRouteDefinition(method, route, operation) {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  const inventoryPath = String(route || '').trim();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)
      || !inventoryPath.startsWith('/api/')
      || inventoryPath.includes('?')) return false;

  // Convert API_INVENTORY's parameter templates into concrete representative
  // paths, then ask the same Preview policy functions used by the server.
  // This prevents a self-consistent but unsupported manifest from certifying
  // routes that never enter the signed transaction wrappers.
  const concretePath = inventoryPath
    .replace(/\{[^/]{1,64}\}/g, 'signed-route-id')
    .replace(/\(\\d\+\)/g, '0');
  if (concretePath.includes('{') || concretePath.includes('}')) return false;
  const req = { method: normalizedMethod, url: concretePath };
  const env = {
    VERCEL_ENV: 'preview',
    OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_ASSETS_READ_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_READ_ENABLED: 'true',
    OPSC_SIGNED_TENANT_CONTEXT_OPERATIONAL_WRITE_ENABLED: 'true'
  };

  if (operation === 'read') {
    return signedWorkOrdersReadEnabled(req, env) || signedAssetsReadEnabled(req, env);
  }
  if (operation === 'write') return signedWorkOrdersWriteEnabled(req, env);
  return false;
}

module.exports = {
  isPreview,
  isSignedContextEnvironment,
  signedWorkOrdersReadEnabled,
  signedWorkOrdersWriteEnabled,
  signedWorkOrdersContextEnabled,
  signedAssetsReadEnabled,
  signedSessionAutobindEnabled,
  signedTenantContextRequired,
  isCandidateProbeAuthorized,
  candidateProbeDenialReason,
  signedContextRequested,
  signedTenantContextRouteError,
  isSignedTenantContextRouteDefinition
};
