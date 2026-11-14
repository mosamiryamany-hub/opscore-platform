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
// Login throttling must be shared across independently scaled serverless instances.
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
      403,
      'TENANT_MISMATCH'
    ],
    TENANT_CONTEXT_REQUIRED: [
      401,
      'TENANT_CONTEXT_REQUIRED'
    ],
    ROLE_WRITE_FORBIDDEN: [
      403,
      'ROLE_WRITE_FORBIDDEN'
    ],
    ORGANIZATION_READ_ONLY: [
      423,
      'ORGANIZATION_READ_ONLY'
    ],
    FORBIDDEN: [
      403,
      'FORBIDDEN'
    ],
    NOT_FOUND: [
      404,
      'NOT_FOUND'
    ],
    BOOTSTRAP_FAILED: [400, 'BOOTSTRAP_FAILED'],
    BOOTSTRAP_NOT_PERSISTED: [500, 'BOOTSTRAP_NOT_PERSISTED'],
    ALREADY_BOOTSTRAPPED: [
      409,
      'ALREADY_BOOTSTRAPPED'
    ],
    PASSWORD_TOO_SHORT: [
      422,
      'PASSWORD_TOO_SHORT'
    ],
    PAYLOAD_TOO_LARGE: [
      413,
      'PAYLOAD_TOO_LARGE'
    ],
    INVALID_STATUS: [
      422,
      'INVALID_STATUS'
    ],
    INVALID_PRIORITY: [
      422,
      'INVALID_PRIORITY'
    ],
    TITLE_REQUIRED: [
      422,
      'TITLE_REQUIRED'
    ],
    INVALID_EMAIL: [
      422,
      'INVALID_EMAIL'
    ],
    INVALID_ROLE: [
      422,
      'INVALID_ROLE'
    ],
    INVITATION_INVALID: [
      422,
      'INVITATION_INVALID'
    ],
    WEBHOOK_HTTPS_REQUIRED: [
      422,
      'WEBHOOK_HTTPS_REQUIRED'
    ],
    WEBHOOK_URL_INVALID: [
      422,
      'WEBHOOK_URL_INVALID'
    ],
    WEBHOOK_TARGET_FORBIDDEN: [
      422,
      'WEBHOOK_TARGET_FORBIDDEN'
    ],
    WEBHOOK_SECRET_TOO_SHORT: [
      422,
      'WEBHOOK_SECRET_TOO_SHORT'
    ],
    ATTACHMENT_SIZE_INVALID: [
      422,
      'ATTACHMENT_SIZE_INVALID'
    ],
    CSV_TOO_LARGE: [
      413,
      'CSV_TOO_LARGE'
    ],
    INVALID_JSON: [
      422,
      'INVALID_JSON'
    ],
    DECISION_TYPE_INVALID: [422, 'DECISION_TYPE_INVALID'],
    DECISION_NOT_FOUND: [404, 'DECISION_NOT_FOUND'],
    SEARCH_QUERY_TOO_SHORT: [422, 'SEARCH_QUERY_TOO_SHORT'],
    FEATURE_FLAG_INVALID: [422, 'FEATURE_FLAG_INVALID'],
    RECOVERY_BUNDLE_INVALID: [422, 'RECOVERY_BUNDLE_INVALID'],
    RECOVERY_BUNDLE_TENANT_MISMATCH: [403, 'RECOVERY_BUNDLE_TENANT_MISMATCH'],
    INVALID_SCENARIO_DATE: [422, 'INVALID_SCENARIO_DATE'],
    SCENARIO_HORIZON_INVALID: [422, 'SCENARIO_HORIZON_INVALID'],
    SCENARIO_AVG_HOURS_INVALID: [422, 'SCENARIO_AVG_HOURS_INVALID'],
    SCENARIO_DAILY_HOURS_INVALID: [422, 'SCENARIO_DAILY_HOURS_INVALID'],
    SKILL_CERTIFICATION_INPUT_INVALID: [422, 'SKILL_CERTIFICATION_INPUT_INVALID'],
    SKILL_CERT_USER_NOT_IN_TENANT: [403, 'SKILL_CERT_USER_NOT_IN_TENANT'],
    CAPACITY_DAILY_HOURS_INVALID: [422, 'CAPACITY_DAILY_HOURS_INVALID'],
    SIMULATION_SCENARIO_INVALID: [422, 'SIMULATION_SCENARIO_INVALID'],
    GUARDRAIL_POLICY_INVALID: [422, 'GUARDRAIL_POLICY_INVALID'],
    GUARDRAIL_MAX_CHANGE_INVALID: [422, 'GUARDRAIL_MAX_CHANGE_INVALID'],
    AUTOPILOT_PROPOSAL_NOT_FOUND: [404, 'AUTOPILOT_PROPOSAL_NOT_FOUND'],
    AUTOPILOT_OUTCOME_REQUIRES_EXECUTED: [409, 'AUTOPILOT_OUTCOME_REQUIRES_EXECUTED'],
    AUTOPILOT_OUTCOME_INVALID: [422, 'AUTOPILOT_OUTCOME_INVALID'],
    AUTOPILOT_RECOVERY_TIME_INVALID: [422, 'AUTOPILOT_RECOVERY_TIME_INVALID'],
    SIMULATION_ACTOR_INVALID: [422, 'SIMULATION_ACTOR_INVALID'],

    SELF_SCHEDULE_TOKEN_INVALID: [401, 'SELF_SCHEDULE_TOKEN_INVALID'],
    SELF_SCHEDULE_SLOT_INVALID: [422, 'SELF_SCHEDULE_SLOT_INVALID'],
    INVALID_SELF_SCHEDULE_SLOT: [422, 'INVALID_SELF_SCHEDULE_SLOT'],
    TWIN_SNAPSHOT_NOT_FOUND: [404, 'TWIN_SNAPSHOT_NOT_FOUND'],
    GEOFENCE_NOT_FOUND: [404, 'GEOFENCE_NOT_FOUND'],
    GEOFENCE_TECHNICIAN_INVALID: [422, 'GEOFENCE_TECHNICIAN_INVALID'],
    METHOD_NOT_ALLOWED: [405, 'METHOD_NOT_ALLOWED'],
    URI_TOO_LONG: [
      414,
      'URI_TOO_LONG'
    ],
    INVALID_BOOTSTRAP: [
      422,
      'INVALID_BOOTSTRAP'
    ],
    RATE_LIMITED: [
      429,
      'RATE_LIMITED'
    ],
    INVALID_OPERATIONAL_JOB:[422,'INVALID_OPERATIONAL_JOB'], INVALID_OPERATIONAL_JOB_QUEUE:[422,'INVALID_OPERATIONAL_JOB_QUEUE'], OPERATIONAL_JOB_NOT_CLAIMED:[409,'OPERATIONAL_JOB_NOT_CLAIMED'], INVALID_SERVICE_LINE:[422,'INVALID_SERVICE_LINE'], SERVICE_LINE_CODE_EXISTS:[409,'SERVICE_LINE_CODE_EXISTS'], SERVICE_LINE_ASSIGNMENT_INVALID:[422,'SERVICE_LINE_ASSIGNMENT_INVALID'], MIGRATION_CUSTOMER_INVALID:[422,'MIGRATION_CUSTOMER_INVALID'], MIGRATION_TARGET_LINE_INVALID:[422,'MIGRATION_TARGET_LINE_INVALID'], MIGRATION_ALREADY_ON_TARGET:[409,'MIGRATION_ALREADY_ON_TARGET'], MIGRATION_ALREADY_ACTIVE:[409,'MIGRATION_ALREADY_ACTIVE'], MIGRATION_SOURCE_LINE_MISSING:[422,'MIGRATION_SOURCE_LINE_MISSING'], MIGRATION_NOT_READY:[409,'MIGRATION_NOT_READY'], MIGRATION_SOURCE_CHANGED:[409,'MIGRATION_SOURCE_CHANGED'], MIGRATION_PREFLIGHT_STALE:[409,'MIGRATION_PREFLIGHT_STALE'], MIGRATION_CUTOVER_FAILED:[409,'MIGRATION_CUTOVER_FAILED'], MIGRATION_POSTCHECK_FAILED:[409,'MIGRATION_POSTCHECK_FAILED'], MIGRATION_NOT_ROLLBACKABLE:[409,'MIGRATION_NOT_ROLLBACKABLE'], MIGRATION_TARGET_CHANGED:[409,'MIGRATION_TARGET_CHANGED'], RECONCILIATION_PROVIDER_INVALID:[422,'RECONCILIATION_PROVIDER_INVALID'],
    INVALID_API_KEY: [
      422,
      'INVALID_API_KEY'
    ],
    INVALID_ENTITY: [
      422,
      'INVALID_ENTITY'
    ],
    ALREADY_DELETED: [
      409,
      'ALREADY_DELETED'
    ],
    API_KEY_WILDCARD_FORBIDDEN: [
      403,
      'API_KEY_WILDCARD_FORBIDDEN'
    ],
    API_KEY_INVALID: [
      401,
      'API_KEY_INVALID'
    ],
    API_KEY_EXPIRED: [
      401,
      'API_KEY_EXPIRED'
    ],
    API_KEY_SCOPE_FORBIDDEN: [
      403,
      'API_KEY_SCOPE_FORBIDDEN'
    ],
    TENANT_MASTER_KEY_REQUIRED: [
      503,
      'TENANT_MASTER_KEY_REQUIRED'
    ],
    TENANT_MASTER_KEY_TOO_WEAK: [
      503,
      'TENANT_MASTER_KEY_TOO_WEAK'
    ],
    INVALID_ENTITLEMENTS: [
      422,
      'INVALID_ENTITLEMENTS'
    ],
    INVALID_USAGE: [
      422,
      'INVALID_USAGE'
    ],
    ENTITLEMENT_LIMIT_EXCEEDED: [
      409,
      'ENTITLEMENT_LIMIT_EXCEEDED'
    ],
    INVALID_CUSTOM_FIELD: [
      422,
      'INVALID_CUSTOM_FIELD'
    ],
    INVALID_SAVED_VIEW: [
      422,
      'INVALID_SAVED_VIEW'
    ],
    RESET_TOKEN_INVALID: [
      422,
      'RESET_TOKEN_INVALID'
    ],
    INVALID_TECHNICIAN: [
      422,
      'INVALID_TECHNICIAN'
    ],
    INVALID_SKILL: [
      422,
      'INVALID_SKILL'
    ],
    INVALID_APPOINTMENT: [
      422,
      'INVALID_APPOINTMENT'
    ],
    TECHNICIAN_CONFLICT: [
      409,
      'TECHNICIAN_CONFLICT'
    ],
    WORK_ORDER_ALREADY_SCHEDULED: [
      409,
      'WORK_ORDER_ALREADY_SCHEDULED'
    ],
    WORK_ORDER_NOT_SCHEDULABLE: [
      422,
      'WORK_ORDER_NOT_SCHEDULABLE'
    ],
    REVISIT_REASON_REQUIRED: [
      422,
      'REVISIT_REASON_REQUIRED'
    ],
    APPOINTMENT_TERMINAL_STATE: [
      409,
      'APPOINTMENT_TERMINAL_STATE'
    ],
    FAULT_TITLE_REQUIRED: [422, 'FAULT_TITLE_REQUIRED'],
    TRAIL_COORDINATE_INVALID: [422, 'TRAIL_COORDINATE_INVALID'],
    AUDIT_CHAIN_BROKEN: [500, 'AUDIT_CHAIN_BROKEN'],
    DOMAIN_MEMBERSHIP_FORBIDDEN: [403, 'DOMAIN_MEMBERSHIP_FORBIDDEN'],
    DOMAIN_SCOPE_FORBIDDEN: [403, 'DOMAIN_SCOPE_FORBIDDEN'],
    DOMAIN_FINGERPRINT_MISMATCH: [403, 'DOMAIN_FINGERPRINT_MISMATCH'],
    TENANT_QUERY_BUDGET_EXCEEDED: [429, 'TENANT_QUERY_BUDGET_EXCEEDED'],
    GATEWAY_CIRCUIT_OPEN: [503, 'GATEWAY_CIRCUIT_OPEN'],
    GEO_SCOPE_EMPTY: [403, 'GEO_SCOPE_EMPTY'],
    GEO_SCOPE_FORBIDDEN: [403, 'GEO_SCOPE_FORBIDDEN'],
    VIEWPORT_BBOX_INVALID: [422, 'VIEWPORT_BBOX_INVALID'],
    APPOINTMENT_CONCURRENT_UPDATE: [409, 'APPOINTMENT_CONCURRENT_UPDATE'],

    TRAIL_ACCURACY_INVALID: [422, 'TRAIL_ACCURACY_INVALID'],

    NOT_A_FAULT_TICKET: [422, 'NOT_A_FAULT_TICKET'],
    FAULT_TERMINAL_STATE: [409, 'FAULT_TERMINAL_STATE'],
    FAULT_CLOSE_REASON_REQUIRED: [422, 'FAULT_CLOSE_REASON_REQUIRED'],
    SYNC_BLOCK_INVALID: [422, 'SYNC_BLOCK_INVALID'],
    SYNC_PATH_UNAVAILABLE: [500, 'SYNC_PATH_UNAVAILABLE'],

    MIGRATION_BLOCKED_EN_ROUTE_APPOINTMENT: [
      409,
      'MIGRATION_BLOCKED_EN_ROUTE_APPOINTMENT'
    ],
    MIGRATION_TARGET_LINE_NOT_READY: [
      422,
      'MIGRATION_TARGET_LINE_NOT_READY'
    ],
    MIGRATION_ALREADY_COMPLETED: [
      409,
      'MIGRATION_ALREADY_COMPLETED'
    ],
    MIGRATION_TERMINAL_STATE: [
      409,
      'MIGRATION_TERMINAL_STATE'
    ],
    UNREACHABLE_REASON_REQUIRED: [
      422,
      'UNREACHABLE_REASON_REQUIRED'
    ],
    INVALID_DATE: [
      422,
      'INVALID_DATE'
    ],
    INVALID_PART: [
      422,
      'INVALID_PART'
    ],
    INVALID_QUANTITY: [
      422,
      'INVALID_QUANTITY'
    ],
    INSUFFICIENT_STOCK: [
      409,
      'INSUFFICIENT_STOCK'
    ],
    INVALID_PART_STATE: [
      422,
      'INVALID_PART_STATE'
    ],
    PORTAL_TOKEN_INVALID: [
      401,
      'PORTAL_TOKEN_INVALID'
    ],
    INVALID_SIGNOFF: [
      422,
      'INVALID_SIGNOFF'
    ],
    INVALID_SYNC_BATCH: [
      422,
      'INVALID_SYNC_BATCH'
    ],
    INVALID_SYNC_EVENT: [
      422,
      'INVALID_SYNC_EVENT'
    ],
    INVALID_APPOINTMENT_STATUS: [
      422,
      'INVALID_APPOINTMENT_STATUS'
    ],
    INVALID_GPS: [
      422,
      'INVALID_GPS'
    ],
    INVALID_GPS_ACCURACY: [
      422,
      'INVALID_GPS_ACCURACY'
    ],
    CHECKIN_SITE_LOCATION_REQUIRED: [
      422,
      'CHECKIN_SITE_LOCATION_REQUIRED'
    ],
    CHECKIN_OUTSIDE_SITE_RADIUS: [
      422,
      'CHECKIN_OUTSIDE_SITE_RADIUS'
    ],
    CHECKIN_NOT_ALLOWED: [
      409,
      'CHECKIN_NOT_ALLOWED'
    ],
    APPOINTMENT_STATE_FORBIDDEN: [
      409,
      'APPOINTMENT_STATE_FORBIDDEN'
    ],
    ATTACHMENT_INVALID_BASE64: [
      422,
      'ATTACHMENT_INVALID_BASE64'
    ],
    ATTACHMENT_SHA256_INVALID: [
      422,
      'ATTACHMENT_SHA256_INVALID'
    ],
    EVIDENCE_CHUNK_INVALID: [
      422,
      'EVIDENCE_CHUNK_INVALID'
    ],
    EVIDENCE_UPLOAD_CLOSED: [
      409,
      'EVIDENCE_UPLOAD_CLOSED'
    ],
    EVIDENCE_CHUNK_SIZE_INVALID: [
      422,
      'EVIDENCE_CHUNK_SIZE_INVALID'
    ],
    EVIDENCE_CHUNK_CONFLICT: [
      409,
      'EVIDENCE_CHUNK_CONFLICT'
    ],
    EVIDENCE_UPLOAD_INCOMPLETE: [
      409,
      'EVIDENCE_UPLOAD_INCOMPLETE'
    ],
    EVIDENCE_CHUNKS_GAPPED: [
      409,
      'EVIDENCE_CHUNKS_GAPPED'
    ],
    OUTBOX_NOT_CLAIMABLE: [
      409,
      'OUTBOX_NOT_CLAIMABLE'
    ],
    ATTACHMENT_TYPE_INVALID: [
      422,
      'ATTACHMENT_TYPE_INVALID'
    ],
    ATTACHMENT_SIGNATURE_MISMATCH: [
      422,
      'ATTACHMENT_SIGNATURE_MISMATCH'
    ],
    ATTACHMENT_MIME_MISMATCH: [
      422,
      'ATTACHMENT_MIME_MISMATCH'
    ],
    ATTACHMENT_CONTENT_INVALID: [
      422,
      'ATTACHMENT_CONTENT_INVALID'
    ],
    INVALID_DATE: [
      422,
      'INVALID_DATE'
    ],
    RESCHEDULE_REASON_REQUIRED: [
      422,
      'RESCHEDULE_REASON_REQUIRED'
    ],
    TIMEOUT: [
      504,
      'TIMEOUT'
    ],
    INVALID_IDEMPOTENCY_KEY: [422, 'INVALID_IDEMPOTENCY_KEY'],
    OSRM_NOT_CONFIGURED: [503, 'OSRM_NOT_CONFIGURED'],
    OSRM_TIMEOUT: [504, 'OSRM_TIMEOUT'],
    OSRM_HTTP_ERROR: [502, 'OSRM_HTTP_ERROR'],
    OSRM_ROUTE_FAILED: [422, 'OSRM_ROUTE_FAILED'],
    INVALID_OSRM_PROFILE: [422, 'INVALID_OSRM_PROFILE'],
    OSRM_BASE_URL_INVALID: [422,'OSRM_BASE_URL_INVALID'],
    OSRM_HOST_NOT_ALLOWLISTED: [403,'OSRM_HOST_NOT_ALLOWLISTED'],
    OSRM_HOST_UNRESOLVED: [502,'OSRM_HOST_UNRESOLVED'],
    OSRM_INVALID_JSON: [502,'OSRM_INVALID_JSON'],
    OSRM_RESPONSE_TOO_LARGE: [502,'OSRM_RESPONSE_TOO_LARGE'],
    FIREWALL_METHOD_BLOCKED: [405,'FIREWALL_METHOD_BLOCKED'],
    FIREWALL_URI_TOO_LONG: [414,'FIREWALL_URI_TOO_LONG'],
    FIREWALL_REQUEST_BLOCKED: [403,'FIREWALL_REQUEST_BLOCKED'],
    FIREWALL_HEADER_BLOCKED: [431,'FIREWALL_HEADER_BLOCKED'],
    FIREWALL_BODY_BLOCKED: [413,'FIREWALL_BODY_BLOCKED'],
    FIREWALL_RATE_LIMITED: [429,'FIREWALL_RATE_LIMITED'],
    PRODUCTION_HOLD_ACTIVE: [503,'PRODUCTION_HOLD_ACTIVE'],
    PRODUCTION_RELEASE_NOT_VERIFIED: [503,'PRODUCTION_RELEASE_NOT_VERIFIED'],
    FIRST_TIME_RIGHT_REQUIRED: [409,'FIRST_TIME_RIGHT_REQUIRED'],
    INVALID_ROUTE_COORDINATES: [422, 'INVALID_ROUTE_COORDINATES'],
    TIME_WINDOW_TOO_LONG: [422, 'TIME_WINDOW_TOO_LONG'],
    STRIPE_NOT_CONFIGURED: [503, 'STRIPE_NOT_CONFIGURED'],
    STRIPE_API_ERROR: [502, 'STRIPE_API_ERROR'],
    INVOICE_PAYMENT_COMPLETE: [409, 'INVOICE_PAYMENT_COMPLETE'],
    TECHNICIAN_LOCATION_REQUIRED: [
      422,
      'TECHNICIAN_LOCATION_REQUIRED'
    ],
    INVALID_WORKFLOW: [
      422,
      'INVALID_WORKFLOW'
    ],
    INVALID_WORKFLOW_TRANSITION: [
      422,
      'INVALID_WORKFLOW_TRANSITION'
    ],
    WORKFLOW_TRANSITION_FORBIDDEN: [
      409,
      'WORKFLOW_TRANSITION_FORBIDDEN'
    ],
    INVALID_ESCALATION_RULE: [
      422,
      'INVALID_ESCALATION_RULE'
    ],
    INVALID_PROCEDURE: [
      422,
      'INVALID_PROCEDURE'
    ],
    INVALID_STEP: [
      422,
      'INVALID_STEP'
    ],
    INVALID_PROCEDURE_EVIDENCE: [
      422,
      'INVALID_PROCEDURE_EVIDENCE'
    ],
    PROCEDURE_ORDER_REQUIRED: [
      409,
      'PROCEDURE_ORDER_REQUIRED'
    ],
    INVALID_COMPLETION_POLICY: [
      422,
      'INVALID_COMPLETION_POLICY'
    ],
    COMPLETION_GATE_BLOCKED: [
      409,
      'COMPLETION_GATE_BLOCKED'
    ],
    INVALID_FINANCIAL_SETTINGS: [
      422,
      'INVALID_FINANCIAL_SETTINGS'
    ],
    INVALID_FINANCIAL_INPUT: [
      422,
      'INVALID_FINANCIAL_INPUT'
    ],
    INVALID_CONTRACT: [
      422,
      'INVALID_CONTRACT'
    ],
    INVALID_WARRANTY: [
      422,
      'INVALID_WARRANTY'
    ],
    INVALID_MAINTENANCE_PLAN: [
      422,
      'INVALID_MAINTENANCE_PLAN'
    ],
    INVALID_SAFETY_CHECKLIST: [
      422,
      'INVALID_SAFETY_CHECKLIST'
    ],
    INVALID_SAFETY_ACK: [
      422,
      'INVALID_SAFETY_ACK'
    ],
    SAFETY_STOP_WORK: [
      409,
      'SAFETY_STOP_WORK'
    ],
    INVALID_SITE: [
      422,
      'INVALID_SITE'
    ],
    INVALID_ASSET_EVENT: [
      422,
      'INVALID_ASSET_EVENT'
    ],
    INVALID_WORK_ORDER: [
      422,
      'INVALID_WORK_ORDER'
    ],
    INVALID_EVENT_TIME: [
      422,
      'INVALID_EVENT_TIME'
    ],
    INVALID_SAFETY_EVIDENCE: [
      422,
      'INVALID_SAFETY_EVIDENCE'
    ],
    WEBHOOK_ENCRYPTION_KEY_REQUIRED: [
      503,
      'WEBHOOK_ENCRYPTION_KEY_REQUIRED'
    ],
    SECRET_CIPHERTEXT_INVALID: [
      500,
      'SECRET_CIPHERTEXT_INVALID'
    ],
    EVIDENCE_INTEGRITY_MISMATCH: [
      409,
      'EVIDENCE_INTEGRITY_MISMATCH'
    ],
    SYNC_IDEMPOTENCY_CONFLICT: [
      409,
      'SYNC_IDEMPOTENCY_CONFLICT'
    ],
    IDEMPOTENCY_KEY_REQUIRED: [
      400,
      'IDEMPOTENCY_KEY_REQUIRED'
    ],
    IDEMPOTENCY_KEY_REUSED: [
      409,
      'IDEMPOTENCY_KEY_REUSED'
    ],
    IDENTITY_PROVIDER_UNAVAILABLE: [503,'IDENTITY_PROVIDER_UNAVAILABLE'],
    OIDC_CONFIGURATION_REQUIRED: [503,'OIDC_CONFIGURATION_REQUIRED'],
    OIDC_ISSUER_INVALID: [503,'OIDC_ISSUER_INVALID'],
    OIDC_ISSUER_TLS_REQUIRED: [503,'OIDC_ISSUER_TLS_REQUIRED'],
    OIDC_JWKS_URI_INVALID: [503,'OIDC_JWKS_URI_INVALID'],
    OIDC_JWKS_TLS_REQUIRED: [503,'OIDC_JWKS_TLS_REQUIRED'],
    OIDC_PROVIDER_TIMEOUT: [503,'OIDC_PROVIDER_TIMEOUT'],
    OIDC_USER_NOT_PROVISIONED: [403,'OIDC_USER_NOT_PROVISIONED'],
    OIDC_IDENTITY_NOT_LINKED: [403,'OIDC_IDENTITY_NOT_LINKED'],
    OIDC_IDENTITY_BOUND_TO_OTHER_USER: [409,'OIDC_IDENTITY_BOUND_TO_OTHER_USER'],
    OIDC_EMAIL_CHANGED_REQUIRES_RELINK: [403,'OIDC_EMAIL_CHANGED_REQUIRES_RELINK'],
    OIDC_VERIFIED_EMAIL_REQUIRED: [401,'OIDC_VERIFIED_EMAIL_REQUIRED'],
    OIDC_TOKEN_EXPIRED: [401,'OIDC_TOKEN_EXPIRED'],
    OIDC_SIGNATURE_INVALID: [401,'OIDC_SIGNATURE_INVALID'],
    OIDC_CLAIM_ISS_INVALID: [401,'OIDC_CLAIM_ISS_INVALID'],
    OIDC_CLAIM_AUD_INVALID: [401,'OIDC_CLAIM_AUD_INVALID'],
    OIDC_CLAIM_AZP_INVALID: [401,'OIDC_CLAIM_AZP_INVALID'],
    OIDC_NONCE_MISMATCH: [401,'OIDC_NONCE_MISMATCH'],
    OIDC_SIGNING_KEY_NOT_FOUND: [401,'OIDC_SIGNING_KEY_NOT_FOUND'],
    OIDC_JWK_INVALID: [401,'OIDC_JWK_INVALID'],
    OIDC_ALGORITHM_FORBIDDEN: [401,'OIDC_ALGORITHM_FORBIDDEN'],
    OIDC_SUBJECT_MISSING: [401,'OIDC_SUBJECT_MISSING'],
    OIDC_IDENTITY_INVALID: [401,'OIDC_IDENTITY_INVALID'],
    OIDC_LOCAL_LOGIN_FORBIDDEN: [403,'OIDC_LOCAL_LOGIN_FORBIDDEN'],
    AUTH_MODE_OIDC_REQUIRED: [400,'AUTH_MODE_OIDC_REQUIRED'],
    SIGNOFF_WORK_ORDER_CLOSED: [409,'SIGNOFF_WORK_ORDER_CLOSED'],
    SIGNOFF_CHALLENGE_INVALID: [422,'SIGNOFF_CHALLENGE_INVALID'],
    SIGNOFF_CHALLENGE_INVALID_OR_REPLAYED: [409,'SIGNOFF_CHALLENGE_INVALID_OR_REPLAYED'],
    SIGNOFF_CHALLENGE_EXPIRED: [409,'SIGNOFF_CHALLENGE_EXPIRED'],
    SIGNOFF_CHALLENGE_ACTOR_MISMATCH: [403,'SIGNOFF_CHALLENGE_ACTOR_MISMATCH'],
    SIGNOFF_DOCUMENT_MISMATCH: [409,'SIGNOFF_DOCUMENT_MISMATCH'],
    SIGNOFF_CHALLENGE_REPLAYED: [409,'SIGNOFF_CHALLENGE_REPLAYED'],
    SIGNOFF_CHALLENGE_REQUIRED: [422,'SIGNOFF_CHALLENGE_REQUIRED'],
    SIGNOFF_ASSURANCE_INVALID: [422,'SIGNOFF_ASSURANCE_INVALID'],
    AUTH_MODE_INVALID: [
      500,
      'AUTH_MODE_INVALID'
    ],
    INVALID_ORG_UNIT: [
      422,
      'INVALID_ORG_UNIT'
    ],
    IMPORT_VALIDATION_FAILED: [
      422,
      'IMPORT_VALIDATION_FAILED'
    ],
    INVALID_JSON_IMPORT: [
      422,
      'INVALID_JSON_IMPORT'
    ],
    INVALID_ROUTE_PLAN: [
      422,
      'INVALID_ROUTE_PLAN'
    ],
    ROUTE_PLAN_TOO_LARGE: [
      413,
      'ROUTE_PLAN_TOO_LARGE'
    ],
    STRIPE_WEBHOOK_NOT_CONFIGURED: [
      503,
      'STRIPE_WEBHOOK_NOT_CONFIGURED'
    ],
    STRIPE_SIGNATURE_INVALID: [
      400,
      'STRIPE_SIGNATURE_INVALID'
    ],
    STRIPE_SIGNATURE_EXPIRED: [
      400,
      'STRIPE_SIGNATURE_EXPIRED'
    ],
    STRIPE_ORGANIZATION_UNRESOLVED: [
      422,
      'STRIPE_ORGANIZATION_UNRESOLVED'
    ],
    INVALID_CUSTOMER: [
      422,
      'INVALID_CUSTOMER'
    ],
    INVALID_CURRENCY: [
      422,
      'INVALID_CURRENCY'
    ],
    INVALID_COMMERCIAL_LINES: [
      422,
      'INVALID_COMMERCIAL_LINES'
    ],
    INVALID_COMMERCIAL_LINE: [
      422,
      'INVALID_COMMERCIAL_LINE'
    ],
    INVALID_ESTIMATE_TRANSITION: [
      409,
      'INVALID_ESTIMATE_TRANSITION'
    ],
    ESTIMATE_EXPIRED: [
      409,
      'ESTIMATE_EXPIRED'
    ],
    ESTIMATE_NOT_ACCEPTED: [
      409,
      'ESTIMATE_NOT_ACCEPTED'
    ],
    CUSTOMER_MISMATCH: [
      422,
      'CUSTOMER_MISMATCH'
    ],
    INVALID_INVOICE_TRANSITION: [
      409,
      'INVALID_INVOICE_TRANSITION'
    ],
    INVOICE_PAYMENT_INCOMPLETE: [
      409,
      'INVOICE_PAYMENT_INCOMPLETE'
    ],
    INVOICE_PAYMENT_NOT_ALLOWED: [
      409,
      'INVOICE_PAYMENT_NOT_ALLOWED'
    ],
    INVALID_PAYMENT_AMOUNT: [
      422,
      'INVALID_PAYMENT_AMOUNT'
    ],
    PAYMENT_EXCEEDS_BALANCE: [
      409,
      'PAYMENT_EXCEEDS_BALANCE'
    ],
    INVALID_ASSET: [
      422,
      'INVALID_ASSET'
    ],
    INVALID_ASSIGNEE: [
      422,
      'INVALID_ASSIGNEE'
    ],
    INVALID_STRIPE_CUSTOMER: [
      422,
      'INVALID_STRIPE_CUSTOMER'
    ],
    INVALID_STRIPE_SUBSCRIPTION: [
      422,
      'INVALID_STRIPE_SUBSCRIPTION'
    ],
    STRIPE_CUSTOMER_ALREADY_LINKED: [
      409,
      'STRIPE_CUSTOMER_ALREADY_LINKED'
    ],
    STRIPE_EVENT_PAYLOAD_CONFLICT: [
      409,
      'STRIPE_EVENT_PAYLOAD_CONFLICT'
    ],
    STRIPE_SUBSCRIPTION_MISMATCH: [
      409,
      'STRIPE_SUBSCRIPTION_MISMATCH'
    ],
    STRIPE_EVENT_INVALID_TIMESTAMP: [
      400,
      'STRIPE_EVENT_INVALID_TIMESTAMP'
    ],
    INVALID_CONFLICT_ACTION: [422,'INVALID_CONFLICT_ACTION'],
    CONFLICT_RETRY_FORBIDDEN: [409,'CONFLICT_RETRY_FORBIDDEN'],
    TIME_ENTRY_ALREADY_RUNNING: [409,'TIME_ENTRY_ALREADY_RUNNING'],
    INVALID_TIME_RANGE: [422,'INVALID_TIME_RANGE'],
    TIME_ENTRY_TOO_LONG: [422,'TIME_ENTRY_TOO_LONG'],
    TECHNICIAN_PROFILE_REQUIRED: [422,'TECHNICIAN_PROFILE_REQUIRED'],
    TIME_ENTRY_ALREADY_STOPPED: [409,'TIME_ENTRY_ALREADY_STOPPED'],
    INVALID_RATE_LIMIT: [422,'INVALID_RATE_LIMIT'],
    SYNC_CONFLICT_ALREADY_RESOLVED: [409,'SYNC_CONFLICT_ALREADY_RESOLVED'],
    AI_PROVIDER_NOT_CONFIGURED: [503,'AI_PROVIDER_NOT_CONFIGURED'],
    AI_PROVIDER_INVALID_RESPONSE: [502,'AI_PROVIDER_INVALID_RESPONSE'],
    AI_PROVIDER_EMPTY_OUTPUT: [502,'AI_PROVIDER_EMPTY_OUTPUT'],
    AI_PROVIDER_INVALID_JSON: [502,'AI_PROVIDER_INVALID_JSON'],
    CONTACT_CENTER_DISABLED: [404,'CONTACT_CENTER_DISABLED'],
    CONTACT_CENTER_ENCRYPTION_NOT_CONFIGURED: [503,'CONTACT_CENTER_ENCRYPTION_NOT_CONFIGURED'],
    CONTACT_CENTER_ENCRYPTION_KEY_ID_INVALID: [500,'CONTACT_CENTER_ENCRYPTION_KEY_ID_INVALID'],
    CONTACT_CENTER_ENCRYPTION_KEY_VERSION_MISMATCH: [503,'CONTACT_CENTER_ENCRYPTION_KEY_VERSION_MISMATCH'],
    CONTACT_CENTER_CIPHERTEXT_INTEGRITY_FAILURE: [500,'CONTACT_CENTER_CIPHERTEXT_INTEGRITY_FAILURE'],
    CONTACT_CENTER_LANGUAGE_INVALID: [422,'CONTACT_CENTER_LANGUAGE_INVALID'],
    CONTACT_CENTER_CONSENT_REQUIRED: [422,'CONTACT_CENTER_CONSENT_REQUIRED'],
    CONTACT_CENTER_CHANNEL_INVALID: [422,'CONTACT_CENTER_CHANNEL_INVALID'],
    CONTACT_CENTER_CHANNEL_MISMATCH: [409,'CONTACT_CENTER_CHANNEL_MISMATCH'],
    CONTACT_CENTER_CONVERSATION_NOT_FOUND: [404,'CONTACT_CENTER_CONVERSATION_NOT_FOUND'],
    CONTACT_CENTER_CONVERSATION_CLOSED: [409,'CONTACT_CENTER_CONVERSATION_CLOSED'],
    CONTACT_CENTER_HUMAN_TAKEOVER_ACTIVE: [409,'CONTACT_CENTER_HUMAN_TAKEOVER_ACTIVE'],
    CONTACT_CENTER_MESSAGE_INVALID: [422,'CONTACT_CENTER_MESSAGE_INVALID'],
    CONTACT_CENTER_DUPLICATE_MESSAGE: [409,'CONTACT_CENTER_DUPLICATE_MESSAGE'],
    CONTACT_CENTER_MESSAGE_IN_PROGRESS: [409,'CONTACT_CENTER_MESSAGE_IN_PROGRESS'],
    CONTACT_CENTER_IDEMPOTENCY_KEY_REQUIRED: [422,'CONTACT_CENTER_IDEMPOTENCY_KEY_REQUIRED'],
    CONTACT_CENTER_PROVIDER_NOT_CONFIGURED: [503,'CONTACT_CENTER_PROVIDER_NOT_CONFIGURED'],
    CONTACT_CENTER_MODEL_NOT_CONFIGURED: [503,'CONTACT_CENTER_MODEL_NOT_CONFIGURED'],
    CONTACT_CENTER_AI_PROVIDER_ERROR: [502,'CONTACT_CENTER_AI_PROVIDER_ERROR'],
    CONTACT_CENTER_AI_OUTPUT_INVALID: [502,'CONTACT_CENTER_AI_OUTPUT_INVALID'],
    CONTACT_CENTER_AI_TIMEOUT: [504,'CONTACT_CENTER_AI_TIMEOUT'],
    CONTACT_CENTER_AI_RATE_LIMITED: [429,'CONTACT_CENTER_AI_RATE_LIMITED'],
    CONTACT_CENTER_REALTIME_MODEL_NOT_CONFIGURED: [503,'CONTACT_CENTER_REALTIME_MODEL_NOT_CONFIGURED'],
    CONTACT_CENTER_REALTIME_PROVIDER_ERROR: [502,'CONTACT_CENTER_REALTIME_PROVIDER_ERROR'],
    CONTACT_CENTER_REALTIME_TIMEOUT: [504,'CONTACT_CENTER_REALTIME_TIMEOUT'],
    CONTACT_CENTER_HANDOFF_REASON_INVALID: [422,'CONTACT_CENTER_HANDOFF_REASON_INVALID'],
    CONTACT_CENTER_HANDOFF_NOT_FOUND: [404,'CONTACT_CENTER_HANDOFF_NOT_FOUND'],
    CONTACT_CENTER_HANDOFF_ALREADY_CLAIMED: [409,'CONTACT_CENTER_HANDOFF_ALREADY_CLAIMED'],
    CONTACT_CENTER_HANDOFF_NOT_ASSIGNED_TO_ACTOR: [403,'CONTACT_CENTER_HANDOFF_NOT_ASSIGNED_TO_ACTOR'],
    CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED: [403,'CONTACT_CENTER_HUMAN_ASSIGNMENT_REQUIRED']
  };
  const raw = String(err?.message || 'BAD_REQUEST');
  const codeKey = raw.split(':')[0];
  // Never serialize provider errors, secrets, credentials, or arbitrary exception text to clients.
  const safe = safeError(err);
  const [status, code] = map[codeKey] || [
    400,
    'BAD_REQUEST'
  ];
  const details = codeKey === 'MULTIPLE_ORGANIZATIONS' && Array.isArray(err?.details?.organizations)
    ? { organizations: err.details.organizations.slice(0, 20).map(x => ({ id: String(x.id).slice(0, 200), name: String(x.name).slice(0, 200), role: String(x.role).slice(0, 32) })) }
    : null;
  const reasons = details?.blockers?.map(reason => ({
    code: String(reason).slice(0, 160),
    severity: 'blocking'
  })) || [{
      code,
      severity: status >= 500 ? 'error' : 'blocking'
    }];
  if (err && err.causeCode && code === 'BOOTSTRAP_FAILED') {
    reasons.push({ code: String(err.causeCode).slice(0, 120), severity: 'blocking' });
  }
  json(res, status, {
    error: {
      code,
      reasons,
      ...(details ? { details } : {})
    }
  });
}
async function rawBody(req, max = config.maxBodyBytes) {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > max)
    throw new Error('PAYLOAD_TOO_LARGE');
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    if (bytes > max)
      throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function body(req, max = config.maxBodyBytes) {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > max)
    throw new Error('PAYLOAD_TOO_LARGE');
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    if (bytes > max)
      throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(c);
  }
  if (!chunks.length)
    return {};
  const raw = Buffer.concat(chunks);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        // Ignore malformed cookies; authentication still fails closed.
      }
    }
  }
  return out;
}
function sessionTokenFromRequest(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m?.[1] || parseCookies(req)['__Host-opscore_session'] || null;
}
function ctx(req) {
  authProviderGate();
  const raw = sessionTokenFromRequest(req);
  if (!raw)
    return null;
  // Identity tables are FORCE RLS: resolve session/API key under access_mode=auth, then bind tenant.
  if (store.db && typeof store.db.setSession === 'function') {
    try { store.db.setSession({ tenantId: '', userId: '', accessMode: 'auth' }); }
    catch (error) { warn('postgres_identity_context_bind_failed', { error }); return null; }
  }
  const out = store.session(raw) || store.authenticateApiKey(raw);
  if (out) out.correlationId = null;
  return out;
}
function requireScope(c, scope) {
  if (!c.apiKeyId) return;
  const allowed = (c.scopes || []).includes('*') || (c.scopes || []).includes(scope);
  try {
    store.recordAuthorizationDecision(c, {
      action: `api_scope:${scope}`,
      resourceType: 'api',
      resourceId: scope,
      decision: allowed ? 'allow' : 'deny',
      reasonCode: allowed ? 'API_KEY_SCOPE_GRANTED' : 'API_KEY_SCOPE_FORBIDDEN'
    });
  } catch (auditError) {
    warn('authorization_decision_persistence_blocked', { userId: c.userId, organizationId: c.organizationId, scope, error: auditError });
    throw new Error('AUTHZ_EVIDENCE_REQUIRED');
  }
  if (!allowed) throw new Error('API_KEY_SCOPE_FORBIDDEN');
}
function auditSafeAi(store,c,workOrderId,out){
  try {
    require('./audit').audit(store.db,{organizationId:c.organizationId,actorUserId:c.userId,action:'ai_work_order_summary',resourceType:'work_order',resourceId:workOrderId,metadata:{provider:out.provider,model:out.model,schemaVersion:out.schemaVersion,contextHashSha256:out.grounding?.contextHashSha256 || null}});
    return { auditStatus: 'persisted' };
  } catch (auditError) {
    warn('ai_audit_persistence_blocked', { organizationId: c.organizationId, userId: c.userId, workOrderId, error: auditError });
    throw new Error('AI_AUDIT_EVIDENCE_REQUIRED');
  }
}
function signedWorkOrdersReadEnabled(req) {
  const pathname = String(req.url || '').split('?')[0];
  const supportedReadPath = pathname === '/api/v1/work-orders'
    || /^\/api\/v1\/work-orders\/[^/]+$/.test(pathname)
    || /^\/api\/v1\/work-orders\/[^/]+\/(?:completion-package|timeline|handoff|operational-risk|comments|attachments|dispatch-candidates|parts|signoffs|why-blocked|changelog|verified-job-record|work-pack|completion-assurance|time-summary|first-time-right)$/.test(pathname);
  return process.env.VERCEL_ENV === 'preview'
    && String(process.env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_ENABLED || '').toLowerCase() === 'true'
    && String(req.method || '').toUpperCase() === 'GET'
    && supportedReadPath;
}
function signedWorkOrdersWriteEnabled(req) {
  const pathname = String(req.url || '').split('?')[0];
  const method = String(req.method || '').toUpperCase();
  const workOrderIdPath = /^\/api\/v1\/work-orders\/[^/]+$/;
  const supportedWritePath = (method === 'POST' && pathname === '/api/v1/work-orders')
    || (method === 'POST' && pathname === '/api/v1/work-orders/bulk')
    || (method === 'PATCH' && workOrderIdPath.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/comments$/.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/transition$/.test(pathname))
    || (method === 'DELETE' && workOrderIdPath.test(pathname))
    || (method === 'POST' && /^\/api\/v1\/work-orders\/[^/]+\/restore$/.test(pathname));
  return process.env.VERCEL_ENV === 'preview'
    && String(process.env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_WRITE_ENABLED || '').toLowerCase() === 'true'
    && supportedWritePath;
}
function signedWorkOrdersContextEnabled(req) {
  return signedWorkOrdersReadEnabled(req) || signedWorkOrdersWriteEnabled(req);
}
function runSignedWorkOrdersRead(res, c, reader, responseHeaders = {}) {
  if (c.apiKeyId || !c.sessionId || !store.db || store.db.engine !== 'postgres'
      || typeof store.db.activateVerifiedTenantContext !== 'function') {
    return json(res, 401, { error: { code: 'SIGNED_TENANT_SESSION_REQUIRED' } }, { 'cache-control': 'no-store' });
  }
  let transactionOpen = false;
  try {
    store.db.exec('BEGIN READ ONLY');
    transactionOpen = true;
    store.db.activateVerifiedTenantContext();

    // CI-only red-team probe: signed RLS accessors must ignore these raw GUC values.
    if (process.env.CI === 'true'
        && String(process.env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_TAMPER_TEST || '').toLowerCase() === 'true') {
      store.db.prepare(
        "SELECT set_config('app.tenant_id', ?, true), set_config('app.user_id', ?, true), set_config('app.access_mode', ?, true)"
      ).run('raw-guc-forged-tenant', 'raw-guc-forged-user', 'backoffice');
    }

    const result = reader();
    store.db.exec('COMMIT');
    transactionOpen = false;
    return json(res, 200, result, {
      ...responseHeaders,
      'cache-control': 'no-store',
      'x-opscore-signed-tenant-context': 'verified'
    });
  } catch (error) {
    if (transactionOpen) {
      try { store.db.exec('ROLLBACK'); } catch (_) { /* request teardown rolls back if necessary */ }
    }
    warn('signed_work_order_read_failed', {
      errorCode: safeDatabaseErrorCode(error),
      organizationId: c.organizationId
    });
    return json(res, 503, { error: { code: 'SIGNED_TENANT_WORK_ORDER_READ_FAILED' } }, { 'cache-control': 'no-store' });
  }
}
function sendWorkOrderRead(req, res, c, reader, responseHeaders = {}) {
  if (!signedWorkOrdersReadEnabled(req)) return json(res, 200, reader(), responseHeaders);
  return runSignedWorkOrdersRead(res, c, reader, responseHeaders);
}
function runSignedWorkOrderWrite(res, c, writer, responder) {
  if (c.apiKeyId || !c.sessionId || !store.db || store.db.engine !== 'postgres'
      || typeof store.db.activateVerifiedTenantContext !== 'function'
      || typeof store.withCallerManagedTransaction !== 'function') {
    return json(res, 401, { error: { code: 'SIGNED_TENANT_SESSION_REQUIRED' } }, { 'cache-control': 'no-store' });
  }
  if (store._txDepth !== 0) {
    return json(res, 503, { error: { code: 'SIGNED_TENANT_TRANSACTION_STATE_INVALID' } }, { 'cache-control': 'no-store' });
  }
  let transactionOpen = false;
  try {
    store.db.exec('BEGIN');
    transactionOpen = true;
    store.db.activateVerifiedTenantContext();

    // CI-only red-team probe: tenant writes must use signed claims, not caller-settable GUCs.
    if (process.env.CI === 'true'
        && String(process.env.OPSC_SIGNED_TENANT_CONTEXT_WORK_ORDERS_TAMPER_TEST || '').toLowerCase() === 'true') {
      store.db.prepare(
        "SELECT set_config('app.tenant_id', ?, true), set_config('app.user_id', ?, true), set_config('app.access_mode', ?, true)"
      ).run('raw-guc-forged-tenant', 'raw-guc-forged-user', 'backoffice');
    }

    const result = store.withCallerManagedTransaction(writer);
    store.db.exec('COMMIT');
    transactionOpen = false;
    return responder(result, {
      'cache-control': 'no-store',
      'x-opscore-signed-tenant-context': 'verified'
    });
  } catch (error) {
    if (transactionOpen) {
      try { store.db.exec('ROLLBACK'); } catch (_) { /* request teardown rolls back if necessary */ }
    }
    warn('signed_work_order_write_failed', {
      errorCode: safeDatabaseErrorCode(error),
      organizationId: c.organizationId
    });
    return fail(res, error);
  }
}
function requireCtx(req, res) {
  const c = ctx(req);
  if (!c) {
    json(res, 401, { error: { code: 'UNAUTHENTICATED' } });
    return null;
  }
  // Explicitly allowlisted work-order GET routes pin a verified session principal.
  // Their handlers use one READ ONLY transaction bound to backend/xid; all writes,
  // PDF streaming, evidence-integrity auditing, and other routes keep their own paths.
  try {
    if (signedWorkOrdersContextEnabled(req)
        && !c.apiKeyId
        && c.sessionId
        && store.db
        && store.db.engine === 'postgres'
        && typeof store.db.setVerifiedPrincipal === 'function') {
      store.db.setVerifiedPrincipal({
        sessionId: c.sessionId,
        userId: c.userId || '',
        tenantId: c.organizationId || ''
      });
    } else if (store.db && typeof store.db.setSession === 'function' && c.organizationId) {
      store.db.setSession({ tenantId: c.organizationId, userId: c.userId || '', accessMode: 'field' });
    }
  } catch (sessionError) {
    warn('postgres_tenant_session_bind_failed', { organizationId: c.organizationId, error: sessionError });
    json(res, 503, { error: { code: 'DATABASE_SECURITY_CONTEXT_FAILED' } });
    return null;
  }
  c.correlationId = res.getHeader('x-correlation-id') || null;
  c.source = req.headers['x-client-source'] || (req.headers['user-agent']?.includes('Expo') ? 'mobile' : 'api');
  c.causationId = req.headers['x-causation-id'] || null;
  // Secure Tenant Fingerprinting: session/API-key organization is authoritative.
  // Any client-claimed organization id in headers/query that differs is IDOR.
  try {
    assertTenantAlignment(req, c);
  } catch (e) {
    const code = e && e.message ? e.message : 'TENANT_MISMATCH';
    json(res, code === 'TENANT_CONTEXT_REQUIRED' ? 401 : 403, { error: { code } });
    return null;
  }
  return c;
}
function idempotencyKey(req) {
  return req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || '';
}
function idemJson(res, record, createdStatus = 200, responseHeaders = {}) {
  return json(res, record.__idempotent ? 200 : createdStatus, record.payload, {
    ...responseHeaders,
    'x-idempotency-replayed': record.__idempotent ? 'true' : 'false'
  });
}
function sendFile(res, file, download) {
  if (!fs.existsSync(file))
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  const ext = path.extname(file);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  const headers = {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(),microphone=(),geolocation=(self)',
    'content-security-policy': 'default-src \'self\'; base-uri \'none\'; object-src \'none\'; frame-ancestors \'none\'; form-action \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'' + mapTileOrigin()
  };
  if (config.nodeEnv === 'production')
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  if (download)
    headers['content-disposition'] = `attachment; filename="${ path.basename(file).replace(/[^\w.-]/g, '_') }"`;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}
