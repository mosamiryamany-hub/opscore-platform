'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const routeManifest = require('../docs/verification/SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json');
const apiInventory = require('../docs/API_INVENTORY.json');
const { buildUnknownRoutePath } = require('../src/production-api-route-acceptance-policy');
const {
  evaluateProductionGate,
  isReadOnlyProductionVerificationRequest,
  isAuthorizedProductionCandidateProbeRequest,
  isAuthorizedProductionCandidateDatabaseIdentityRequest,
  candidateProbeBoundaryDenialReason
} = require('../src/production-hold');

test('production hold blocks traffic while leaving only read-only verification GET routes available', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'true' },
    () => { throw new Error('PRODUCTION_HOLD_ACTIVE'); }
  );
  assert.deepEqual(gate, {
    blocked: true,
    mode: 'maintenance',
    reasonCode: 'PRODUCTION_HOLD_ACTIVE'
  });

  for (const pathname of [
    '/api/health',
    '/api/verify/deployment',
    '/api/verify/release',
    '/verify/release.json',
    '/api/verify/database',
    '/api/verify/database-security'
  ]) {
    assert.equal(isReadOnlyProductionVerificationRequest({ method: 'GET', url: pathname }), true);
  }
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'POST', url: '/api/verify/release' }), false);
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'GET', url: '/api/v1/assets' }), false);
  assert.equal(isReadOnlyProductionVerificationRequest({ method: 'POST', url: '/api/health' }), false);
});

test('production hold permits only token-authenticated signed candidate routes without opening operational traffic', () => {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'a'.repeat(64)
  };
  const readiness = { productionReleaseVerified: false };
  const request = (method, url, token = env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN) => ({
    method,
    url,
    headers: {
      host: env.VERCEL_URL,
      'x-vercel-trusted-oidc-idp-token': 'header.payload.signature',
      ...(token ? { 'x-opscore-signed-context-probe': token } : {})
    }
  });

  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/work-orders/wo_123/timeline'), env, readiness
  ), true);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('POST', '/api/v1/customers'), env, readiness
  ), true);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('POST', '/api/v1/auth/mobile-login'), env, readiness
  ), true);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/admin/users'), env, readiness
  ), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('DELETE', '/api/v1/work-orders/wo_123/timeline'), env, readiness
  ), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/customers', 'b'.repeat(64)), env, readiness
  ), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/customers', null), env, readiness
  ), false);
  const aliasHostRequest = request('GET', '/api/v1/customers');
  aliasHostRequest.headers.host = 'opscore-platform.vercel.app';
  assert.equal(isAuthorizedProductionCandidateProbeRequest(aliasHostRequest, env, readiness), false);
  const missingOidcRequest = request('GET', '/api/v1/customers');
  delete missingOidcRequest.headers['x-vercel-trusted-oidc-idp-token'];
  assert.equal(isAuthorizedProductionCandidateProbeRequest(missingOidcRequest, env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/customers'), { ...env, OPSC_PRODUCTION_HOLD: 'false' }, readiness
  ), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(
    request('GET', '/api/v1/customers'), env, { productionReleaseVerified: true }
  ), false);
  assert.equal(env.OPSC_PRODUCTION_HOLD, 'true');
  assert.equal(env.OPSC_RELEASE_VERIFIED, 'false');
});

test('the HTTP server consults the candidate-probe allowlist before returning the production hold response', () => {
  const serverPath = path.join(__dirname, '..', 'src', 'server.js');
  const source = fs.readFileSync(serverPath, 'utf8');
  assert.match(source, /!isAuthorizedProductionCandidateProbeRequest\(req, process\.env, signedContextProductionReadiness\)/);
  assert.match(source, /!isAuthorizedProductionCandidateDatabaseIdentityRequest\(req, process\.env, signedContextProductionReadiness\)/);
  assert.ok(source.indexOf('!isAuthorizedProductionCandidateProbeRequest(req, process.env, signedContextProductionReadiness)')
    < source.indexOf("note: 'Operational traffic is disabled while Production release evidence is not verified."));
});

