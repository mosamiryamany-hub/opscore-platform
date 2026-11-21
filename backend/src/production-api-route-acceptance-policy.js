'use strict';

const crypto = require('node:crypto');

const EXPECTED_ROUTE_COUNT = 358;
const MAX_EVIDENCE_AGE_MS = 6 * 60 * 60 * 1000;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const REQUIRED_DENIAL_CODES = new Set([
  'UNAUTHENTICATED',
  'TENANT_CONTEXT_REQUIRED',
  'NO_ORGANIZATION',
  'ORGANIZATION_ACCESS_FORBIDDEN',
  'TENANT_MISMATCH',
  'ROLE_WRITE_FORBIDDEN',
  'FORBIDDEN',
  'API_KEY_SCOPE_FORBIDDEN',
  'SIGNED_SESSION_PRINCIPAL_REQUIRED',
  'SIGNED_TENANT_SESSION_REQUIRED',
  'SESSION_AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS'
]);

const SSO_PROTECTED_PUBLIC_ROUTES = new Set([
  '/api/verify/database',
  '/api/verify/database-security',
  '/api/verify/deployment'
]);

const SAFE_SCOPED_ROUTE_PROBES = Object.freeze({
  'POST /api/v1/auth/bootstrap': Object.freeze({
    id: 'production-bootstrap-disabled',
    body: null,
    statusCodes: [404],
    responseCodes: ['BOOTSTRAP_CLI_REQUIRED'],
    bodyAssertion: null
  }),
  'POST /api/v1/auth/invitations/accept': Object.freeze({
    id: 'invitation-accept-without-token',
    body: {},
    statusCodes: [400, 401, 422],
    responseCodes: ['INVITATION_INVALID'],
    bodyAssertion: null
  }),
  'POST /api/v1/auth/logout': Object.freeze({
    id: 'logout-without-session-noop',
    body: null,
    statusCodes: [200],
    responseCodes: [],
    bodyAssertion: 'loggedOut'
  }),
  'POST /api/v1/auth/oidc/exchange': Object.freeze({
    id: 'oidc-exchange-without-nonce',
    body: {},
    statusCodes: [400],
    responseCodes: ['AUTH_MODE_OIDC_REQUIRED', 'OIDC_NONCE_REQUIRED'],
    bodyAssertion: null
  }),
  'POST /api/v1/auth/password-reset': Object.freeze({
    id: 'password-reset-without-token',
    body: {},
    statusCodes: [400, 401, 422],
    responseCodes: ['RESET_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'POST /api/v1/portal/access': Object.freeze({
    id: 'portal-access-requires-authenticated-context',
    body: null,
    statusCodes: [401, 403],
    responseCodes: ['UNAUTHENTICATED', 'FORBIDDEN', 'TENANT_CONTEXT_REQUIRED'],
    bodyAssertion: null
  }),
  // Portal appointment reads are 'public/scoped': the token is carried in the request,
  // so an anonymous probe is denied by the session guard (UNAUTHENTICATED) before the
  // portal-token decoder (PORTAL_TOKEN_INVALID) is reached. Both are authentication
  // boundary denials for THIS route only; no other scoped route inherits UNAUTHENTICATED.
  'GET /api/v1/portal/appointments/{id}': Object.freeze({
    id: 'portal-appointment-read-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID', 'UNAUTHENTICATED'],
    bodyAssertion: null
  }),
  'PATCH /api/v1/portal/appointments/{id}': Object.freeze({
    id: 'portal-appointment-update-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'POST /api/v1/portal/exchange': Object.freeze({
    id: 'portal-exchange-without-token',
    body: {},
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'POST /api/v1/portal/self-scheduling/{id}/book': Object.freeze({
    id: 'self-scheduling-book-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID', 'SELF_SCHEDULE_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'GET /api/v1/portal/self-scheduling/{id}/candidates': Object.freeze({
    id: 'self-scheduling-candidates-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID', 'SELF_SCHEDULE_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'GET /api/v1/portal/overview': Object.freeze({
    id: 'portal-overview-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID'],
    bodyAssertion: null
  }),
  'GET /api/v1/portal/work-orders/{id}': Object.freeze({
    id: 'portal-work-order-read-without-token',
    body: null,
    statusCodes: [401],
    responseCodes: ['PORTAL_TOKEN_INVALID'],
    bodyAssertion: null
  })
});

const SPECIAL_REQUIRED_ROUTE_PROBES = Object.freeze({
  'GET /metrics': Object.freeze({
    id: 'metrics-auth-or-explicitly-disabled',
    body: null,
    statusCodes: [401, 404],
    responseCodes: ['UNAUTHENTICATED', 'METRICS_NOT_CONFIGURED'],
    bodyAssertion: null
  }),
  'POST /api/v1/billing/stripe/webhook': Object.freeze({
    id: 'stripe-webhook-rejects-missing-signature',
    body: null,
    statusCodes: [400],
    responseCodes: ['STRIPE_SIGNATURE_INVALID'],
    bodyAssertion: null
  })
});

const BUSINESS_FLOW_INVENTORY = Object.freeze([
  Object.freeze({
    id: 'same-tenant-customer-lifecycle',
    routeKeys: Object.freeze([
      'GET /api/v1/customers',
      'POST /api/v1/customers',
      'PATCH /api/v1/customers/{id}'
    ])
  }),
  Object.freeze({
    id: 'same-tenant-work-order-lifecycle',
    routeKeys: Object.freeze([
      'GET /api/v1/work-orders',
      'POST /api/v1/work-orders',
      'PATCH /api/v1/work-orders/{id}'
    ])
  }),
  Object.freeze({
    id: 'same-tenant-asset-event-lifecycle',
    routeKeys: Object.freeze([
      'GET /api/v1/assets',
      'POST /api/v1/assets',
      'PATCH /api/v1/assets/{id}',
      'POST /api/v1/assets/{id}/events'
    ])
  })
]);

function routeKey(method, route) {
  return String(method || '').trim().toUpperCase() + ' ' + String(route || '').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function businessFlowInventorySha256() {
  return sha256(JSON.stringify(BUSINESS_FLOW_INVENTORY));
}

function buildUnknownRoutePath(commitSha) {
  const suffix = String(commitSha || '').toLowerCase().slice(0, 12);
  if (!/^[a-f0-9]{12}$/.test(suffix)) throw new Error('API_ROUTE_ACCEPTANCE_COMMIT_INVALID');
  return '/api/v1/__opscore_acceptance_unknown_' + suffix;
}

function materializeRoutePath(routePattern, commitSha, index) {
  const suffix = String(commitSha || '').toLowerCase().slice(0, 12);
  if (!/^[a-f0-9]{12}$/.test(suffix) || !Number.isSafeInteger(index) || index < 0) {
    throw new Error('API_ROUTE_ACCEPTANCE_PATH_IDENTITY_INVALID');
  }
  const marker = 'opscore-probe-' + suffix + '-' + String(index + 1);
  let pathname = String(routePattern || '');
  if (!(pathname.startsWith('/api/') || pathname === '/metrics') || pathname.includes('?') || pathname.includes('#')) {
    throw new Error('API_ROUTE_ACCEPTANCE_PATH_NOT_ALLOWED');
  }
  pathname = pathname
    .replace(/\(\[A-Za-z0-9_-\]\+\)/g, marker)
    .replace(/\(\\d\+\)/g, '1')
    .replace(/\{param\}/g, 'work-orders')
    .replace(/\{[^}]+\}/g, marker);
  if (/[()[\]{}\\]/.test(pathname)) {
    throw new Error('API_ROUTE_ACCEPTANCE_UNSUPPORTED_ROUTE_PATTERN:' + routePattern);
  }
  return pathname;
}

function probeContractForRoute(route) {
  const key = routeKey(route && route.method, route && route.route);
  const auth = String(route && route.auth || '');
  if (!route || !ALLOWED_METHODS.has(String(route.method || '').toUpperCase())) {
    throw new Error('API_ROUTE_ACCEPTANCE_METHOD_INVALID:' + key);
  }
  if (auth === 'public') {
    if (String(route.method).toUpperCase() !== 'GET') {
      throw new Error('API_ROUTE_ACCEPTANCE_PUBLIC_WRITE_NOT_ALLOWED:' + key);
    }
    return Object.freeze({ id: 'public-json-read', body: null, kind: 'public' });
  }
  if (auth === 'public/scoped') {
    const contract = SAFE_SCOPED_ROUTE_PROBES[key];
    if (!contract) throw new Error('API_ROUTE_ACCEPTANCE_SCOPED_ROUTE_NOT_CLASSIFIED:' + key);
    return Object.freeze({ ...contract, kind: 'scoped' });
  }
  if (auth === 'required') {
    const special = SPECIAL_REQUIRED_ROUTE_PROBES[key];
    return special
      ? Object.freeze({ ...special, kind: 'special-required' })
      : Object.freeze({
          id: 'anonymous-auth-boundary',
          body: null,
          kind: 'required',
          statusCodes: [401, 403],
          responseCodes: Array.from(REQUIRED_DENIAL_CODES),
          bodyAssertion: null
        });
  }
  throw new Error('API_ROUTE_ACCEPTANCE_AUTH_CLASS_INVALID:' + key);
}

function buildRouteProbePlan(inventory) {
  const routes = Array.isArray(inventory && inventory.routes) ? inventory.routes : [];
  const declared = Number(inventory && inventory.routeCount);
  if (declared !== EXPECTED_ROUTE_COUNT || routes.length !== EXPECTED_ROUTE_COUNT) {
    throw new Error('API_ROUTE_ACCEPTANCE_INVENTORY_COUNT_MISMATCH:' + declared + '/' + routes.length);
  }
  const seen = new Set();
  const plan = routes.map((route, index) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw new Error('API_ROUTE_ACCEPTANCE_INVENTORY_ENTRY_INVALID:' + index);
    }
    const key = routeKey(route.method, route.route);
    if (seen.has(key)) throw new Error('API_ROUTE_ACCEPTANCE_DUPLICATE_INVENTORY_ROUTE:' + key);
    seen.add(key);
    if (!(String(route.route || '').startsWith('/api/') || route.route === '/metrics')) {
      throw new Error('API_ROUTE_ACCEPTANCE_ROUTE_OUTSIDE_API:' + key);
    }
    const contract = probeContractForRoute(route);
    return {
      method: String(route.method).toUpperCase(),
      route: String(route.route),
      key,
      auth: String(route.auth),
      path: null,
      contract
    };
  });
  if (seen.size !== EXPECTED_ROUTE_COUNT || Object.keys(SAFE_SCOPED_ROUTE_PROBES).length !== 13) {
    throw new Error('API_ROUTE_ACCEPTANCE_INVENTORY_NOT_EXACT');
  }
  return plan;
}