function safeDatabaseErrorCode(error) {
  const code = String(error && error.code || '').trim().toUpperCase();
  if (/^[A-Z0-9_]{1,64}$/.test(code)) return code;
  const message = String(error && error.message || '').trim().toUpperCase();
  if (/^POSTGRES_[A-Z0-9_]+(?::|$)/.test(message)) return message.match(/^POSTGRES_[A-Z0-9_]+/)[0];
  if (/^DATABASE_URL_REQUIRED$/.test(message)) return 'DATABASE_URL_REQUIRED';
  if (/PASSWORD AUTHENTICATION FAILED/.test(message)) return 'DB_AUTH_FAILED';
  if (/CERTIFICATE|TLS|SSL/.test(message)) return 'DB_TLS_FAILED';
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'DB_DNS_FAILED';
  if (/ECONNREFUSED/.test(message)) return 'DB_CONNECTION_REFUSED';
  if (/ETIMEDOUT|TIMEOUT/.test(message)) return 'DB_CONNECTION_TIMEOUT';
  if (/PG_SYNC_/.test(message)) return 'PG_SYNC_FAILURE';
  return 'UNCLASSIFIED';
}
function route(req, res) {
  const firewallInfo=inspectRequest(req, config);
  const firewallRate=firewallRateLimit(req);
  res.setHeader('x-firewall-rate-remaining', String(firewallRate.remaining));
  if (String(req.url || '').length > config.maxUrlLength)
    return json(res, 414, { error: { code: 'URI_TOO_LONG' } });
  const url = new URL(req.url, config.publicOrigin);
  const suppliedCorrelationId = String(req.headers['x-correlation-id'] || '').trim();
  const correlationId = /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedCorrelationId)
    ? suppliedCorrelationId
    : `req_${crypto.randomUUID()}`;
  res.setHeader('x-correlation-id', correlationId);
  // Retire the former public Mission Control demo. It contained synthetic operational
  // records and randomly changing KPIs; route the legacy entry to authenticated controls.
  if (url.pathname === '/command-bridge.html') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.writeHead(307, { location: '/control-plane.html', 'cache-control': 'no-store' });
      return res.end();
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } }, {
      allow: 'GET, HEAD',
      'cache-control': 'no-store'
    });
  }
  // Do not let retired static assets fall through to the generic index.html fallback.
  if (url.pathname === '/command-bridge.js' || url.pathname === '/command-bridge.css') {
    return json(res, 404, { error: { code: 'NOT_FOUND' } }, { 'cache-control': 'no-store' });
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    // Public health: status only — no database name, host, role, or server version.
    const payload = {
      ok: true,
      service: 'opscore',
      status: 'healthy',
      version: '0.11.62',
      engine: (store.databaseEngineResolved || config.databaseEngine || 'unknown') === 'postgres' ? 'postgres' : String(store.databaseEngineResolved || config.databaseEngine || 'unknown'),
      time: new Date().toISOString()
    };
    if (db && typeof db.ping === 'function') {
      try {
        db.ping();
        return json(res, 200, payload);
      } catch (e) {
        warn('database.health_probe_failed', {
          errorCode: safeDatabaseErrorCode(e),
          route: '/api/health'
        });
        return json(res, 200, { ...payload, ok: false, status: 'degraded' });
      }
    }
    return json(res, 200, payload);
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    const configured=String(process.env.METRICS_AUTH_TOKEN||'').trim();
    if (config.nodeEnv==='production' && !configured) return json(res,404,{error:{code:'METRICS_NOT_CONFIGURED'}});
    if (configured) {
      const supplied=String((req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim());
      const a=Buffer.from(supplied), b=Buffer.from(configured);
      if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return json(res,401,{error:{code:'UNAUTHENTICATED'}});
    }
    const snapshot=store.runtimeObservability({role:'admin'});
    res.writeHead(200,{'content-type':'text/plain; version=0.0.4; charset=utf-8','cache-control':'no-store'}); return res.end(prometheusMetrics(snapshot));
  }
  if (req.method === 'GET' && url.pathname === '/api/openapi.json')
    return sendFile(res, path.resolve(__dirname, '..', 'docs', 'openapi.json'));
  if (req.method === 'GET' && url.pathname === '/api/verify/deployment') {
    const identity = readEmbeddedBuildIdentity();
    const deploymentEnv = identity ? {
      ...process.env,
      OPSC_RELEASE_DEPLOYMENT_SOURCE: identity.deploymentSource,
      OPSC_RELEASE_CI_COMMIT: identity.commitSha,
      OPSC_RELEASE_CI_PIPELINE_ID: identity.pipelineId,
      OPSC_RELEASE_CI_REF: identity.ref,
      OPSC_SOURCE_COMMIT_SHA: identity.commitSha
    } : process.env;
    const proof = createDeploymentProof(deploymentEnv);
    return json(res, proof.status === 'identified' ? 200 : 503, proof);
  }

  if (req.method === 'GET' && (url.pathname === '/api/verify/release' || url.pathname === '/verify/release.json')) {
    return json(res, 200, createPublicReleaseProof(process.env));
  }
  if (req.method === 'GET' && url.pathname === '/api/verify/database-security') {
    const checkedAt = new Date().toISOString();
    const engine = store && store.db && store.db.engine ? store.db.engine : (config.databaseEngine || 'unknown');
    if (engine !== 'postgres' || !store || !store.db || typeof store.db.prepare !== 'function') {
      return json(res, 503, {
        schemaVersion: 'opscore.public-database-security-proof.v1',
        status: 'UNAVAILABLE',
        productionIsolationCertification: 'NOT_CERTIFIED',
        checkedAt,
        note: 'A live PostgreSQL catalog check was not available. No production isolation certification is inferred.'
      });
    }
    try {
      return json(res, 200, readDatabaseSecurityProof(store.db));
    } catch (e) {
      const probeErrorCode = safeDatabaseErrorCode(e);
      warn('database.security_proof_failed', {
        errorCode: probeErrorCode,
        route: '/api/verify/database-security'
      });
      return json(res, 503, {
        schemaVersion: 'opscore.public-database-security-proof.v1',
        status: 'UNAVAILABLE',
        ...(process.env.VERCEL_ENV === 'preview' ? { probeErrorCode } : {}),
        productionIsolationCertification: 'NOT_CERTIFIED',
        checkedAt: new Date().toISOString(),
        note: 'The live database catalog check failed. No production isolation certification is inferred.'
      });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/verify/database') {
    try {
      const eng = store && store.db && store.db.engine ? store.db.engine : (config.databaseEngine || 'unknown');
      let ok = false;
      let probeErrorCode = null;
      if (store && store.db && typeof store.db.prepare === 'function') {
        try { store.db.prepare('SELECT 1 AS ok').get(); ok = true; } catch (e) {
          probeErrorCode = safeDatabaseErrorCode(e);
          warn('database.connectivity_proof_failed', {
            errorCode: probeErrorCode,
            route: '/api/verify/database'
          });
          ok = false;
        }
      }
      return json(res, 200, {
        schemaVersion: 'opscore.public-database-proof.v1',
        ok,
        engine: eng === 'postgres' ? 'postgres' : String(eng),
        ...(process.env.VERCEL_ENV === 'preview' && !ok ? { probeErrorCode: probeErrorCode || 'DB_PROBE_UNAVAILABLE' } : {}),
        checkedAt: new Date().toISOString(),
        note: 'Connectivity only. Host, role, and database name are withheld.'
      });
    } catch (e) {
      return json(res, 200, { schemaVersion: 'opscore.public-database-proof.v1', ok: false, engine: 'unknown', checkedAt: new Date().toISOString() });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/infrastructure/postgres/status') {
    const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'admin');}catch(e){return fail(res,e);} return postgresStatus(config).then(out=>json(res,200,out));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/ai/agent/run') {
    const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>runAgenticCopilot(store,c,b).then(out=>json(res,201,out))).catch(e=>fail(res,e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/ai/knowledge/index') {
    const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'admin');}catch(e){return fail(res,e);} return body(req).then(async b=>{const {getPool}=require('./postgres-runtime');const {upsert}=require('./postgres-knowledge');const pool=getPool(config);const limit=Math.min(Math.max(Number(b.limit)||100,1),500);const sources=[];sources.push(...store.db.prepare('SELECT id,title,description FROM work_orders WHERE organization_id=? ORDER BY updated_at DESC LIMIT ?').all(c.organizationId,limit).map(r=>({sourceType:'work_order',sourceId:r.id,content:`${r.title}\n${r.description}`,metadata:{number:r.number||null}})));sources.push(...store.db.prepare('SELECT id,name,asset_type FROM assets WHERE organization_id=? ORDER BY updated_at DESC LIMIT ?').all(c.organizationId,limit).map(r=>({sourceType:'asset',sourceId:r.id,content:`${r.name}\nType: ${r.asset_type}`,metadata:{}})));sources.push(...store.db.prepare('SELECT id,event_type,details_json,occurred_at FROM asset_events WHERE organization_id=? ORDER BY occurred_at DESC LIMIT ?').all(c.organizationId,Math.min(limit,200)).map(r=>({sourceType:'asset_event',sourceId:r.id,content:`${r.event_type}\n${r.details_json||''}`,metadata:{occurredAt:r.occurred_at}})));
      sources.push(...store.db.prepare('SELECT id,procedure_id,status,steps_json,started_at,completed_at FROM procedure_runs WHERE organization_id=? ORDER BY started_at DESC LIMIT ?').all(c.organizationId,Math.min(limit,100)).map(r=>({sourceType:'procedure_run',sourceId:r.id,content:`Procedure ${r.procedure_id}\nStatus: ${r.status}\n${r.steps_json||''}`,metadata:{startedAt:r.started_at,completedAt:r.completed_at}})));
      sources.push(...store.db.prepare('SELECT id,rows_json,sheet_date FROM closure_sheets WHERE organization_id=? ORDER BY created_at DESC LIMIT ?').all(c.organizationId,Math.min(limit,100)).map(r=>({sourceType:'closure_sheet',sourceId:r.id,content:r.rows_json,metadata:{sheetDate:r.sheet_date}})));let indexed=0;for(const x of sources){await upsert(pool,{organizationId:c.organizationId,...x});indexed++;}return json(res,200,{schemaVersion:'opscore.knowledge-index.v1',indexed,model:require('./ai-embeddings').model(),sourceCounts:sources.reduce((a,x)=>(a[x.sourceType]=(a[x.sourceType]||0)+1,a),{}),note:'Embeddings are generated by the configured provider and stored in PostgreSQL pgvector. No synthetic vectors are created.'});}).catch(e=>fail(res,e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/ai/knowledge/search') {
    const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');}catch(e){return fail(res,e);} return body(req).then(async b=>{const {getPool}=require('./postgres-runtime');const {search}=require('./postgres-knowledge');return json(res,200,await search(getPool(config),{organizationId:c.organizationId,query:b.query,limit:b.limit}));}).catch(e=>fail(res,e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/bootstrap') {
    if (!isHttpBootstrapAllowed(config.nodeEnv)) {
      return json(res, 404, { error: { code: 'BOOTSTRAP_CLI_REQUIRED' } }, { 'cache-control': 'no-store' });
    }
    return body(req).then(b => runWithRequest(() => {
      if (store.db && typeof store.db.setSession === 'function') store.db.setSession({ tenantId: '', userId: '', accessMode: 'auth' });
      try {
        return json(res, 201, store.bootstrap(b));
      } catch (e) {
        const root = String((e && (e.code || e.message)) || 'BOOTSTRAP_FAILED').slice(0, 160);
        throw Object.assign(new Error(
          root.includes('ALREADY_BOOTSTRAPPED') ? 'ALREADY_BOOTSTRAPPED'
            : root.includes('CEO_PASSWORD') ? 'CEO_PASSWORD_TOO_SHORT'
            : root.includes('INVALID_BOOTSTRAP') ? 'INVALID_BOOTSTRAP'
            : root.includes('BOOTSTRAP_NOT_PERSISTED') ? 'BOOTSTRAP_NOT_PERSISTED'
            : 'BOOTSTRAP_FAILED'
        ), { causeCode: root.slice(0, 80) });
      }
    }, req, res, { forceNew: true })).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/oidc/exchange') {
    return body(req).then(async b => {
      if (authProviderGate() !== 'oidc') throw new Error('AUTH_MODE_OIDC_REQUIRED');
      const nonce = String(b.nonce || '').trim();
      if (!nonce) throw new Error('OIDC_NONCE_REQUIRED');
      const identity=await verifyOidcIdToken(b.idToken,nonce);
      if (store.db && typeof store.db.setSession === 'function') store.db.setSession({ tenantId: '', userId: '', accessMode: 'auth' });
      const out=await store.loginOidc(identity,b.organizationId);
      if (store.db && typeof store.db.setSession === 'function' && out && (out.organizationId || out.organization?.id)) store.db.setSession({ tenantId: out.organizationId || out.organization.id, userId: out.userId || out.user?.id || '', accessMode: 'field' });
      return json(res,200,{user:out.user,organization:out.organization,role:out.role,expiresAt:out.expiresAt,token:out.token},{'cache-control':'no-store','pragma':'no-cache'});
    }).catch(e=>fail(res,e));
  }
  if (req.method === 'POST' && (url.pathname === '/api/v1/auth/login' || url.pathname === '/api/v1/auth/mobile-login')) {
    try {
      const loginLimit = loginRateLimit(req);
      res.setHeader('x-login-rate-remaining', String(loginLimit.remaining));
    } catch (e) {
      return fail(res, e);
    }
    let authMode;
    try { authMode = authProviderGate(); } catch (e) { return fail(res,e); }
    if (authMode === 'oidc') return fail(res, Object.assign(new Error('OIDC_LOCAL_LOGIN_FORBIDDEN'), { code:'OIDC_LOCAL_LOGIN_FORBIDDEN' }));
    return body(req).then(async b => runWithRequest(async () => {
      if (store.db && typeof store.db.setSession === 'function') store.db.setSession({ tenantId: '', userId: '', accessMode: 'auth' });
      const out = await store.loginAsync(b.email, b.password, b.organizationId);
      if (store.db && typeof store.db.setSession === 'function' && out && (out.organizationId || out.organization?.id)) store.db.setSession({ tenantId: out.organizationId || out.organization.id, userId: out.userId || out.user?.id || '', accessMode: 'field' });
      if (url.pathname === '/api/v1/auth/mobile-login') {
        return json(res, 200, {
          user: out.user,
          userId: out.userId || out.user?.id,
          organization: out.organization,
          organizationId: out.organizationId || out.organization?.id,
          role: out.role,
          expiresAt: out.expiresAt,
          token: out.token
        }, { 'cache-control': 'no-store', 'pragma': 'no-cache' });
      }
      return json(res, 200, {
        ...out,
        token: undefined
      }, { 'set-cookie': `__Host-opscore_session=${ encodeURIComponent(out.token) }; HttpOnly; Path=/; SameSite=Strict; Secure` });
    }, req, res)).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
    const raw = sessionTokenFromRequest(req);
    return json(res, 200, store.logout(raw), { 'set-cookie': '__Host-opscore_session=; Max-Age=0; HttpOnly; Path=/; SameSite=Strict; Secure' });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/password-reset')
    return body(req).then(b => json(res, 200, store.resetPassword(b.resetToken, b.password))).catch(e => fail(res, e));
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/invitations/accept')
    return body(req).then(b => json(res, 200, store.acceptInvitation(b.inviteToken, {
      password: b.password,
      name: b.name
    }))).catch(e => fail(res, e));
  if (req.method === 'POST' && url.pathname === '/api/v1/self-scheduling/links') { const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'admin');return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'self_schedule_link_create',idempotencyKey(req),b,()=>store.createSelfScheduleLink(c,b)),201)).catch(e=>fail(res,e));}catch(e){return fail(res,e);} }
  const ssl=url.pathname.match(/^\/api\/v1\/self-scheduling\/links\/([^/]+)\/revoke$/); if(ssl&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'admin');return idemJson(res,store.idempotentWrite(c,'self_schedule_link_revoke',idempotencyKey(req),{linkId:ssl[1]},()=>store.revokeSelfScheduleLink(c,ssl[1])),200);}catch(e){return fail(res,e);}}
  // Customer portal uses a scoped bearer portal token, not an internal session.
  const portalBearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const portalCookies = parseCookies(req);
  const portalToken = portalBearer || portalCookies.__opscore_portal || null;
  if (req.method === 'POST' && url.pathname === '/api/v1/portal/exchange') {
    return body(req).then(b => {
      const out = store.exchangePortalAccess(b.token);
      const maxAge = Math.max(0, Math.floor((new Date(out.expiresAt).getTime() - Date.now()) / 1000));
      return json(res, 200, {
        ok: true,
        expiresAt: out.expiresAt
      }, {
        'set-cookie': `__opscore_portal=${ encodeURIComponent(out.token) }; HttpOnly; Path=/api/v1/portal; SameSite=Strict; Secure; Max-Age=${ maxAge }`,
        'cache-control': 'no-store'
      });
    }).catch(e => fail(res, e));
  }
  const psc=url.pathname.match(/^\/api\/v1\/portal\/self-scheduling\/([^/]+)\/candidates$/); if(psc&&req.method==='GET'){try{return json(res,200,store.selfScheduleCandidates(portalToken,psc[1]));}catch(e){return fail(res,e);}}
  const psb=url.pathname.match(/^\/api\/v1\/portal\/self-scheduling\/([^/]+)\/book$/); if(psb&&req.method==='POST'){
    // Token/link authentication is evaluated before write-protocol requirements so
    // unauthenticated portal callers receive 401 instead of IDEMPOTENCY_KEY_REQUIRED.
    try { store.selfScheduleCandidates(portalToken, psb[1]); } catch (tokenErr) {
      // FORBIDDEN on work-order mismatch still proves the token was valid; only
      // invalid/missing tokens should stop here before idempotency checks.
      if (String(tokenErr && tokenErr.message || tokenErr) === 'SELF_SCHEDULE_TOKEN_INVALID') return fail(res, tokenErr);
    }
    const k=idempotencyKey(req);if(!k)return fail(res,Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'),{status:400,code:'IDEMPOTENCY_KEY_REQUIRED'}));
    return body(req).then(b=>json(res,201,store.bookSelfSchedule(portalToken,psb[1],b,k))).catch(e=>fail(res,e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/portal/overview') {
    try {
      return json(res, 200, store.portalOverview(portalToken));
    } catch (e) {
      return fail(res, e);
    }
  }
  const portalWo = url.pathname.match(/^\/api\/v1\/portal\/work-orders\/([^/]+)$/);
  if (portalWo && req.method === 'GET')
    return json(res, 200, store.portalWorkOrder(portalToken, portalWo[1]));
  const portalAppt = url.pathname.match(/^\/api\/v1\/portal\/appointments\/([^/]+)$/);
  if (portalAppt && req.method === 'PATCH') {
    return body(req).then(b => json(res, 200, store.portalReschedule(portalToken, portalAppt[1], b.startAt, b.endAt))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    const safe = path.normalize(url.pathname || '/').replace(/^([.][.][/\\])+/, '');
    let file = path.join(webRoot, safe === '/' ? 'index.html' : safe);
    if (!file.startsWith(webRoot))
      return json(res, 400, { error: { code: 'BAD_PATH' } });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(webRoot, 'index.html');
    return sendFile(res, file, false);
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/billing/stripe/webhook') {
    return rawBody(req).then(raw => {
      verifySignature(raw.toString('utf8'), req.headers['stripe-signature'], config.stripeWebhookSecret, config.stripeWebhookToleranceSeconds);
      let event;
      try {
        event = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new Error('INVALID_JSON');
      }
      if (!event?.id || !event?.type || !event?.data?.object)
        throw new Error('INVALID_JSON');
      if (!Number.isSafeInteger(Number(event.created)) || Number(event.created) <= 0)
        throw new Error('STRIPE_EVENT_INVALID_TIMESTAMP');
      if ([
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted'
        ].includes(event.type))
        return store.applyStripeSubscription(event.id, event.type, event.data.object, Number(event.created) || 0);
      if ([
          'invoice.paid',
          'invoice.payment_failed'
        ].includes(event.type))
        return store.applyStripeInvoice(event.id, event.type, event.data.object, Number(event.created) || 0);
      return {
        ignored: true,
        eventId: event.id,
        eventType: event.type
      };
    }).then(x => json(res, 200, {
      received: true,
      ...x
    })).catch(e => fail(res, e));
  }
  const c = requireCtx(req, res);
  if (!c)
    return;
  if (c.apiKeyId) {
    const method = String(req.method || '').toUpperCase();
    requireScope(c, ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write');
  }
  const governancePath = url.pathname === '/api/v1/organization/governance' || url.pathname === '/api/v1/organization/status';
  if (c.organizationStatus && c.organizationStatus !== 'active' && !governancePath && url.pathname !== '/api/v1/me' && url.pathname !== '/api/v1/auth/logout') {
    return json(res, 423, { error: { code: c.organizationStatus === 'closed' ? 'ORGANIZATION_CLOSED' : 'ORGANIZATION_NOT_ACTIVE', status: c.organizationStatus } });
  }
  // Cross-resource write guard: viewer cannot mutate; read_only org blocks mutations.
  const method = String(req.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (isMutation && !governancePath && url.pathname !== '/api/v1/auth/logout') {
    if (c.organizationStatus === 'read_only') {
      return json(res, 423, { error: { code: 'ORGANIZATION_READ_ONLY', status: 'read_only' } });
    }
    if (!rbacCan(c.role, 'write')) {
      return json(res, 403, { error: { code: 'ROLE_WRITE_FORBIDDEN', role: c.role } });
    }
  }


  if (url.pathname === '/api/v1/_internal/tenant-context-proof' && req.method === 'GET') {
    if (process.env.VERCEL_ENV !== 'preview'
        || String(process.env.OPSC_TENANT_CONTEXT_PROOF_ENABLED || '').toLowerCase() !== 'true') {
      return json(res, 404, { error: { code: 'NOT_FOUND' } });
    }
    if (c.apiKeyId || !c.sessionId || !c.userId || !c.organizationId) {
      return json(res, 401, { error: { code: 'SESSION_AUTHENTICATION_REQUIRED' } });
    }
    if (!store.db || store.db.engine !== 'postgres'
        || typeof store.db.setVerifiedPrincipal !== 'function'
        || typeof store.db.activateVerifiedTenantContext !== 'function') {
      return json(res, 503, { error: { code: 'SIGNED_TENANT_CONTEXT_UNAVAILABLE' } });
    }

    let transactionOpen = false;
    try {
      store.db.setVerifiedPrincipal({
        sessionId: c.sessionId,
        userId: c.userId,
        tenantId: c.organizationId
      });
      store.db.exec('BEGIN READ ONLY');
      transactionOpen = true;

      const binding = store.db.activateVerifiedTenantContext();

      // Red-team tampering: the verifier must ignore these unsigned settings.
      store.db.prepare(
        "SELECT set_config('app.tenant_id', ?, true), set_config('app.user_id', ?, true), set_config('app.access_mode', ?, true)"
      ).run('attacker-selected-tenant', 'attacker-selected-user', 'backoffice');

      const contextCheck = store.db.prepare(
        "SELECT pg_backend_pid() AS backend_pid, pg_current_xact_id()::text AS transaction_id, current_setting('app.signed_context_payload', true) AS payload, current_setting('app.signed_context_signature', true) AS signature, opscore_security.verified_tenant_context() AS verified"
      ).get();
      let claims = null;
      try { claims = JSON.parse(contextCheck.payload || 'null'); } catch (_) { claims = null; }
      const signingKey = String(process.env.OPSC_TENANT_CONTEXT_HMAC_KEY || '');
      let signatureMatchesNode = false;
      try {
        const expectedMac = crypto.createHmac('sha256', Buffer.from(signingKey, 'hex')).update(contextCheck.payload, 'utf8').digest();
        const suppliedMac = Buffer.from(String(contextCheck.signature || ''), 'hex');
        signatureMatchesNode = suppliedMac.length === expectedMac.length && crypto.timingSafeEqual(suppliedMac, expectedMac);
      } catch (_) { signatureMatchesNode = false; }
      const diagnostic = {
        payloadPresent: Boolean(contextCheck.payload),
        signaturePresent: Boolean(contextCheck.signature),
        signatureMatchesNode,
        principalClaimsMatch: Boolean(claims && claims.sub === c.userId && claims.tenant_id === c.organizationId && claims.session_id === c.sessionId),
        backendMatches: Boolean(claims && Number(claims.backend_pid) === Number(contextCheck.backend_pid)),
        transactionMatches: Boolean(claims && String(claims.transaction_id) === String(contextCheck.transaction_id)),
        databaseVerifierAccepted: Boolean(contextCheck.verified)
      };

      const rows = store.db.prepare(
        'SELECT probe_value FROM opscore_security.context_probe_rows WHERE organization_id=? ORDER BY id'
      ).all(c.organizationId);

      store.db.exec('COMMIT');
      transactionOpen = false;

      const passed = rows.length === 1 && rows[0].probe_value === 'proof:' + c.organizationId;
      return json(res, passed ? 200 : 409, {
        schemaVersion: 'opscore.signed-tenant-context-preview-proof.v1',
        ok: passed,
        status: passed ? 'PASS' : 'FAIL',
        signedContextBoundToBackendAndTransaction: true,
        rawGucTamperingIgnored: passed,
        visibleProbeRows: rows.length,
        assertionExpiresAt: binding.expiresAt,
        diagnostic
      }, { 'cache-control': 'no-store' });
    } catch (error) {
      if (transactionOpen) {
        try { store.db.exec('ROLLBACK'); } catch (_) { /* worker cleanup also rolls back an open transaction */ }
      }
      warn('signed_tenant_context_preview_proof_failed', {
        errorCode: safeDatabaseErrorCode(error),
        route: '/api/v1/_internal/tenant-context-proof'
      });
      return json(res, 503, {
        error: { code: 'SIGNED_TENANT_CONTEXT_PROOF_FAILED' },
        ...(process.env.VERCEL_ENV === 'preview'
          && String(process.env.OPSC_TENANT_CONTEXT_PROOF_ENABLED || '').toLowerCase() === 'true'
          ? { diagnosticCode: safeDatabaseErrorCode(error) }
          : {})
      }, { 'cache-control': 'no-store' });
    }
  }

  // AI Contact Center: every query and mutation is explicitly tenant-scoped. Transcript bodies are
  // encrypted at rest by the service; provider calls are opt-in and fail closed when unconfigured.
  if (url.pathname === '/api/v1/contact-center/status' && req.method === 'GET') {
    try { requireScope(c, 'read'); return json(res, 200, contactCenter.status(process.env)); } catch (e) { return fail(res, e); }
  }
  if (url.pathname === '/api/v1/contact-center/languages' && req.method === 'GET') {
    try { requireScope(c, 'read'); return json(res, 200, { ...contactCenter.languageSummary(), languages: contactCenter.languages }); } catch (e) { return fail(res, e); }
  }
  if (url.pathname === '/api/v1/contact-center/conversations' && req.method === 'POST') {
    try { requireScope(c, 'write'); return body(req).then(b => json(res, 201, contactCenter.createConversation(db, c, b, process.env))).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  if (url.pathname === '/api/v1/contact-center/handoffs' && req.method === 'GET') {
    try {
      requireScope(c, 'read');
      if (c.role === 'viewer') throw Object.assign(new Error('FORBIDDEN'), { code:'FORBIDDEN' });
      return json(res, 200, { schemaVersion:'opscore.contact-center-handoffs.v1', items:contactCenter.listHandoffs(db, c, { status:url.searchParams.get('status') || 'open', limit:url.searchParams.get('limit') || 50 }) });
    } catch (e) { return fail(res, e); }
  }
  const ccConversation = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)$/);
  if (ccConversation && req.method === 'GET') {
    try {
      requireScope(c, 'read');
      if (c.role === 'viewer') throw Object.assign(new Error('FORBIDDEN'), { code:'FORBIDDEN' });
      return json(res, 200, contactCenter.getConversation(db, c, ccConversation[1], process.env, true));
    } catch (e) { return fail(res, e); }
  }
  const ccErase = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/erase$/);
  if (ccErase && req.method === 'POST') {
    try {
      requireScope(c, 'admin');
      if (!['owner','admin'].includes(c.role)) throw Object.assign(new Error('FORBIDDEN'), { code:'FORBIDDEN' });
      return body(req).then(b => json(res, 200, contactCenter.eraseConversation(db, c, ccErase[1], b.reason || 'customer_request'))).catch(e => fail(res, e));
    } catch (e) { return fail(res, e); }
  }
  const ccMessage = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/messages$/);
  if (ccMessage && req.method === 'POST') {
    try { requireScope(c, 'write'); return body(req).then(async b => json(res, 200, await contactCenter.processTextMessage(db, c, ccMessage[1], b, process.env))).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  const ccTranscript = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/transcript$/);
  if (ccTranscript && req.method === 'POST') {
    try { requireScope(c, 'write'); return body(req).then(b => json(res, 201, contactCenter.recordVoiceTranscript(db, c, ccTranscript[1], b, process.env))).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  const ccHumanReply = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/human-reply$/);
  if (ccHumanReply && req.method === 'POST') {
    try { requireScope(c, 'write'); return body(req).then(b => json(res, 201, contactCenter.postHumanReply(db, c, ccHumanReply[1], b, process.env))).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  const ccHumanRequest = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/handoff$/);
  if (ccHumanRequest && req.method === 'POST') {
    try {
      requireScope(c, 'write');
      return body(req).then(b => json(res, 201, contactCenter.createHandoff(db, c, ccHumanRequest[1], 'customer_requested_human', b.detail || 'Customer requested a human representative.', 'customer', b.priority || 'high'))).catch(e => fail(res, e));
    } catch (e) { return fail(res, e); }
  }
  const ccRealtime = url.pathname.match(/^\/api\/v1\/contact-center\/conversations\/([A-Za-z0-9_-]+)\/realtime-session$/);
  if (ccRealtime && req.method === 'POST') {
    try { requireScope(c, 'write'); return contactCenter.createRealtimeClientSecret(db, c, ccRealtime[1], process.env).then(out => json(res, 200, out, {'cache-control':'no-store','pragma':'no-cache'})).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  const ccClaim = url.pathname.match(/^\/api\/v1\/contact-center\/handoffs\/([A-Za-z0-9_-]+)\/claim$/);
  if (ccClaim && req.method === 'POST') {
    try { requireScope(c, 'write'); return json(res, 200, contactCenter.claimHandoff(db, c, ccClaim[1])); } catch (e) { return fail(res, e); }
  }
  const ccResolve = url.pathname.match(/^\/api\/v1\/contact-center\/handoffs\/([A-Za-z0-9_-]+)\/resolve$/);
  if (ccResolve && req.method === 'POST') {
    try { requireScope(c, 'write'); return body(req).then(b => json(res, 200, contactCenter.resolveHandoff(db, c, ccResolve[1], b.note || ''))).catch(e => fail(res, e)); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/organization/governance')
    return json(res, 200, store.organizationGovernance(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/organization/status') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.changeOrganizationStatus(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/me')
    return json(res, 200, {
      user: {
        id: c.userId,
        email: c.email
      },
      organization: {
        id: c.organizationId,
        name: c.organizationName
      },
      role: c.role
    });
  if (req.method === 'GET' && url.pathname === '/api/v1/security-center')
    return json(res, 200, store.securityCenter(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/operational-intelligence')
    return json(res, 200, store.operationalIntelligence(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/audit/verify')
    return json(res, 200, store.auditChainVerification(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/security/authorization-decisions') {
    try { return json(res, 200, store.authorizationDecisions(c, url.searchParams.get('limit'))); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/security/integrity-graph') {
    try { return json(res, 200, store.crossModuleIntegrity(c)); } catch (e) { return fail(res, e); }
  }
  const opEnv = url.pathname.match(/^\/api\/v1\/operation-envelopes\/([^/]+)$/);
  if (req.method === 'GET' && opEnv) {
    try { return json(res, 200, store.operationEnvelope(c, decodeURIComponent(opEnv[1])), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/configs')
    return json(res, 200, store.listConfigVersions(c, url.searchParams.get('key')));
  if (req.method === 'POST' && url.pathname === '/api/v1/configs') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createConfigVersion(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/configuration-changes')
    return json(res, 200, store.listConfigChanges(c, url.searchParams.get('key'), url.searchParams.get('limit')));
  if (req.method === 'POST' && url.pathname === '/api/v1/configs/activate') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.activateConfigVersion(c, b.id))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/compliance/export') { const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'admin');return json(res,200,store.complianceExport(c));}catch(e){return fail(res,e);} }
  if (req.method === 'GET' && url.pathname === '/api/v1/observability/performance')
    return json(res, 200, store.performanceSnapshot(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/operations/daily-brief')
    return json(res, 200, store.dailyOperationsBrief(c, url.searchParams.get('date')));
  if (req.method === 'GET' && url.pathname === '/api/v1/operations/cockpit')
    return json(res, 200, store.operationsCockpit(c, url.searchParams.get('date')));
  if (req.method === 'GET' && url.pathname === '/api/v1/value-intelligence')
    return json(res, 200, store.valueIntelligence(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/control-tower')
    return json(res, 200, store.controlTower(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/decision-engine')
    return json(res, 200, store.decisionEngine(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/control-tower/actions') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.executeControlAction(c, b), { 'x-correlation-id': correlationId })).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/financial-settings')
    return json(res, 200, store.getFinancialSettings(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/estimates')
    return json(res, 200, store.listEstimates(c, url.searchParams.get('status')));
  if (req.method === 'POST' && url.pathname === '/api/v1/estimates') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createEstimate(c, b))).catch(e => fail(res, e));
  }
  const eg = url.pathname.match(/^\/api\/v1\/estimates\/([^/]+)$/);
  if (eg && req.method === 'GET')
    return json(res, 200, store.getEstimate(c, eg[1]));
  const es = url.pathname.match(/^\/api\/v1\/estimates\/([^/]+)\/status$/);
  if (es && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.updateEstimateStatus(c, es[1], b.status))).catch(e => fail(res, e));
  }
  const ew = url.pathname.match(/^\/api\/v1\/estimates\/([^/]+)\/convert-to-work-order$/);
  if (ew && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.convertEstimateToWorkOrder(c, ew[1], b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/invoices')
    return json(res, 200, store.listInvoices(c, url.searchParams.get('status')));
  if (req.method === 'POST' && url.pathname === '/api/v1/invoices') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createInvoice(c, b))).catch(e => fail(res, e));
  }
  const ig = url.pathname.match(/^\/api\/v1\/invoices\/([^/]+)$/);
  if (ig && req.method === 'GET')
    return json(res, 200, store.getInvoice(c, ig[1]));
  const is = url.pathname.match(/^\/api\/v1\/invoices\/([^/]+)\/status$/);
  if (is && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.updateInvoiceStatus(c, is[1], b.status))).catch(e => fail(res, e));
  }
  const ip = url.pathname.match(/^\/api\/v1\/invoices\/([^/]+)\/payments$/);
  if (ip && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => idemJson(res, store.idempotentWrite(c, 'invoice_payment', idempotencyKey(req), { invoiceId: ip[1], amount: b.amount }, () => store.recordInvoicePayment(c, ip[1], b.amount, { source: 'local_manual', idempotencyKey: idempotencyKey(req) })), 201)).catch(e => fail(res, e));
  }
  // REQ-02 PDF downloads (binary)
  const epdf = url.pathname.match(/^\/api\/v1\/estimates\/([^/]+)\/pdf$/);
  if (epdf && req.method === 'GET') {
    try {
      requireScope(c, 'read');
      const out = store.renderEstimatePdf(c, epdf[1]);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${out.fileName}"`,
        'x-opscore-pdf-sha256': out.sha256,
        'cache-control': 'no-store'
      });
      return res.end(out.buffer);
    } catch (e) { return fail(res, e); }
  }
  const ipdf = url.pathname.match(/^\/api\/v1\/invoices\/([^/]+)\/pdf$/);
  if (ipdf && req.method === 'GET') {
    try {
      requireScope(c, 'read');
      const out = store.renderInvoicePdf(c, ipdf[1]);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${out.fileName}"`,
        'x-opscore-pdf-sha256': out.sha256,
        'cache-control': 'no-store'
      });
      return res.end(out.buffer);
    } catch (e) { return fail(res, e); }
  }
  const cpdf = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/completion\.pdf$/);
  if (cpdf && req.method === 'GET') {
    try {
      requireScope(c, 'read');
      const out = store.renderCompletionPdf(c, cpdf[1]);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${out.fileName}"`,
        'x-opscore-pdf-sha256': out.sha256,
        'cache-control': 'no-store'
      });
      return res.end(out.buffer);
    } catch (e) { return fail(res, e); }
  }

  if (req.method === 'PUT' && url.pathname === '/api/v1/financial-settings') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.setFinancialSettings(c, b))).catch(e => fail(res, e));
  }
  const wfin = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/financials$/);
  if (wfin && req.method === 'PUT') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.setWorkOrderFinancials(c, wfin[1], b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/contracts')
    return json(res, 200, store.listContracts(c, url.searchParams.get('customerId')));
  if (req.method === 'POST' && url.pathname === '/api/v1/contracts') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createContract(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/warranties')
    return json(res, 200, store.listWarranties(c, url.searchParams.get('assetId')));
  if (req.method === 'POST' && url.pathname === '/api/v1/warranties') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createWarranty(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/maintenance-plans')
    return json(res, 200, store.listMaintenancePlans(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/maintenance-plans') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createMaintenancePlan(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/maintenance/evaluate') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    try {
      return json(res, 200, store.idempotentWrite(c, 'maintenance_evaluate', k, {}, () => store.evaluateMaintenance(c)).payload);
    } catch (e) {
      return fail(res, e);
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/safety-checklists')
    return json(res, 200, store.listSafetyChecklists(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/safety-checklists') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createSafetyChecklist(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/safety-acknowledgements') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 201, store.idempotentWrite(c, 'safety_acknowledgement', k, b, () => store.acknowledgeSafety(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/completion-policies')
    return json(res, 200, store.getCompletionPolicies(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/completion-policies') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createCompletionPolicy(c, b))).catch(e => fail(res, e));
  }
  const cpv = url.pathname.match(/^\/api\/v1\/completion-policies\/([^/]+)\/versions$/);
  if (cpv && req.method === 'GET')
    return json(res, 200, store.listCompletionPolicyVersions(c, cpv[1]));
  const cpp = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/completion-assurance\/preview$/);
  if (cpp && req.method === 'POST') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.previewCompletionPolicy(c, cpp[1], b))).catch(e => fail(res, e));
  }
  
  const wo_why_blocked = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/why-blocked$/);
  if (req.method === 'GET' && wo_why_blocked) {
    try { return sendWorkOrderRead(req, res, c, () => store.whyBlocked(c, decodeURIComponent(wo_why_blocked[1])), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }

  
  const wo_changelog = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/changelog$/);
  if (req.method === 'GET' && wo_changelog) {
    try { return sendWorkOrderRead(req, res, c, () => store.workOrderReadableChangelog(c, decodeURIComponent(wo_changelog[1])), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }

  
  const wo_verified_job_record = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/verified-job-record$/);
  if (req.method === 'GET' && wo_verified_job_record) {
    try { return sendWorkOrderRead(req, res, c, () => store.verifiedJobRecord(c, decodeURIComponent(wo_verified_job_record[1])), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }

  
  const apptReschedule = url.pathname.match(/^\/api\/v1\/appointments\/([^/]+)\/reschedule$/);
  if (req.method === 'POST' && apptReschedule) {
    try {
      return body(req).then((b) => {
        const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
        const record = store.idempotentWrite(c, 'appointment_reschedule', key, b, () => store.rescheduleAppointment(c, decodeURIComponent(apptReschedule[1]), b));
        return json(res, 200, record.payload, {
          'x-correlation-id': correlationId,
          'x-idempotency-replayed': record.__idempotent ? 'true' : 'false'
        });
      }).catch((e) => fail(res, e));
    } catch (e) { return fail(res, e); }
  }
  const woPack = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/work-pack$/);
  if (req.method === 'GET' && woPack) {
    try { return sendWorkOrderRead(req, res, c, () => store.technicianWorkPack(c, decodeURIComponent(woPack[1])), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }

  const ca = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/completion-assurance$/);
  if (ca && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.completionAssurance(c, ca[1]));
  if (req.method === 'GET' && url.pathname === '/api/v1/workflows')
    return json(res, 200, store.listWorkflows(c));
  const wfv = url.pathname.match(/^\/api\/v1\/workflows\/([^/]+)\/versions$/);
  if (wfv && req.method === 'GET')
    return json(res, 200, store.listWorkflowVersions(c, wfv[1]));
  const wfp = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/workflow-transition-preview$/);
  if (wfp && req.method === 'POST') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.previewWorkflowTransition(c, wfp[1], b.toStatus))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/workflows') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createWorkflow(c, b))).catch(e => fail(res, e));
  }
  const wtrans = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/transition$/);
  if (wtrans && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const write = () => store.idempotentWrite(c, 'work_order_transition', idempotencyKey(req), {
        workOrderId: wtrans[1],
        toStatus: b.toStatus,
        reason: b.reason
      }, () => store.transitionWorkOrder(c, wtrans[1], b.toStatus, b.reason));
      if (!signedWorkOrdersWriteEnabled(req)) return idemJson(res, write(), 200);
      return runSignedWorkOrderWrite(res, c, write, (record, headers) => idemJson(res, record, 200, headers));
    }).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/escalations')
    return json(res, 200, store.listEscalations(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/escalations/evaluate') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    try {
      return json(res, 200, store.idempotentWrite(c, 'escalations_evaluate', k, {}, () => store.evaluateEscalations(c)).payload);
    } catch (e) {
      return fail(res, e);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/escalation-rules') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createEscalationRule(c, b))).catch(e => fail(res, e));
  }
  const esc = url.pathname.match(/^\/api\/v1\/escalations\/([^/]+)\/(acknowledge|resolve)$/);
  if (esc && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, esc[2] === 'acknowledge' ? store.acknowledgeEscalation(c, esc[1]) : store.resolveEscalation(c, esc[1]));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/procedures')
    return json(res, 200, store.listProcedures(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/procedures') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createProcedure(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/procedure-runs') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.startProcedure(c, b))).catch(e => fail(res, e));
  }
  const pr = url.pathname.match(/^\/api\/v1\/procedure-runs\/([^/]+)\/steps$/);
  if (pr && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.completeProcedureStep(c, pr[1], b))).catch(e => fail(res, e));
  }
  const hist = url.pathname.match(/^\/api\/v1\/service-history\/(customer|site|asset|work_order)\/([^/]+)$/);
  if (hist && req.method === 'GET')
    return json(res, 200, store.serviceHistory(c, hist[1], hist[2]));
  if (req.method === 'GET' && url.pathname === '/api/v1/sessions')
    return json(res, 200, store.listSessions(c));
  const sr = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (sr && req.method === 'DELETE') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.revokeSession(c, sr[1]));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/api-keys')
    return json(res, 200, store.listApiKeys(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/api-keys') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createApiKey(c, b))).catch(e => fail(res, e));
  }
  const kr = url.pathname.match(/^\/api\/v1\/api-keys\/([^/]+)$/);
  if (kr && req.method === 'DELETE') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.revokeApiKey(c, kr[1]));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/billing/stripe') {
    if (!c)
      return requireCtx(req, res);
    return json(res, 200, store.stripeBilling(c));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/billing/stripe/link') {
    if (!c)
      return requireCtx(req, res);
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.linkStripeCustomer(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/entitlements')
    return json(res, 200, store.getEntitlements(c));
  if (req.method === 'PUT' && url.pathname === '/api/v1/entitlements') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.setEntitlements(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/usage')
    return json(res, 200, store.usage(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/usage') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.incrementUsage(c, b.metric, b.quantity))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/custom-fields')
    return json(res, 200, store.listCustomFields(c, url.searchParams.get('entityType') || 'work_order'));
  if (req.method === 'POST' && url.pathname === '/api/v1/custom-fields') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createCustomField(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/saved-views')
    return json(res, 200, store.listSavedViews(c, url.searchParams.get('entityType') || 'work_orders'));
  if (req.method === 'POST' && url.pathname === '/api/v1/saved-views') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createSavedView(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/admin/password-reset') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createPasswordReset(c, b.userId))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/technicians')
    return json(res, 200, store.listTechnicians(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/technicians') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.upsertTechnician(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/technicians/skills') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.addTechnicianSkill(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/technicians/skills')
    return json(res, 200, store.listSkills(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/sla-policies')
    return json(res, 200, store.listSlaPolicies(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/sla-policies') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createSlaPolicy(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/sla-risks')
    return json(res, 200, store.listSlaRisks(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/business-calendars')
    return json(res, 200, store.listBusinessCalendars(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/business-calendars') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createBusinessCalendar(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/business-calendars/exceptions') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.addBusinessCalendarException(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/business-due-at') {
    try {
      requireScope(c, 'read');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.businessDueAt(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/field/today')
    return json(res, 200, store.fieldToday(c, url.searchParams.get('date')));
  if (req.method === 'GET' && url.pathname === '/api/v1/dispatch-board') {
    return json(res, 200, store.dispatchBoard(c, url.searchParams.get('date')));
  }
    if (req.method === 'POST' && url.pathname === '/api/v1/demo/closeout-path') {
      if (process.env.OPSCORE_ENABLE_DEMO_RUNTIME !== 'true') return fail(res, Object.assign(new Error('DEMO_RUNTIME_DISABLED'), {status:404}));
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    try { return json(res, 201, store.runDemoCloseoutPath(c)); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/dispatcher-map') {
    try { return json(res, 200, store.dispatcherMap(c)); } catch (e) { return fail(res, e); }
  }
    
  if (req.method === 'GET' && url.pathname === '/api/v1/daily-planning-board') {
    try { return json(res, 200, store.dailyPlanningBoard(c, url.searchParams.get('date')), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/dispatcher-map/v2') {
    try { return json(res, 200, store.dispatcherMapWithSiteDistance(c), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/pm-templates') {
    try { return json(res, 200, store.listPreventiveMaintenanceTemplates(c), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/intelligence/status') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return json(res,200,intelligenceStatus()); }
  const ipred = url.pathname.match(/^\/api\/v1\/intelligence\/work-orders\/([^/]+)\/predict$/);
  if (ipred && req.method === 'POST') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return predictWorkOrder(store,c,ipred[1]).then(out=>json(res,200,out)).catch(e=>fail(res,e)); }
    if (req.method === 'GET' && url.pathname === '/api/v1/ai/status') {
    const c = requireCtx(req,res); if (!c) return; requireScope(c,'read'); return json(res,200,aiStatus());
  }
  const aiw = url.pathname.match(/^\/api\/v1\/ai\/work-orders\/([^/]+)\/summary$/);
  if (aiw && req.method === 'POST') {
    const c=requireCtx(req,res); if(!c)return; requireScope(c,'read');
    try { store.consumeRateLimit(c, 'ai:summary', Number(process.env.AI_SUMMARY_PER_MINUTE || 5)); } catch (e) { return fail(res,e); }
    return openaiSummary(store.aiWorkOrderContext(c,aiw[1])).then(out=>{ const auditResult=auditSafeAi(store,c,aiw[1],out); return json(res,200,{...out,audit:auditResult},{ 'x-ai-context-sha256': out.grounding?.contextHashSha256 || '' }); }).catch(e=>fail(res,e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/sync/conflicts') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return json(res,200,store.listSyncConflicts(c,url.searchParams.get('status'))); }
  const sc = url.pathname.match(/^\/api\/v1\/sync\/conflicts\/([^/]+)\/resolve$/);
  if (sc && req.method === 'POST') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write'); return body(req).then(b=>json(res,200,store.resolveSyncConflict(c,sc[1],b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/time-entries') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return json(res,200,store.technicianTimeEntries(c,{workOrderId:url.searchParams.get('workOrderId')||null,technicianId:url.searchParams.get('technicianId')||null,status:url.searchParams.get('status')||null})); }
  if (req.method === 'POST' && url.pathname === '/api/v1/time-entries/start') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write'); return body(req).then(b=>{const r=store.startTimeEntry(c,b);return json(res,201,r)}).catch(e=>fail(res,e)); }
  const stopTime = url.pathname.match(/^\/api\/v1\/time-entries\/([^/]+)\/stop$/);
  if (stopTime && req.method === 'POST') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write'); return body(req).then(b=>json(res,200,store.stopTimeEntry(c,stopTime[1],b))).catch(e=>fail(res,e)); }
  const wtime = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/time-summary$/);
  if (wtime && req.method === 'GET') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return sendWorkOrderRead(req,res,c,()=>store.workOrderTimeSummary(c,wtime[1])); }

  if (req.method === 'GET' && url.pathname === '/api/v1/search') {
    try { return json(res, 200, store.unifiedSearch(c, url.searchParams.get('q') || ''), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
if (req.method === 'GET' && url.pathname === '/api/v1/operations-health') {
    try { return json(res, 200, store.operationsHealthCenter(c), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/control-plane') {
    try { return json(res, 200, store.controlPlaneSnapshot(c), { 'x-correlation-id': correlationId }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/control-plane/feature-flags') {
    try { requireScope(c, 'read'); return json(res, 200, { schemaVersion: 'opscore.feature-flags.v1', flags: store.listFeatureFlags(c) }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/control-plane/feature-flags') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.setFeatureFlag(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/control-plane/safe-mode') {
    try { requireScope(c, 'read'); return json(res, 200, store.getSafeMode(c)); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/control-plane/safe-mode') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.setSafeMode(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/control-plane/recovery-bundle') {
    try { requireScope(c, 'admin'); const bundle = store.createRecoveryBundle(c, Number(url.searchParams.get('maxRows') || 5000)); return json(res, 200, bundle, { 'content-disposition': 'attachment; filename=opscore-recovery-bundle.json' }); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/control-plane/recovery-bundle/verify') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.verifyRecoveryBundle(c, b.bundle || b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/outbox/event-catalog') {
    try { return json(res, 200, store.outboxEventCatalog(c)); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/commands/execute') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return body(req).then(b=>json(res,200,store.executeSlashCommand(c,b.command))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/commands') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return json(res,200,{schemaVersion:'opscore.slash-command-catalog.v1',commands:Object.keys(SLASH_COMMANDS)}); }
  if (req.method === 'POST' && url.pathname === '/api/v1/agent-memory') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write'); return body(req).then(b=>json(res,201,store.storeAgentMemory(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/agent-memory') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return json(res,200,store.listAgentMemories(c,{subjectType:url.searchParams.get('subjectType'),subjectId:url.searchParams.get('subjectId')})); }
  if (req.method === 'GET' && url.pathname === '/api/v1/custom-domains/resolve') {
    try {
      const hostname=url.searchParams.get('hostname')||req.headers.host||'';
      const hit=store.resolveTenantByHost(hostname.split(':')[0]);
      const authenticated=ctx(req);
      const sameTenant=authenticated && hit && authenticated.organizationId===hit.organization_id;
      return json(res,200,{schemaVersion:'opscore.custom-domain-resolution.v2',resolved:Boolean(hit),tenant:sameTenant?hit:null});
    } catch(e){ return fail(res,e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/custom-domains') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'admin'); return json(res,200,{schemaVersion:'opscore.custom-domains.v1',items:store.listTenantDomains(c)}); }
  if (req.method === 'POST' && url.pathname === '/api/v1/custom-domains') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'admin'); return body(req).then(b=>json(res,201,store.registerTenantDomain(c,b))).catch(e=>fail(res,e)); }
  const dv=url.pathname.match(/^\/api\/v1\/custom-domains\/([^/]+)\/verify$/); if(dv&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;requireScope(c,'admin');return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'custom_domain_verify',idempotencyKey(req),{domainId:dv[1],token:b.token},()=>store.verifyTenantDomain(c,dv[1],b.token)),200)).catch(e=>fail(res,e));}
  const da=url.pathname.match(/^\/api\/v1\/custom-domains\/([^/]+)\/activate$/); if(da&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;requireScope(c,'admin');try{return idemJson(res,store.idempotentWrite(c,'custom_domain_activate',idempotencyKey(req),{domainId:da[1]},()=>store.activateTenantDomain(c,da[1])),200)}catch(e){return fail(res,e)}}
  if (req.method === 'GET' && url.pathname === '/api/v1/notification-providers') {
    try { return json(res, 200, store.notificationProviderStatus(c)); } catch (e) { return fail(res, e); }
  }
  const ndel = url.pathname.match(/^\/api\/v1\/notifications\/([^/]+)\/deliver$/);
  if (ndel && req.method === 'POST') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(async b => {
      try {
        const out = await store.deliverNotificationExternal(c, ndel[1], b);
        return json(res, 200, out);
      } catch (e) { return fail(res, e); }
    }).catch(e => fail(res, e));
  }

  // Platform Intelligence Layer: multidomain operational twin, persisted snapshots and independent integrity checks.
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/twin/integrity') { const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'read');return json(res,200,store.verifyPlatformTwinChain(c));}catch(e){return fail(res,e);} }
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/twin/snapshots') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,store.listPlatformTwinSnapshots(c,{limit:url.searchParams.get('limit')||20,beforeCreatedAt:url.searchParams.get('beforeCreatedAt')||undefined,beforeId:url.searchParams.get('beforeId')||undefined}));}catch(e){return fail(res,e);} }
  if (req.method === 'POST' && url.pathname === '/api/v1/platform/twin/snapshots') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'platform_twin_snapshot',idempotencyKey(req),b,()=>{const snapshot=store.platformTwin(c,{persist:true});return{...snapshot,integrity:store.verifyPlatformTwinSnapshot(c,snapshot.snapshotId)};}),201)).catch(e=>fail(res,e)); }
  const twinVerify=url.pathname.match(/^\/api\/v1\/platform\/twin\/snapshots\/([^/]+)\/verify$/); if(twinVerify&&req.method==='GET'){const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'read');return json(res,200,store.verifyPlatformTwinSnapshot(c,decodeURIComponent(twinVerify[1])));}catch(e){return fail(res,e);}}
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/twin') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,store.platformTwin(c,{persist:false}));}catch(e){return fail(res,e);} }
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/recommendations') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,store.platformRecommendations(c));}catch(e){return fail(res,e);} }
  if (req.method === 'POST' && url.pathname === '/api/v1/platform/decisions') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,201,store.recordPlatformDecision(c,b))).catch(e=>fail(res,e)); }
  const dr=url.pathname.match(/^\/api\/v1\/platform\/decisions\/([^/]+)\/replay$/); if(dr&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'write');return idemJson(res,store.idempotentWrite(c,'platform_decision_replay',idempotencyKey(req),{decisionId:dr[1]},()=>store.replayPlatformDecision(c,dr[1])),200);}catch(e){return fail(res,e);}}
  if (req.method === 'POST' && url.pathname === '/api/v1/platform/scenarios') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,201,store.simulatePlatformScenario(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/capacity') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,store.platformCapacity(c,{date:url.searchParams.get('date')||undefined,dailyHoursPerTechnician:url.searchParams.get('dailyHoursPerTechnician')||undefined}));}catch(e){return fail(res,e);} }
  if (req.method === 'GET' && url.pathname === '/api/v1/platform/skills/certifications') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,store.listSkillCertifications(c,url.searchParams.get('userId')||null));}catch(e){return fail(res,e);} }
  if (req.method === 'POST' && url.pathname === '/api/v1/platform/skills/certifications') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'admin');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,201,store.registerSkillCertification(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'POST' && url.pathname === '/api/v1/platform/skills/match') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,200,store.matchPlatformSkills(c,b))).catch(e=>fail(res,e)); }
  // Governed Operational Autopilot: incident replay, decision memory, proposal/approval/execute workflow.
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/incidents/replay') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,201,store.createIncidentReplay(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/incidents/replay') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,{schemaVersion:'opscore.incident-replay.catalog.v1',items:store.listIncidentReplays(c,url.searchParams.get('limit')||20)});}catch(e){return fail(res,e);} }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/decision-memory/build') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,200,store.buildDecisionMemory(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/decision-memory') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,{schemaVersion:'opscore.decision-memory.v1',items:store.searchDecisionMemory(c,{query:url.searchParams.get('q')||'',limit:url.searchParams.get('limit')||50})});}catch(e){return fail(res,e);} }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/proposals/generate') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'write');}catch(e){return fail(res,e);} return body(req).then(b=>json(res,201,store.generateAutopilotProposals(c,b))).catch(e=>fail(res,e)); }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/proposals') { const c=requireCtx(req,res); if(!c)return; try{requireScope(c,'read');return json(res,200,{schemaVersion:'opscore.autopilot.v1',items:store.listAutopilotProposals(c,{status:url.searchParams.get('status')||'',limit:url.searchParams.get('limit')||50})});}catch(e){return fail(res,e);} }
  const ap=url.pathname.match(/^\/api\/v1\/autopilot\/proposals\/([^/]+)\/(approve|reject|execute)$/); if(ap&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;try{requireScope(c,ap[2]==='execute'?'admin':'write');}catch(e){return fail(res,e);}if(ap[2]==='approve')return idemJson(res,store.idempotentWrite(c,'autopilot_proposal_approve',idempotencyKey(req),{proposalId:ap[1]},()=>store.approveAutopilotProposal(c,ap[1])),200);if(ap[2]==='reject')return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'autopilot_proposal_reject',idempotencyKey(req),{proposalId:ap[1],reason:b.reason},()=>store.rejectAutopilotProposal(c,ap[1],b.reason)),200)).catch(e=>fail(res,e));try{return idemJson(res,store.idempotentWrite(c,'autopilot_proposal_execute',idempotencyKey(req),{proposalId:ap[1]},()=>store.executeAutopilotProposal(c,ap[1])),200)}catch(e){return fail(res,e);}}

  // Operational Intelligence Fabric: deterministic simulation, evidence graph, guardrails and outcome learning.
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/evidence-center') {
    const c=requireCtx(req,res);if(!c)return; try{requireScope(c,'read');return json(res,200,store.getOperationalEvidenceCenter(c,{incidentRef:url.searchParams.get('incidentRef')||'',limit:url.searchParams.get('limit')||100}));}catch(e){return fail(res,e);}
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/replay-package') {
    const c=requireCtx(req,res);if(!c)return; try{requireScope(c,'read');return body(req).then(b=>json(res,200,store.exportOperationalReplayPackage(c,b))).catch(e=>fail(res,e));}catch(e){return fail(res,e);}
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/evidence-integrity') {
    const c=requireCtx(req,res);if(!c)return; try{requireScope(c,'read');return json(res,200,store.verifyOperationalEvidence(c,{limit:url.searchParams.get('limit')||50}));}catch(e){return fail(res,e);}
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/safety-contract') {
    const c=requireCtx(req,res);if(!c)return; try{requireScope(c,'read');return json(res,200,store.evaluateAutopilotSafetyContract(c,{limit:url.searchParams.get('limit')||100}));}catch(e){return fail(res,e);}
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/simulations') {
    if (process.env.OPSCORE_ENABLE_SIMULATION_RUNTIME !== 'true') return fail(res, Object.assign(new Error('SIMULATION_RUNTIME_DISABLED'), {status:404}));
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'write');}catch(e){return fail(res,e);}
    return body(req).then(b=>json(res,200,store.simulateOperationalScenario(c,b))).catch(e=>fail(res,e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/evidence-graph') {
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'read');}catch(e){return fail(res,e);}
    return body(req).then(b=>json(res,200,store.buildCausalEvidenceGraph(c,b))).catch(e=>fail(res,e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/guardrails') {
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'read');return json(res,200,{schemaVersion:'opscore.guardrail-catalog.v1',items:store.listGuardrailPolicies(c)});}catch(e){return fail(res,e);}
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/guardrails') {
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'admin');}catch(e){return fail(res,e);}
    return body(req).then(b=>json(res,200,store.setGuardrailPolicy(c,b))).catch(e=>fail(res,e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/autopilot/learning') {
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'read');return json(res,200,store.learningLoop(c,{actionType:url.searchParams.get('actionType')||'',limit:url.searchParams.get('limit')||100}));}catch(e){return fail(res,e);}
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/autopilot/outcomes') {
    const c=requireCtx(req,res);if(!c)return;
    try{requireScope(c,'write');}catch(e){return fail(res,e);}
    return body(req).then(b=>json(res,201,store.recordAutopilotOutcome(c,b))).catch(e=>fail(res,e));
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/technicians/availability') {
    try {
      requireScope(c, 'read');
      return json(res, 200, store.findTechnicianAvailability(c, {
        technicianId: url.searchParams.get('technicianId'),
        date: url.searchParams.get('date') || undefined,
        windowStartHour: url.searchParams.get('windowStartHour') || undefined,
        windowEndHour: url.searchParams.get('windowEndHour') || undefined,
        slotMinutes: url.searchParams.get('slotMinutes') || undefined
      }));
    } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/appointments')
    return json(res, 200, store.listAppointments(c, {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      technicianId: url.searchParams.get('technicianId')
    }));
  if (req.method === 'POST' && url.pathname === '/api/v1/appointments') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 201, store.idempotentWrite(c, 'appointment_create', k, b, () => store.createAppointment(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  const aw = url.pathname.match(/^\/api\/v1\/appointments\/([^/]+)\/on-my-way$/);
  if (aw && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    return json(res, 200, store.idempotentWrite(c, 'appointment_on_my_way', k, {}, () => store.onMyWay(c, aw[1])).payload);
  }
  const aun = url.pathname.match(/^\/api\/v1\/appointments\/([^/]+)\/unreachable$/);
  if (req.method === 'POST' && aun) {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 200, store.idempotentWrite(c, 'appointment_unreachable', k, { appointmentId: aun[1], ...b }, () => store.markAppointmentUnreachable(c, decodeURIComponent(aun[1]), b)).payload);
    }).catch(e => fail(res, e));
  }
  const apt = url.pathname.match(/^\/api\/v1\/appointments\/([^/]+)$/);
  if (apt && req.method === 'GET')
    return json(res, 200, store.getAppointment(c, apt[1]));
  if (apt && req.method === 'PATCH') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 200, store.idempotentWrite(c, 'appointment_update', k, b, () => store.updateAppointment(c, apt[1], b)).payload);
    }).catch(e => fail(res, e));
  }
  const cand = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/dispatch-candidates$/);
  if (cand && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.dispatchCandidates(c, cand[1]));
  if (req.method === 'POST' && url.pathname === '/api/v1/scheduling/conflicts/analyze') {
    try { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read');
      return body(req).then(b=>json(res,200,schedulingConflictAnalysis(store,c,b))).catch(e=>fail(res,e));
    } catch(e){ return fail(res,e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/scheduling/conflicts/candidates') {
    try { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read');
      return body(req).then(b=>json(res,200,candidateSlots(store,c,b))).catch(e=>fail(res,e));
    } catch(e){ return fail(res,e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/routes/osrm') {
    try { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read');
      return body(req).then(b=>osrmRoute(b,c).then(out=>json(res,200,out))).catch(e=>fail(res,e));
    } catch(e){ return fail(res,e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/invoices/stripe/payment-intent') {
    try { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write');
      const key=String(req.headers['idempotency-key']||req.headers['x-idempotency-key']||'');
      return body(req).then(b=>createStripePaymentIntent(store,c,b.invoiceId,key).then(out=>json(res,200,out))).catch(e=>fail(res,e));
    } catch(e){ return fail(res,e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/route-plan') {
    try {
      requireScope(c, 'read');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.routePlan(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/inventory')
    return json(res, 200, store.listInventory(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/inventory/ledger') {
    try {
      requireScope(c, 'read');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.inventoryLedger(c, {
      partId: url.searchParams.get('partId'),
      locationId: url.searchParams.get('locationId'),
      workOrderId: url.searchParams.get('workOrderId')
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/inventory/ledger/adjust') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 201, store.idempotentWrite(c, 'inventory_ledger_adjust', k, b, () => store.recordInventoryLedger(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/inventory/locations') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createPartsLocation(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/inventory/parts') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createPart(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/inventory/receive') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.receiveStock(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/work-order-parts/reserve') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 201, store.idempotentWrite(c, 'part_reserve', k, b, () => store.reservePart(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  const wpart = url.pathname.match(/^\/api\/v1\/work-order-parts\/([^/]+)\/consume$/);
  if (wpart && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    return json(res, 200, store.idempotentWrite(c, 'part_consume', k, { workOrderPartId: wpart[1] }, () => store.consumePart(c, wpart[1])).payload);
  }
  const wparts = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/parts$/);
  if (wparts && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.listWorkOrderParts(c, wparts[1]));
  if (req.method === 'POST' && url.pathname === '/api/v1/portal/access') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createPortalAccess(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/work-order-signoffs') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      return json(res, 201, store.idempotentWrite(c, 'customer_signoff', k, b, () => store.customerSignoff(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  const sign = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/signoffs$/);
  if (sign && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.listSignoffs(c, sign[1]));
  if (req.method === 'POST' && url.pathname === '/api/v1/sync') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const block = b?.block && typeof b.block === 'object' ? b.block : b;
      const events = Array.isArray(block?.events) ? block.events : [];
      return json(res, 200, store.applySyncEvents(c, events, block));
    }).catch(e => fail(res, e));
  }
  const del = url.pathname.match(/^\/api\/v1\/(customers|sites|work-orders|assets)\/([^/]+)$/);
  if (del && req.method === 'DELETE') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const et = {
      customers: 'customer',
      sites: 'site',
      'work-orders': 'work_order',
      assets: 'asset'
    }[del[1]];
    if (del[1] === 'work-orders' && signedWorkOrdersWriteEnabled(req)) {
      return runSignedWorkOrderWrite(res, c,
        () => store.softDelete(c, 'work_order', del[2]),
        (result, headers) => json(res, 200, result, headers));
    }
    return json(res, 200, store.softDelete(c, et, del[2]));
  }
  const rest = url.pathname.match(/^\/api\/v1\/(customers|sites|work-orders|assets)\/([^/]+)\/restore$/);
  if (rest && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    const et = {
      customers: 'customer',
      sites: 'site',
      'work-orders': 'work_order',
      assets: 'asset'
    }[rest[1]];
    if (rest[1] === 'work-orders' && signedWorkOrdersWriteEnabled(req)) {
      return runSignedWorkOrderWrite(res, c,
        () => store.restore(c, 'work_order', rest[2]),
        (result, headers) => json(res, 200, result, headers));
    }
    return json(res, 200, store.restore(c, et, rest[2]));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/deleted') {
    return json(res, 200, {
      customers: store.deleted(c, 'customer'),
      sites: store.deleted(c, 'site'),
      workOrders: store.deleted(c, 'work_order'),
      assets: store.deleted(c, 'asset')
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/client-contract') {
    const requested = url.searchParams.get('mobileVersion');
    const contract = store.clientContract(c, requested);
    if (requested && !contract.compatibility.compatible)
      return json(res, 409, {
        error: {
          code: 'CLIENT_CONTRACT_MISMATCH',
          reasons: [{
              code: contract.compatibility.reason,
              severity: 'blocking'
            }]
        },
        compatibility: contract.compatibility
      });
    return json(res, 200, contract);
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/metrics')
    return json(res, 200, store.metrics(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/observability')
    return json(res, 200, store.runtimeObservability(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/outbox')
    return json(res, 200, store.listOutbox(c, url.searchParams.get('limit')));
  const ob = url.pathname.match(/^\/api\/v1\/outbox\/([^/]+)\/claim$/);
  if (ob && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.claimOutbox(c, ob[1]));
  }
  const oc = url.pathname.match(/^\/api\/v1\/outbox\/([^/]+)\/complete$/);
  if (oc && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.completeOutbox(c, oc[1], b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/members')
    return json(res, 200, store.listMembers(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/invitations') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.inviteMember(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/customers')
    return json(res, 200, store.listCustomers(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/customers') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createCustomer(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/sites')
    return json(res, 200, store.listSites(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/sites') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createSite(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/faults/classify') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.classifyFaultInfrastructure(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/faults') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 201, store.idempotentWrite(c, 'fault_ticket_create', k, b, () => store.createFaultTicket(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  const ftrans = url.pathname.match(/^\/api\/v1\/faults\/([^/]+)\/transition$/);
  if (ftrans && req.method === 'POST') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 200, store.idempotentWrite(c, 'fault_status_transition', k, { workOrderId: ftrans[1], ...b }, () => store.transitionFaultStatus(c, decodeURIComponent(ftrans[1]), b)).payload);
    }).catch(e => fail(res, e));
  }
  const funr = url.pathname.match(/^\/api\/v1\/faults\/([^/]+)\/unreachable$/);
  if (funr && req.method === 'POST') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 200, store.idempotentWrite(c, 'fault_unreachable', k, { workOrderId: funr[1], ...b }, () => store.markFaultUnreachable(c, decodeURIComponent(funr[1]), b)).payload);
    }).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/faults/offline-sync') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 200, store.idempotentWrite(c, 'fault_offline_sync', k, b, () => store.ingestOfflineFaultEvents(c, b.events || b, b.block || b.blockMeta || null)).payload);
    }).catch(e => fail(res, e));
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/technicians/trail') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const k = idempotencyKey(req);
      return json(res, 201, store.idempotentWrite(c, 'technician_trail_point', k, b, () => store.recordTechnicianTrailPoint(c, b)).payload);
    }).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/technicians/trail') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    return json(res, 200, store.listTechnicianTrail(c, {
      technicianId: url.searchParams.get('technicianId') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      limit: url.searchParams.get('limit') || undefined
    }));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/technicians/trail.geojson') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    return json(res, 200, store.getTechnicianTrailGeoJSON(c, {
      technicianId: url.searchParams.get('technicianId') || undefined,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      limit: url.searchParams.get('limit') || undefined
    }));
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/governance/audit-chain') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    try {
      const result = verifyAuditChain(store.db, c.organizationId);
      return json(res, 200, { schemaVersion: 'opscore.audit-chain.v1', organizationId: c.organizationId, ...result });
    } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/governance/domain-isolation') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    try {
      return json(res, 200, store.getDomainIsolationPolicy(c));
    } catch (e) { return fail(res, e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/governance/domain-assert') {
    try { requireScope(c, 'write'); } catch (e) { return fail(res, e); }
    return body(req).then(b => {
      const claimed = b.fingerprint || req.headers['x-domain-fingerprint'] || null;
      c.domainFingerprint = claimed;
      return json(res, 200, store.assertDomainAccess(c, b.scope || null));
    }).catch(e => fail(res, e));
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/geofences/assert-access') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.assertGeoAccess(c, b.longitude, b.latitude, { enforceIfEmpty: Boolean(b.enforceIfEmpty) }))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/geofences/role-polygons') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    try { return json(res, 200, store.listRoleIsolationPolygons(c)); } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/circuits') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    try {
      const { GatewayCircuitBreaker } = require('./gateway-circuit-breaker');
      return json(res, 200, { schemaVersion: 'opscore.circuit-snapshot.v1', organizationId: c.organizationId, circuits: breaker.snapshot(c.organizationId), sectors: GatewayCircuitBreaker.sectors() });
    } catch (e) { return fail(res, e); }
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/map/viewport') {
    try { requireScope(c, 'read'); } catch (e) { return fail(res, e); }
    try {
      return json(res, 200, store.listMapViewport(c, {
        west: url.searchParams.get('west'),
        south: url.searchParams.get('south'),
        east: url.searchParams.get('east'),
        north: url.searchParams.get('north'),
        limit: url.searchParams.get('limit')
      }));
    } catch (e) { return fail(res, e); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/work-orders') {
    const filters = {
      q: url.searchParams.get('q'),
      status: url.searchParams.get('status'),
      priority: url.searchParams.get('priority'),
      assignedTo: url.searchParams.get('assignedTo'),
      limit: url.searchParams.get('limit')
    };
    return sendWorkOrderRead(req, res, c, () => store.listWorkOrders(c, filters));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/search') {
    try {
      requireScope(c, 'read');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.universalSearch(c, {
      q: url.searchParams.get('q'),
      limit: url.searchParams.get('limit')
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/work-orders/bulk') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const k = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
      const write = () => store.idempotentWrite(c, 'work_orders_bulk', k, b, () => store.bulkWorkOrders(c, b));
      if (!signedWorkOrdersWriteEnabled(req)) return json(res, 200, write().payload);
      return runSignedWorkOrderWrite(res, c, write, (record, headers) => json(res, 200, record.payload, headers));
    }).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/work-orders') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const write = () => store.createWorkOrder(c, b);
      if (!signedWorkOrdersWriteEnabled(req)) return json(res, 201, write());
      return runSignedWorkOrderWrite(res, c, write, (result, headers) => json(res, 201, result, headers));
    }).catch(e => fail(res, e));
  }
  const wcp = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/completion-package$/);
  if (wcp && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.completionPackage(c, wcp[1]));
  const ep = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/evidence-package$/);
  if (ep && req.method === 'GET')
    return json(res, 200, store.evidencePackage(c, ep[1]));
  const wt = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/timeline$/);
  if (wt && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.workOrderTimeline(c, wt[1]));
  const wh = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/handoff$/);
  if (wh && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.workOrderHandoff(c, wh[1]));
  const wm = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)$/);
  if (wm && req.method === 'GET') {
    return sendWorkOrderRead(req, res, c, () => store.getWorkOrder(c, wm[1]));
  }
  if (wm && req.method === 'POST') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', reasons: [{ code: 'METHOD_NOT_ALLOWED', severity: 'blocking' }] } });
  }
  if (wm && req.method === 'PATCH') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const write = () => store.idempotentWrite(c, 'work_order_update', idempotencyKey(req), {
        workOrderId: wm[1],
        body: b
      }, () => store.updateWorkOrder(c, wm[1], b));
      if (!signedWorkOrdersWriteEnabled(req)) return idemJson(res, write(), 200);
      return runSignedWorkOrderWrite(res, c, write, (record, headers) => idemJson(res, record, 200, headers));
    }).catch(e => fail(res, e));
  }
  const wr = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/operational-risk$/);
  if (wr && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.workOrderOperationalRisk(c, wr[1]));
  const cm = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/comments$/);
  if (cm && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.listComments(c, cm[1]));
  if (cm && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => {
      const write = () => store.idempotentWrite(c, 'work_order_comment', idempotencyKey(req), {
        workOrderId: cm[1],
        body: b.body
      }, () => store.addComment(c, cm[1], b.body));
      if (!signedWorkOrdersWriteEnabled(req)) return idemJson(res, write(), 201);
      return runSignedWorkOrderWrite(res, c, write, (record, headers) => idemJson(res, record, 201, headers));
    }).catch(e => fail(res, e));
  }
  const eu = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/evidence-uploads$/);
  if (eu && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req, 32000).then(b => idemJson(res, store.idempotentWrite(c, 'evidence_upload_initiate', idempotencyKey(req), {
      workOrderId: eu[1],
      body: b
    }, () => store.initiateEvidenceUpload(c, {
      workOrderId: eu[1],
      ...b
    })), 201)).catch(e => fail(res, e));
  }
  const ec = url.pathname.match(/^\/api\/v1\/evidence-uploads\/([^/]+)\/chunks\/(\d+)$/);
  if (ec && req.method === 'PUT') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req, 800000).then(b => json(res, 200, store.putEvidenceChunk(c, ec[1], ec[2], b.contentBase64))).catch(e => fail(res, e));
  }
  const ex = url.pathname.match(/^\/api\/v1\/evidence-uploads\/([^/]+)\/complete$/);
  if (ex && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 201, store.completeEvidenceUpload(c, ex[1]));
  }
  const am = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/attachments$/);
  if (am && req.method === 'GET')
    return sendWorkOrderRead(req, res, c, () => store.listAttachments(c, 'work_order', am[1]));
  if (am && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req, 8000000).then(b => idemJson(res, store.idempotentWrite(c, 'work_order_evidence', idempotencyKey(req), {
      workOrderId: am[1],
      fileName: b.fileName,
      mediaType: b.mediaType,
      contentBase64: b.contentBase64
    }, () => store.storeAttachment(c, {
      workOrderId: am[1],
      ...b
    })), 201)).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/assets')
    return json(res, 200, store.listAssets(c));
  const ai = url.pathname.match(/^\/api\/v1\/assets\/([^/]+)\/intelligence$/);
  if (ai && req.method === 'GET')
    return json(res, 200, store.getAssetIntelligence(c, ai[1]));
  const ae = url.pathname.match(/^\/api\/v1\/assets\/([^/]+)\/events$/);
  if (ae && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.recordAssetEvent(c, {
      ...b,
      assetId: ae[1]
    }))).catch(e => fail(res, e));
  }
  const ah=url.pathname.match(/^\/api\/v1\/assets\/([^/]+)\/health$/); if(ah && req.method==='GET'){const c=requireCtx(req,res);if(!c)return;try{requireScope(c,'read');return json(res,200,store.evaluateAssetHealth(c,ah[1]));}catch(e){return fail(res,e);}}
  if (req.method === 'POST' && url.pathname === '/api/v1/assets') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createAsset(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/locations')
    return json(res, 200, store.listLocations(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/locations') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createLocation(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/activity')
    return json(res, 200, store.listActivity(c));
  if (req.method === 'GET' && url.pathname === '/api/v1/audit/verify')
    return json(res, 200, store.verifyAuditChain(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/approvals') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createApprovalRequest(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/approvals')
    return json(res, 200, store.listApprovalRequests(c, url.searchParams.get('status')));
  const apr = url.pathname.match(/^\/api\/v1\/approvals\/([^/]+)\/decide$/);
  if (apr && req.method === 'POST') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.decideApproval(c, apr[1], b))).catch(e => fail(res, e));
  }
  const de = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/dispatch-eligibility$/);
  if (de && req.method === 'GET')
    return json(res, 200, store.dispatchEligibility(c, de[1]));
  if (req.method === 'GET' && url.pathname === '/api/v1/operations/doctor') {
    try {
      if (![
          'owner',
          'admin'
        ].includes(c.role))
        throw new Error('FORBIDDEN');
      return json(res, 200, store.operationalDoctor(c));
    } catch (e) {
      return fail(res, e);
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/admin/migration-preflight') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.releaseMigrationPreflight(c));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/audit')
    return json(res, 200, store.auditLog(c, {
      action: url.searchParams.get('action'),
      resourceType: url.searchParams.get('resourceType'),
      actorUserId: url.searchParams.get('actorUserId'),
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to')
    }));
  if (req.method === 'GET' && url.pathname === '/api/v1/operational-jobs') return json(res,200,store.listOperationalJobs(c,url.searchParams.get('queue'),url.searchParams.get('status'),url.searchParams.get('limit')));
  if (req.method === 'POST' && url.pathname === '/api/v1/operational-jobs'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,201,store.enqueueOperationalJob(c,b))).catch(e=>fail(res,e));}
  const oj=url.pathname.match(/^\/api\/v1\/operational-jobs\/([^/]+)$/); if(oj&&req.method==='GET') return json(res,200,store.getOperationalJob(c,oj[1]));
  if(req.method==='GET'&&url.pathname==='/api/v1/service-lines')return json(res,200,store.listServiceLines(c));
  if(req.method==='POST'&&url.pathname==='/api/v1/service-lines'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'service_line_create',idempotencyKey(req),b,()=>store.createServiceLine(c,b)),201)).catch(e=>fail(res,e));}
  const csl=url.pathname.match(/^\/api\/v1\/customers\/([^/]+)\/service-line$/); if(csl&&req.method==='GET')return json(res,200,store.getCustomerServiceLine(c,csl[1])); if(csl&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'customer_service_line_assign',idempotencyKey(req),{customerId:csl[1],lineId:b.lineId},()=>store.assignCustomerServiceLine(c,csl[1],b.lineId)),200)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/service-line-migrations/preflight'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'service_line_migration_preflight',idempotencyKey(req),{customerId:b.customerId,toLineId:b.toLineId},()=>store.preflightLineMigration(c,b.customerId,b.toLineId)),201)).catch(e=>fail(res,e));}
  const lm=url.pathname.match(/^\/api\/v1\/service-line-migrations\/([^/]+)$/); if(lm&&req.method==='GET')return json(res,200,store.getLineMigration(c,lm[1])); if(lm&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return idemJson(res,store.idempotentWrite(c,'service_line_migration_execute',idempotencyKey(req),{migrationId:lm[1]},()=>store.executeLineMigration(c,lm[1])),200);}
  const lmr=url.pathname.match(/^\/api\/v1\/service-line-migrations\/([^/]+)\/rollback$/); if(lmr&&req.method==='POST'){try{requireScope(c,'admin')}catch(e){return fail(res,e)}return idemJson(res,store.idempotentWrite(c,'service_line_migration_rollback',idempotencyKey(req),{migrationId:lmr[1]},()=>store.rollbackLineMigration(c,lmr[1])),200);}
  const lmu=url.pathname.match(/^\/api\/v1\/service-line-migrations\/([^/]+)\/unreachable$/); if(lmu&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'service_line_migration_unreachable',idempotencyKey(req),{migrationId:lmu[1],reasonCode:b.reasonCode||b.reason,detail:b.detail},()=>store.markLineMigrationUnreachable(c,lmu[1],b)),200)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/operations/closure-sheets/compile'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'closure_sheet_compile',idempotencyKey(req),b,()=>store.compileClosureSheet(c,b)),201)).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/operations/closure-sheets/verify'){try{requireScope(c,'read')}catch(e){return fail(res,e)}const date=url.searchParams.get('date')||new Date().toISOString().slice(0,10);const tech=url.searchParams.get('technicianId');try{return json(res,200,store.verifyClosureSheet(c,date,tech))}catch(e){return fail(res,e)}}
  if(req.method==='GET'&&url.pathname==='/api/v1/operations/closure-sheets/latest'){try{requireScope(c,'read')}catch(e){return fail(res,e)}const date=url.searchParams.get('date')||new Date().toISOString().slice(0,10);const tech=url.searchParams.get('technicianId');try{return json(res,200,store.getClosureSheet(c,date,tech));}catch(e){return fail(res,e)}}
  if(req.method==='POST'&&url.pathname==='/api/v1/operations/dependencies'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'operational_dependency_add',idempotencyKey(req),b,()=>store.addOperationalDependency(c,b)),201)).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/operations/deadlocks'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.analyzeOperationalDeadlocks(c,{workOrderId:url.searchParams.get('workOrderId')||undefined}));}
  if(req.method==='POST'&&url.pathname==='/api/v1/operations/deadlocks/resolve'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'operational_deadlock_resolve',idempotencyKey(req),b,()=>store.resolveOperationalDeadlocks(c,b)),200)).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/system/parity-heartbeat'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.bootstrapParityHeartbeat(c,{persist:false}));}
  if(req.method==='POST'&&url.pathname==='/api/v1/security/tenant-field/protect'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'tenant_field_protect',idempotencyKey(req),b,()=>store.protectTenantField(c,b)),200)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/security/tenant-field/reveal'){try{requireScope(c,'admin')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,200,store.revealTenantField(c,b))).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/operations/closure-sheets/chunked-preview'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.chunkedClosureSheetPreview(c,{date:url.searchParams.get('date'),chunkSize:url.searchParams.get('chunkSize'),maxItems:url.searchParams.get('maxItems')}));}
  if(req.method==='POST'&&url.pathname==='/api/v1/geofences'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'geofence_create',idempotencyKey(req),b,()=>store.createGeofence(c,b)),201)).catch(e=>fail(res,e));}
   const gta=url.pathname.match(/^\/api\/v1\/geofences\/([^/]+)\/technicians$/); if(gta&&req.method==='POST'){const c=requireCtx(req,res);if(!c)return;requireScope(c,'write');return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'geofence_technician_assign',idempotencyKey(req),{...b,geofenceId:gta[1]},()=>store.assignTechnicianToGeofence(c,{...b,geofenceId:gta[1]})),200)).catch(e=>fail(res,e));}
   const gtl=url.pathname.match(/^\/api\/v1\/technicians\/([^/]+)\/geofences$/); if(gtl&&req.method==='GET'){const c=requireCtx(req,res);if(!c)return;requireScope(c,'read');try{return json(res,200,store.listTechnicianGeofences(c,gtl[1]))}catch(e){return fail(res,e)}}
   if(req.method==='POST'&&url.pathname==='/api/v1/security/signature-chain/seal'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'signature_chain_seal',idempotencyKey(req),b,()=>store.sealSignatureChain(c,b)),200)).catch(e=>fail(res,e));}

  if(req.method==='GET'&&url.pathname==='/api/v1/geofences'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.listGeofences(c));}
  const fdf=url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/field-duration-forecast$/);
  if(fdf&&req.method==='GET'){try{requireScope(c,'read');return json(res,200,store.predictFieldDuration(c,fdf[1],{limit:url.searchParams.get('limit')}));}catch(e){return fail(res,e)}}
  if(req.method==='POST'&&url.pathname==='/api/v1/geofences/dynamic-events'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'geofence_dynamic_event',idempotencyKey(req),b,()=>store.recordDynamicGeofenceEvent(c,b)),201)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/geofences/dynamic-evaluate'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,200,store.evaluateDynamicGeofence(c,b))).catch(e=>fail(res,e));}
  const fsc=url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/signoff-assurance\/challenge$/);
  if(fsc&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,201,store.issueFieldSignoffChallenge(c,{workOrderId:fsc[1],documentSha256:b.documentSha256}))).catch(e=>fail(res,e));}
  const fscDone=url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/signoff-assurance\/complete$/);
  if(fscDone&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'field_signoff_assurance_complete',idempotencyKey(req),{...b,workOrderId:fscDone[1]},()=>store.consumeFieldSignoffChallenge(c,{...b,workOrderId:fscDone[1]})),201)).catch(e=>fail(res,e));}
  const fsig=url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/signoff-assurance$/);
  if(fsig&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>{const mode=String(b.assuranceMode||'none');if(['os_local_biometric_gate','device_pin_gate'].includes(mode)){if(!b.challengeId||!b.challenge)throw new Error('SIGNOFF_CHALLENGE_REQUIRED');return idemJson(res,store.idempotentWrite(c,'field_signoff_assurance_complete',idempotencyKey(req),{...b,workOrderId:fsig[1]},()=>store.consumeFieldSignoffChallenge(c,{...b,workOrderId:fsig[1]})),201);}return idemJson(res,store.idempotentWrite(c,'field_signoff_assurance',idempotencyKey(req),{...b,workOrderId:fsig[1]},()=>store.recordFieldSignoffAssurance(c,{...b,workOrderId:fsig[1]})),201)}).catch(e=>fail(res,e));}
  const fb=url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/field-invoice$/);
  if(fb&&req.method==='POST'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'field_invoice',idempotencyKey(req),{...b,workOrderId:fb[1]},()=>store.createFieldInvoiceFromWork(c,{...b,workOrderId:fb[1]})),201)).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/field/live-snapshot'){try{requireScope(c,'read');return json(res,200,store.liveFieldOperationsSnapshot(c));}catch(e){return fail(res,e)}}
  if(req.method==='POST'&&url.pathname==='/api/v1/geofences/evaluate'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,200,store.evaluateGeofences(c,b))).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/security/signature-chain/levels'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,{schemaVersion:'opscore.signature-chain-policy.v1',levels:[{level:1,minimumRole:'member'},{level:2,minimumRole:'manager'},{level:3,minimumRole:'admin'}]});}
  if(req.method==='GET'&&url.pathname==='/api/v1/security/gateway-circuit'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.gatewayCircuitSnapshot(c));}
  if(req.method==='POST'&&url.pathname==='/api/v1/security/privacy-purge'){try{requireScope(c,'admin')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'privacy_purge',idempotencyKey(req),b,()=>store.runPrivacyPurge(c,b)),200)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/security/signature-chain'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'signature_chain_append',idempotencyKey(req),b,()=>store.appendSignatureChain(c,b)),201)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/security/signature-chain/verify'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return body(req).then(b=>json(res,200,store.verifySignatureChain(c,b))).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/billing/providers'){try{requireScope(c,'read')}catch(e){return fail(res,e)}return json(res,200,store.listBillingProviders(c));}
  if(req.method==='POST'&&url.pathname==='/api/v1/billing/providers'){try{requireScope(c,'admin')}catch(e){return fail(res,e)}return body(req).then(b=>idemJson(res,store.idempotentWrite(c,'billing_provider_register',idempotencyKey(req),b,()=>store.registerBillingProvider(c,b)),201)).catch(e=>fail(res,e));}
  if(req.method==='POST'&&url.pathname==='/api/v1/billing/reconcile-provider'){try{requireScope(c,'write')}catch(e){return fail(res,e)}return body(req).then(b=>store.reconcileViaBillingProvider(c,{...b,idempotencyKey:idempotencyKey(req)}).then(out=>json(res,200,out))).catch(e=>fail(res,e));}
  if(req.method==='GET'&&url.pathname==='/api/v1/reconciliation/latest')return json(res,200,store.latestReconciliation(c));