test('the hold exception matches all and only the signed-route manifest entries in the API inventory', () => {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'c'.repeat(64)
  };
  const readiness = { productionReleaseVerified: false };
  const token = env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN;
  const routeKey = route => String(route.method).toUpperCase() + ' ' + route.path;
  const manifestKeys = new Set(routeManifest.routes.map(routeKey));
  const concretePath = route => String(route.path).replace(/\{[^/]+\}/g, 'hold-probe-id').replace(/\(\\d\+\)/g, '0');
  const request = (route, pathValue = concretePath(route)) => ({
    method: String(route.method).toUpperCase(),
    url: pathValue,
    headers: {
      host: env.VERCEL_URL,
      'x-vercel-trusted-oidc-idp-token': 'header.payload.signature',
      'x-opscore-signed-context-probe': token
    }
  });

  assert.equal(routeManifest.routeCount, 67);
  for (const route of routeManifest.routes) {
    assert.equal(isAuthorizedProductionCandidateProbeRequest(request(route), env, readiness), true, routeKey(route));
  }
  for (const route of apiInventory.routes) {
    const key = String(route.method).toUpperCase() + ' ' + route.route;
    if (manifestKeys.has(key)) continue;
    const concrete = String(route.route).replace(/\{[^/]+\}/g, 'hold-probe-id').replace(/\(\\d\+\)/g, '0');
    // Attachment binary download is an explicit candidate HOLD exception outside the 67 inventory.
    if (String(route.method).toUpperCase() === 'GET' && /^\/api\/v1\/attachments\/[^/]+$/.test(concrete)) {
      assert.equal(isAuthorizedProductionCandidateProbeRequest(request(route, concrete), env, readiness), true, key);
      continue;
    }
    assert.equal(isAuthorizedProductionCandidateProbeRequest(request(route, concrete), env, readiness), false, key);
  }
});

test('held candidate permits only exact GET database-identity diagnostics with candidate token and Vercel OIDC', () => {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'd'.repeat(64)
  };
  const readiness = { productionReleaseVerified: false };
  const req = (method = 'GET', url = '/api/internal/production-database-identity', token = env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN, oidc = 'header.payload.signature') => ({
    method, url, headers: {
      host: env.VERCEL_URL,
      ...(token ? { 'x-opscore-signed-context-probe': token } : {}),
      ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {})
    }
  });

  assert.equal(isReadOnlyProductionVerificationRequest(req()), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req(), env, readiness), true);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req('POST'), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req('GET', '/api/internal/production-database-identity/'), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req('GET', '/api/internal/production-database-identity?debug=true'), env, readiness), true);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req('GET', undefined, 'e'.repeat(64)), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req('GET', undefined, env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN, 'not-a-jwt'), env, readiness), false);

  const alias = req();
  alias.headers.host = 'opscore-platform.vercel.app';
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(alias, env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req(), { ...env, OPSC_PRODUCTION_HOLD: 'false' }, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req(), { ...env, OPSC_RELEASE_VERIFIED: 'true' }, readiness), false);
  assert.equal(isAuthorizedProductionCandidateDatabaseIdentityRequest(req(), { ...env, OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'false' }, readiness), false);
});

test('held candidate permits only the exact commit-bound unknown-route GET probe under the candidate token and OIDC boundary', () => {
  const commit = 'b'.repeat(40);
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    VERCEL_GIT_COMMIT_SHA: commit,
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'f'.repeat(64)
  };
  const readiness = { productionReleaseVerified: false };
  const request = (method = 'GET', url = buildUnknownRoutePath(commit)) => ({
    method, url, headers: {
      host: env.VERCEL_URL,
      'x-opscore-signed-context-probe': env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN,
      'x-opscore-trusted-oidc-idp-token': 'header.payload.signature'
    }
  });

  assert.equal(isAuthorizedProductionCandidateProbeRequest(request(), env, readiness), true);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(request('POST'), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(request('GET', buildUnknownRoutePath('c'.repeat(40))), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(request('GET', buildUnknownRoutePath(commit) + '/extra'), env, readiness), false);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(request(), { ...env, VERCEL_GIT_COMMIT_SHA: '' }, readiness), false);
  const missingProbe = request();
  delete missingProbe.headers['x-opscore-signed-context-probe'];
  assert.equal(isAuthorizedProductionCandidateProbeRequest(missingProbe, env, readiness), false);
  const missingOidc = request();
  delete missingOidc.headers['x-opscore-trusted-oidc-idp-token'];
  assert.equal(isAuthorizedProductionCandidateProbeRequest(missingOidc, env, readiness), false);
  const alias = request();
  alias.headers.host = 'opscore-platform.vercel.app';
  assert.equal(isAuthorizedProductionCandidateProbeRequest(alias, env, readiness), false);
});

