const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {Store} = require('./store');
const { resolveMapTileOrigin } = require('./map-tile-security');
const config = require('./config');
const {assertRuntimeConfiguration} = require('./runtime-contract');
const {openDatabase} = require('./db-open');
const {runWithRequest} = require('./pg-database-sync');
const { createDeploymentProof } = require('./deployment-proof');
const { createPublicReleaseProof, readEmbeddedBuildIdentity } = require('./release-proof');
const { readDatabaseSecurityProof } = require('./database-security-proof');
const { isHttpBootstrapAllowed } = require('./bootstrap-policy');

// Commercial runtime: single engine. DATABASE_ENGINE=postgres → Store runs on Neon via sync helper.
const opened = openDatabase(config);
assertRuntimeConfiguration(config, {postgresRuntimeWired: opened.postgresRuntimeWired});
const db = opened.db;
const store = new Store(db, config);
store.pg = opened.engine === 'postgres' ? db : null;
store.databaseEngineResolved = opened.engine;
store.postgresRuntimeWired = opened.postgresRuntimeWired;
const {authProviderGate, verifyOidcIdToken} = require('./security');
const {inspectRequest,productionSafetyGate,createRateLimiter,createLoginRateLimiter,assertTenantAlignment}=require('./firewall');
const {can: rbacCan}=require('./rbac');
const {breaker}=require('./enterprise-value-additions');
breaker.setDb?.(db);
const firewallRateLimit=createRateLimiter(config,db);
// Production logins use shared database state; test/development harnesses preserve their configured limiter mode.
const loginRateLimit=createLoginRateLimiter(config,db);
const {verifySignature} = require('./stripe-billing');
const {aiStatus, openaiSummary} = require('./ai-copilot');
const {safeError} = require('./egress-guard');
const {verifyAuditChain} = require('./audit');
const {info, warn, prometheusMetrics, exportOtlp} = require('./observability');
const {status: postgresStatus} = require('./postgres-runtime');
const {runAgenticCopilot} = require('./agentic-copilot');
const {schedulingConflictAnalysis, candidateSlots, osrmRoute, createStripePaymentIntent} = require('./2026-intelligence');
const {status: intelligenceStatus, predictWorkOrder} = require('./2026-intelligence-core');
const {COMMANDS: SLASH_COMMANDS} = require('./general-control');
const contactCenter = require('./ai-contact-center');
// Anchored to the package, not the launch directory, so `node backend/src/server.js` works from any cwd.
const webRoot = path.resolve(__dirname, '..', 'web');
let lastOtelExport = 0;
function json(res, status, payload, headers = {}) {
  const securityHeaders = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(),microphone=(),geolocation=(self)',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  };
  if (config.nodeEnv === 'production') {
    securityHeaders['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...securityHeaders,
    ...headers
  });
  res.end(JSON.stringify(payload));
}
function mapTileOrigin() {
  const origin = resolveMapTileOrigin(process.env.OPSCORE_MAP_TILE_ORIGIN || '');
  return origin ? ' ' + origin : '';
}
function fail(res, err) {
  const map = {
    CONTROL_ACTION_INVALID: [
      422,
      'CONTROL_ACTION_INVALID'
    ],
    CONTROL_ACTION_FORBIDDEN: [
      403,
      'CONTROL_ACTION_FORBIDDEN'
    ],
    CONTROL_ACTION_TARGET_INVALID: [
      422,
      'CONTROL_ACTION_TARGET_INVALID'
    ],
    INVALID_CREDENTIALS: [
      401,
      'INVALID_CREDENTIALS'
    ],
    LOGIN_RATE_LIMITED: [
      429,
      'LOGIN_RATE_LIMITED'
    ],
    DEMO_RUNTIME_DISABLED: [404,'DEMO_RUNTIME_DISABLED'],
    SIMULATION_RUNTIME_DISABLED: [404,'SIMULATION_RUNTIME_DISABLED'],
    UNAUTHENTICATED: [
      401,
      'UNAUTHENTICATED'
    ],
    NO_ORGANIZATION: [
      403,
      'NO_ORGANIZATION'
    ],
    MULTIPLE_ORGANIZATIONS: [
      409,
      'MULTIPLE_ORGANIZATIONS'
    ],
    ORGANIZATION_ACCESS_FORBIDDEN: [
      403,
      'ORGANIZATION_ACCESS_FORBIDDEN'
    ],
    TENANT_MISMATCH: [