if(req.method==='POST'&&url.pathname==='/api/v1/reconciliation/run'){try{requireScope(c,'write')}catch(e){return fail(res,e)}const provider=url.searchParams.get('provider')||'local';if(provider==='stripe')return store.idempotentAsyncWrite(c,'commercial_reconciliation_stripe',idempotencyKey(req),{provider},()=>store.reconcileCommercialStripe(c,{})).then(out=>idemJson(res,out,200)).catch(e=>fail(res,e));return idemJson(res,store.idempotentWrite(c,'commercial_reconciliation',idempotencyKey(req),{provider},()=>store.reconcileCommercial(c,{provider})),200);}
  if (req.method === 'GET' && url.pathname === '/api/v1/notifications')
    return json(res, 200, store.notifications(c));
  const nr = url.pathname.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);
  if (nr && req.method === 'POST') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return json(res, 200, store.markNotificationRead(c, nr[1]));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/webhooks')
    return json(res, 200, store.listWebhooks(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/webhooks') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createWebhook(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/webhook-deliveries')
    return json(res, 200, store.webhookDeliveries(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/webhook-deliveries/deliver') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => store.deliverWebhook(c, b.deliveryId)).then(x => json(res, 200, x)).catch(e => fail(res, e));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/hierarchy')
    return json(res, 200, store.hierarchy(c));
  if (req.method === 'POST' && url.pathname === '/api/v1/hierarchy/units') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.createOrgUnit(c, b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/hierarchy/memberships') {
    try {
      requireScope(c, 'admin');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.assignUserToUnit(c, b))).catch(e => fail(res, e));
  }
  const mr = url.pathname.match(/^\/api\/v1\/memberships\/([^/]+)$/);
  if (mr && req.method === 'PATCH') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    return body(req).then(b => json(res, 200, store.updateMembershipRole(c, mr[1], b.role))).catch(e => fail(res,e));
  }
  if (mr && req.method === 'DELETE') {
    try { requireScope(c, 'admin'); } catch (e) { return fail(res, e); }
    try { return json(res, 200, store.removeMembership(c, mr[1])); } catch(e) { return fail(res,e); }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/import/customers/dry-run') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 200, store.validateCustomerImportDryRun(c, b.rows ?? b))).catch(e => fail(res, e));
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/import/customers.json') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req).then(b => json(res, 201, store.importCustomersJSON(c, b))).catch(e => fail(res, e));
  }
  const cur = url.pathname.match(/^\/api\/v1\/customers\/([^/]+)$/);
  if (cur && req.method === 'PATCH') { try { requireScope(c,'write'); } catch(e){return fail(res,e);} return body(req).then(b=>json(res,200,store.updateCustomer(c,cur[1],b))).catch(e=>fail(res,e)); }
  const sir = url.pathname.match(/^\/api\/v1\/sites\/([^/]+)$/);
  if (sir && req.method === 'PATCH') { try { requireScope(c,'write'); } catch(e){return fail(res,e);} return body(req).then(b=>json(res,200,store.updateSite(c,sir[1],b))).catch(e=>fail(res,e)); }
  const asr = url.pathname.match(/^\/api\/v1\/assets\/([^/]+)$/);
  if (asr && req.method === 'PATCH') { try { requireScope(c,'write'); } catch(e){return fail(res,e);} return body(req).then(b=>json(res,200,store.updateAsset(c,asr[1],b))).catch(e=>fail(res,e)); }
  const ar = url.pathname.match(/^\/api\/v1\/attachments\/([^/]+)$/);
  if (ar && req.method === 'GET') {
    try {
      const a = store.readAttachment(c, ar[1]);
      return sendFile(res, a.path, true);
    } catch (e) {
      return fail(res, e);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/import/customers') {
    try {
      requireScope(c, 'write');
    } catch (e) {
      return fail(res, e);
    }
    return body(req, config.maxCsvBodyBytes).then(b => json(res, 201, store.importCustomers(c, String(b.csv || '')))).catch(e => fail(res, e));
  }
  const ftr = url.pathname.match(/^\/api\/v1\/work-orders\/([^/]+)\/first-time-right$/);
  if (ftr && req.method === 'GET') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'read'); return sendWorkOrderRead(req,res,c,()=>store.firstTimeRightAssessment(c,ftr[1])); }
  if (ftr && req.method === 'POST') { const c=requireCtx(req,res); if(!c)return; requireScope(c,'write'); return json(res,200,store.recordFirstTimeRightCheck(c,ftr[1])); }
  if (req.method === 'GET' && url.pathname === '/api/v1/export/organization.json') {
    try {
      requireScope(c, 'read');
    } catch (e) {
      return fail(res, e);
    }
    const payload = store.exportOrganizationSnapshot(c, config.maxExportRows);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="organization-export.json"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
    });
    return res.end(JSON.stringify(payload, null, 2));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/export/customers.csv') {
    requireScope(c, 'read');
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="customers.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
    });
    return res.end(store.exportCustomers(c, config.maxExportRows));
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/export/work-orders.csv') {
    requireScope(c, 'read');
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="work-orders.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
    });
    return res.end(store.exportWorkOrders(c, config.maxExportRows));
  }
  if (url.pathname.startsWith('/api/'))
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  const safe = path.normalize(url.pathname || '/').replace(/^([.][.][/\\])+/, '');
  let file = path.join(webRoot, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(webRoot))
    return json(res, 400, { error: { code: 'BAD_PATH' } });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(webRoot, 'index.html');
  sendFile(res, file, false);
}
if (config.nodeEnv === 'production') productionSafetyGate(config);
const server = http.createServer({ maxHeaderSize: config.httpMaxHeaders * 1024 }, (req, res) => runWithRequest(() => {
  const started = process.hrtime.bigint();
  const originalEnd = res.end.bind(res);
  let recorded = false;
  res.end = (chunk, encoding, cb) => {
    if (!recorded) {
      recorded = true;
      try {
        const ms = Number(process.hrtime.bigint() - started) / 1000000;
        store.recordRuntimeRequest(req.method || 'UNKNOWN', String((req.url || '').split('?')[0]), res.statusCode || 0, ms);
        if (Date.now()-lastOtelExport>=60000 && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) { lastOtelExport=Date.now(); exportOtlp(store.runtimeObservability({role:'admin'})).catch(e=>warn('otlp_export_failed',{error:e})); }
      } catch (metricsError) {
        warn('runtime_metrics_persistence_degraded', { error: metricsError });
      }
    }
    return originalEnd(chunk, encoding, cb);
  };
  try {
    const r = route(req, res);
    if (r?.catch)
      r.catch(e => fail(res, e));
  } catch (e) {
    fail(res, e);
  }
}, req, res));
server.requestTimeout = config.httpRequestTimeoutMs;
server.headersTimeout = config.httpHeadersTimeoutMs;
server.keepAliveTimeout = config.httpKeepAliveTimeoutMs;
server.on('clientError', (err, socket) => {
  if (!socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
server.listen(config.port, config.host, () => info('server_started', { message: `OpsCore Starter: http://${ config.host }:${ config.port }`, url: `http://${ config.host }:${ config.port }` }));
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info('server_shutdown_started', { signal });
  // Stop accepting new work first; close the database only after in-flight HTTP
  // handlers have drained, preventing partial writes during deployment restarts.
  server.close(() => {
    Promise.resolve()
      .then(async () => {
        try { db.close(); } catch (_) { /* ignore */ }
      })
      .finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));