test('missing release evidence cannot be bypassed by setting hold false', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'false', OPSC_RELEASE_VERIFIED: 'true' },
    () => { throw new Error('PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED'); }
  );
  assert.deepEqual(gate, {
    blocked: true,
    mode: 'maintenance',
    reasonCode: 'PRODUCTION_RELEASE_EVIDENCE_NOT_VERIFIED'
  });
});

test('an unrelated production startup error is not silently converted to maintenance mode', () => {
  assert.throws(() => evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production' },
    () => { throw new Error('INVALID_PRODUCTION_ENVIRONMENT'); }
  ), /INVALID_PRODUCTION_ENVIRONMENT/);
});

test('a verified production gate remains open', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { VERCEL_ENV: 'production', OPSC_PRODUCTION_HOLD: 'false', OPSC_RELEASE_VERIFIED: 'true' },
    () => ({ allowed: true, mode: 'production' })
  );
  assert.deepEqual(gate, { blocked: false, mode: 'production', reasonCode: null });
});

test('Preview remains available even when NODE_ENV is production', () => {
  const gate = evaluateProductionGate(
    { nodeEnv: 'production' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
    () => ({ allowed: true, mode: 'preview' })
  );
  assert.deepEqual(gate, { blocked: false, mode: 'preview', reasonCode: null });
});

test('candidate hold diagnostics identify the exact failed deployment-boundary check without authorizing it', () => {
  const env = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'opscore-platform-candidate123-mosamiryamany-1692.vercel.app',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_REQUIRE_SIGNED_TENANT_CONTEXT: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN: 'a'.repeat(64)
  };
  const readiness = { productionReleaseVerified: false };
  const request = () => ({
    method: 'GET',
    url: '/api/v1/customers',
    headers: {
      host: env.VERCEL_URL,
      'x-opscore-signed-context-probe': env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN,
      'x-vercel-trusted-oidc-idp-token': 'header.payload.signature'
    }
  });

  assert.equal(candidateProbeBoundaryDenialReason(request(), env, readiness), null);
  assert.equal(isAuthorizedProductionCandidateProbeRequest(request(), env, readiness), true);

  const missingProbe = request();
  delete missingProbe.headers['x-opscore-signed-context-probe'];
  assert.equal(candidateProbeBoundaryDenialReason(missingProbe, env, readiness), 'probe_header_missing');
  assert.equal(isAuthorizedProductionCandidateProbeRequest(missingProbe, env, readiness), false);

  const mismatchedHost = request();
  mismatchedHost.headers.host = 'opscore-platform.vercel.app';
  assert.equal(candidateProbeBoundaryDenialReason(mismatchedHost, env, readiness), 'request_host_mismatch');
  assert.equal(isAuthorizedProductionCandidateProbeRequest(mismatchedHost, env, readiness), false);

  const missingOidc = request();
  delete missingOidc.headers['x-vercel-trusted-oidc-idp-token'];
  assert.equal(candidateProbeBoundaryDenialReason(missingOidc, env, readiness), 'trusted_oidc_header_missing');
  assert.equal(isAuthorizedProductionCandidateProbeRequest(missingOidc, env, readiness), false);

  const malformedOidc = request();
  malformedOidc.headers['x-vercel-trusted-oidc-idp-token'] = 'not-a-jwt';
  assert.equal(candidateProbeBoundaryDenialReason(malformedOidc, env, readiness), 'trusted_oidc_header_invalid');
  assert.equal(isAuthorizedProductionCandidateProbeRequest(malformedOidc, env, readiness), false);

  assert.equal(candidateProbeBoundaryDenialReason(request(), { ...env, VERCEL_URL: '' }, readiness), 'deployment_url_missing');
});
