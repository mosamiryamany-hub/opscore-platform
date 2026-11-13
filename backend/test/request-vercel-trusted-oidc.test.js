'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_AUDIENCE,
  EXPECTED_ISSUER,
  EXPECTED_REPOSITORY,
  EXPECTED_REF,
  EXPECTED_EVENT,
  EXPECTED_ENVIRONMENT,
  EXPECTED_WORKFLOW_REF,
  EXPECTED_SUBJECT,
  decodeJwtClaims,
  validateGithubOidcClaims,
  validateRequestUrl,
  requestGithubOidcToken
} = require('../../scripts/request-vercel-trusted-oidc');

function validClaims(now = 1_800_000_000) {
  return {
    iss: EXPECTED_ISSUER,
    aud: EXPECTED_AUDIENCE,
    sub: EXPECTED_SUBJECT,
    repository: EXPECTED_REPOSITORY,
    ref: EXPECTED_REF,
    event_name: EXPECTED_EVENT,
    environment: EXPECTED_ENVIRONMENT,
    workflow_ref: EXPECTED_WORKFLOW_REF,
    iat: now - 20,
    nbf: now - 20,
    exp: now + 280
  };
}

function jwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return header + '.' + payload + '.test-signature';
}

test('GitHub OIDC claims are restricted to this repository, main push, workflow, and production environment', () => {
  assert.equal(validateGithubOidcClaims(validClaims(), 1_800_000_000), true);
  for (const [key, value] of [
    ['repository', 'another/repository'],
    ['ref', 'refs/heads/feature'],
    ['event_name', 'pull_request'],
    ['environment', 'preview'],
    ['workflow_ref', 'another/workflow.yml@refs/heads/main'],
    ['sub', 'repo:mosamiryamany-hub/opscore-platform:ref:refs/heads/main'],
    ['iss', 'https://attacker.example'],
    ['aud', 'https://attacker.example']
  ]) {
    const claims = validClaims();
    claims[key] = value;
    assert.throws(() => validateGithubOidcClaims(claims, 1_800_000_000), /GITHUB_OIDC_TOKEN_CLAIMS_NOT_ALLOWED/, key);
  }
});

test('GitHub OIDC claim validation rejects expired, not-yet-valid, and overlong tokens', () => {
  const expired = validClaims();
  expired.exp = 1_799_999_999;
  assert.throws(() => validateGithubOidcClaims(expired, 1_800_000_000), /GITHUB_OIDC_TOKEN_CLAIMS_NOT_ALLOWED/);
  const notYetValid = validClaims();
  notYetValid.nbf = 1_800_000_100;
  assert.throws(() => validateGithubOidcClaims(notYetValid, 1_800_000_000), /GITHUB_OIDC_TOKEN_CLAIMS_NOT_ALLOWED/);
  const longLived = validClaims();
  longLived.exp = longLived.iat + 3600;
  assert.throws(() => validateGithubOidcClaims(longLived, 1_800_000_000), /GITHUB_OIDC_TOKEN_CLAIMS_NOT_ALLOWED/);
});

test('JWT claims decoder rejects malformed or non-JSON payloads', () => {
  assert.deepEqual(decodeJwtClaims(jwt(validClaims())), validClaims());
  assert.throws(() => decodeJwtClaims('not-a-jwt'), /GITHUB_OIDC_TOKEN_FORMAT_INVALID/);
  const malformed = Buffer.from('{').toString('base64url');
  assert.throws(() => decodeJwtClaims('header.' + malformed + '.signature'), /GITHUB_OIDC_TOKEN_CLAIMS_INVALID/);
});

test('OIDC request URL is restricted to the GitHub Actions issuer endpoint', () => {
  assert.equal(validateRequestUrl('https://pipelines.actions.githubusercontent.com/example').hostname,
    'pipelines.actions.githubusercontent.com');
  for (const url of [
    'http://pipelines.actions.githubusercontent.com/token',
    'https://attacker.example/token',
    'https://user:pass@pipelines.actions.githubusercontent.com/token'
  ]) assert.throws(() => validateRequestUrl(url), /GITHUB_OIDC_REQUEST_URL_NOT_ALLOWED/);
});

test('OIDC token request sets the exact audience and never prints the request credential', async () => {
  const now = 1_800_000_000;
  const token = jwt(validClaims(now));
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { status: 200, json: async () => ({ value: token }) };
  };
  const result = await requestGithubOidcToken({
    nowSeconds: now,
    fetchImpl,
    env: {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/example',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret'
    }
  });
  assert.equal(result, token);
  assert.equal(new URL(request.url).searchParams.get('audience'), EXPECTED_AUDIENCE);
  assert.equal(request.options.headers.authorization, 'Bearer request-secret');
  assert.equal(request.options.redirect, 'manual');
});

test('OIDC token request fails closed for missing credentials or non-success responses', async () => {
  await assert.rejects(() => requestGithubOidcToken({
    env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/example' },
    fetchImpl: async () => ({ status: 200, json: async () => ({ value: jwt(validClaims()) }) })
  }), /GITHUB_OIDC_REQUEST_TOKEN_MISSING/);

  await assert.rejects(() => requestGithubOidcToken({
    env: {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/example',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret'
    },
    fetchImpl: async () => ({ status: 403, json: async () => ({}) })
  }), /GITHUB_OIDC_TOKEN_REQUEST_FAILED/);
});