function evaluateRouteObservation(route, observation, unknownRouteProbe) {
  const actual = observation || {};
  const statusCode = Number(actual.statusCode);
  const responseCode = actual.responseCode == null ? null : String(actual.responseCode);
  const contract = probeContractForRoute(route);
  const sameAsUnknown = unknownRouteProbe
    && statusCode === Number(unknownRouteProbe.statusCode)
    && responseCode !== null
    && responseCode === String(unknownRouteProbe.responseCode || '');
  if (sameAsUnknown) return { ok: false, reason: 'ROUTE_MATCHES_UNKNOWN_ROUTE_MARKER' };
  if (actual.probeContract !== contract.id) return { ok: false, reason: 'PROBE_CONTRACT_MISMATCH' };
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return { ok: false, reason: 'HTTP_STATUS_INVALID' };
  }
  if (statusCode === 429) return { ok: false, reason: 'HTTP_RATE_LIMITED' };
  if (statusCode >= 500) return { ok: false, reason: 'HTTP_SERVER_ERROR' };

  if (contract.kind === 'public') {
    const jsonType = String(actual.contentType || '').toLowerCase().includes('application/json');
    if (statusCode === 200 && jsonType) return { ok: true, reason: null };
    const routePath = String(route && route.route || '');
    if (SSO_PROTECTED_PUBLIC_ROUTES.has(routePath) && statusCode === 401) {
      return { ok: true, reason: null };
    }
    return { ok: false, reason: 'PUBLIC_JSON_ROUTE_NOT_AVAILABLE' };
  }

  if (contract.id === 'logout-without-session-noop') {
    return statusCode === 200 && actual.bodyAssertion === true
      ? { ok: true, reason: null }
      : { ok: false, reason: 'LOGOUT_WITHOUT_SESSION_NOT_CONFIRMED_NOOP' };
  }

  const expectedStatus = contract.statusCodes || [];
  const expectedCodes = contract.responseCodes || [];
  if (!expectedStatus.includes(statusCode)) return { ok: false, reason: 'HTTP_STATUS_OUTSIDE_SAFE_CONTRACT' };
  if (expectedCodes.length && !expectedCodes.includes(responseCode)) {
    const numericStatusCode = String(statusCode);
    if (!(expectedStatus.includes(statusCode) && responseCode === numericStatusCode)) {
      return { ok: false, reason: 'RESPONSE_CODE_OUTSIDE_SAFE_CONTRACT' };
    }
  }
  if (contract.bodyAssertion && actual.bodyAssertion !== true) {
    return { ok: false, reason: 'SAFE_PROBE_BODY_ASSERTION_FAILED' };
  }
  return { ok: true, reason: null };
}

