'use strict';

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isPreview(env = process.env) {
  return String(env.VERCEL_ENV || '') === 'preview';
}

function signedWorkOrdersReadEnabled(req, env = process.env) {
  const pathname = String(req && req.url || '').split('?')[0];
  const supportedReadPath = pathname === '/api/v1/work-orders'
    || /^\/api\/v1\/work-orders\/[^/]+$/.test(pathname)
    || /^\/api\/v1\/work-orders\/[^/]+\/(?:completion-package|timeline|handoff|operational-risk|comments|attachments|dispatch-candidates|parts|signoffs|why-blocked|changelog|verified-job-record|work-pack|completion-assurance|time-summary|first-time-right)$/.test(pathname);
  return isPreview(env)
    && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED)
    && String(req && req.method || '').toUpperCase() === 'GET'
    && supportedReadPath;
}

function signedWorkOrdersWriteEnabled(req, env = process.env) {
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
  return isPreview(env)
    && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED)
    && supportedWritePath;
}

function signedWorkOrdersContextEnabled(req, env = process.env) {
  return signedWorkOrdersReadEnabled(req, env) || signedWorkOrdersWriteEnabled(req, env);
}

function signedSessionAutobindEnabled(env = process.env) {
  return isPreview(env) && enabled(env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED);
}

function signedTenantContextRequired(env = process.env) {
  return enabled(env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT);
}

function signedContextRequested(req, env = process.env) {
  return signedSessionAutobindEnabled(env) || signedWorkOrdersContextEnabled(req, env);
}

// The worker rejects unsigned field-mode setSession calls when the hard cutover
// flag is enabled. Detect unsupported routes before trying that legacy bind so
// the HTTP layer can fail closed with an explicit route/configuration error.
function signedTenantContextRouteError(req, env = process.env) {
  return signedTenantContextRequired(env) && !signedContextRequested(req, env)
    ? 'SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED'
    : null;
}

module.exports = {
  isPreview,
  signedWorkOrdersReadEnabled,
  signedWorkOrdersWriteEnabled,
  signedWorkOrdersContextEnabled,
  signedSessionAutobindEnabled,
  signedTenantContextRequired,
  signedContextRequested,
  signedTenantContextRouteError
};