function validateRouteEvidenceRows(evidence, inventory, inventoryBytes, now = new Date()) {
  const rows = Array.isArray(evidence && evidence.routes) ? evidence.routes : [];
  const expectedRoutes = Array.isArray(inventory && inventory.routes) ? inventory.routes : [];
  const expectedInventorySha = sha256(inventoryBytes);
  const actualInventorySha = String(evidence && evidence.inventorySha256 || '').toLowerCase();
  const unknown = evidence && evidence.unknownRouteProbe;
  const unknownOk = unknown
    && Number(unknown.statusCode) === 404
    && typeof unknown.responseCode === 'string'
    && unknown.responseCode.length > 0;
  if (!unknownOk || actualInventorySha !== expectedInventorySha
      || expectedRoutes.length !== EXPECTED_ROUTE_COUNT
      || Number(inventory.routeCount) !== EXPECTED_ROUTE_COUNT
      || rows.length !== EXPECTED_ROUTE_COUNT
      || Number(evidence.testedRoutes) !== EXPECTED_ROUTE_COUNT
      || Number(evidence.inventoryRouteCount) !== EXPECTED_ROUTE_COUNT
      || Number(evidence.passed) !== EXPECTED_ROUTE_COUNT
      || Number(evidence.failed) !== 0) {
    return { valid: false, reason: 'ROUTE_EVIDENCE_COUNTS_OR_INVENTORY_HASH_INVALID' };
  }

  const expectedByKey = new Map(expectedRoutes.map(route => [routeKey(route.method, route.route), route]));
  const seen = new Set();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const suffix = String(evidence.commitSha || '').toLowerCase().slice(0, 12);
  if (!/^[a-f0-9]{12}$/.test(suffix)) return { valid: false, reason: 'ROUTE_EVIDENCE_COMMIT_INVALID' };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { valid: false, reason: 'ROUTE_EVIDENCE_ROW_INVALID' };
    }
    const key = routeKey(row.method, row.route);
    const expected = expectedByKey.get(key);
    if (!expected || seen.has(key)) return { valid: false, reason: 'ROUTE_EVIDENCE_MISSING_OR_DUPLICATE_ROUTE' };
    if (row.auth !== expected.auth
        || row.path !== materializeRoutePath(expected.route, evidence.commitSha, index)
        || row.verdict !== 'PASS'
        || row.reason !== null) {
      return { valid: false, reason: 'ROUTE_EVIDENCE_ROW_BINDING_OR_VERDICT_INVALID:' + key };
    }
    const testedAtMs = Date.parse(String(row.testedAt || ''));
    if (!Number.isFinite(testedAtMs) || testedAtMs > nowMs || nowMs - testedAtMs > MAX_EVIDENCE_AGE_MS) {
      return { valid: false, reason: 'ROUTE_EVIDENCE_ROW_TIMESTAMP_STALE:' + key };
    }
    const verdict = evaluateRouteObservation(expected, row, unknown);
    if (!verdict.ok) return { valid: false, reason: verdict.reason + ':' + key };
    seen.add(key);
  }
  return seen.size === EXPECTED_ROUTE_COUNT
    ? { valid: true, reason: null, inventorySha256: expectedInventorySha }
    : { valid: false, reason: 'ROUTE_EVIDENCE_SET_INCOMPLETE' };
}

function validateBusinessFlowCoverage(coverage) {
  const value = coverage && typeof coverage === 'object' ? coverage : {};
  const rows = Array.isArray(value.flows) ? value.flows : [];
  const expectedHash = businessFlowInventorySha256();
  if (value.status !== 'PASS'
      || value.businessFlowInventorySha256 !== expectedHash
      || Number(value.testedFlows) !== BUSINESS_FLOW_INVENTORY.length
      || Number(value.inventoryFlowCount) !== BUSINESS_FLOW_INVENTORY.length
      || Number(value.passed) !== BUSINESS_FLOW_INVENTORY.length
      || Number(value.failed) !== 0
      || rows.length !== BUSINESS_FLOW_INVENTORY.length) {
    return { valid: false, reason: 'BUSINESS_FLOW_COVERAGE_COUNTS_OR_HASH_INVALID' };
  }
  const byId = new Map(rows.map(row => [String(row && row.id || ''), row]));
  if (byId.size !== BUSINESS_FLOW_INVENTORY.length) {
    return { valid: false, reason: 'BUSINESS_FLOW_DUPLICATE_OR_MISSING' };
  }
  for (const expected of BUSINESS_FLOW_INVENTORY) {
    const row = byId.get(expected.id);
    const routeKeys = Array.isArray(row && row.routeKeys) ? row.routeKeys : [];
    if (!row || row.status !== 'PASS'
        || JSON.stringify(routeKeys) !== JSON.stringify(expected.routeKeys)
        || row.tenantAStatus !== 'PASS'
        || row.tenantBStatus !== 'PASS'
        || row.crossTenantDenialStatus !== 'PASS'
        || row.cleanupStatus !== 'PASS'
        || !row.signedRouteEvidenceSha256
        || !/^[a-f0-9]{64}$/.test(String(row.signedRouteEvidenceSha256))
        || !row.candidateFixtureEvidenceSha256
        || !/^[a-f0-9]{64}$/.test(String(row.candidateFixtureEvidenceSha256))) {
      return { valid: false, reason: 'BUSINESS_FLOW_ROW_INVALID:' + expected.id };
    }
    if (expected.id === 'same-tenant-asset-event-lifecycle'
        && (!row.sessionIsolationEvidenceSha256
          || !/^[a-f0-9]{64}$/.test(String(row.sessionIsolationEvidenceSha256)))) {
      return { valid: false, reason: 'ASSET_FLOW_SESSION_EVIDENCE_MISSING' };
    }
  }
  return { valid: true, reason: null, inventorySha256: expectedHash };
}

function validateProductionApiRouteAcceptanceEvidence(evidence, inventory, inventoryBytes, now = new Date()) {
  const routes = validateRouteEvidenceRows(evidence, inventory, inventoryBytes, now);
  const flows = validateBusinessFlowCoverage(evidence && evidence.businessFlowCoverage);
  return {
    valid: routes.valid && flows.valid,
    routesValid: routes.valid,
    flowsValid: flows.valid,
    reason: routes.valid ? flows.reason : routes.reason,
    inventorySha256: routes.inventorySha256 || null,
    businessFlowInventorySha256: flows.inventorySha256 || null
  };
}

module.exports = {
  EXPECTED_ROUTE_COUNT,
  MAX_EVIDENCE_AGE_MS,
  SAFE_SCOPED_ROUTE_PROBES,
  SPECIAL_REQUIRED_ROUTE_PROBES,
  BUSINESS_FLOW_INVENTORY,
  routeKey,
  sha256,
  businessFlowInventorySha256,
  buildUnknownRoutePath,
  materializeRoutePath,
  probeContractForRoute,
  buildRouteProbePlan,
  evaluateRouteObservation,
  validateRouteEvidenceRows,
  validateBusinessFlowCoverage,
  validateProductionApiRouteAcceptanceEvidence
};
