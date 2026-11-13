'use strict';

const fs = require('node:fs');

const EXPECTED_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'https://github.com/mosamiryamany-hub';
const EXPECTED_REPOSITORY = 'mosamiryamany-hub/opscore-platform';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_EVENT = 'push';
const EXPECTED_ENVIRONMENT = 'production';
const EXPECTED_WORKFLOW_REF = 'mosamiryamany-hub/opscore-platform/.github/workflows/vercel-deploy.yml@refs/heads/main';
const EXPECTED_SUBJECT = 'repo:mosamiryamany-hub/opscore-platform:environment:production';

function decodeJwtClaims(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('GITHUB_OIDC_TOKEN_FORMAT_INVALID');
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { throw new Error('GITHUB_OIDC_TOKEN_CLAIMS_INVALID'); }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('GITHUB_OIDC_TOKEN_CLAIMS_INVALID');
  return claims;
}

function validateGithubOidcClaims(claims, nowSeconds = Math.floor(Date.now() / 1000)) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const valid = claims.iss === EXPECTED_ISSUER &&
    audience.length === 1 && audience[0] === EXPECTED_AUDIENCE &&
    claims.sub === EXPECTED_SUBJECT &&
    claims.repository === EXPECTED_REPOSITORY &&
    claims.ref === EXPECTED_REF &&
    claims.event_name === EXPECTED_EVENT &&
    claims.environment === EXPECTED_ENVIRONMENT &&
    claims.workflow_ref === EXPECTED_WORKFLOW_REF &&
    Number.isFinite(Number(claims.exp)) && Number(claims.exp) > nowSeconds &&
    (!Number.isFinite(Number(claims.nbf)) || Number(claims.nbf) <= nowSeconds + 30) &&
    Number.isFinite(Number(claims.iat)) && Number(claims.iat) <= nowSeconds + 30 &&
    Number(claims.exp) - Number(claims.iat) <= 15 * 60;
  if (!valid) throw new Error('GITHUB_OIDC_TOKEN_CLAIMS_NOT_ALLOWED');
  return true;
}

function validateRequestUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); }
  catch { throw new Error('GITHUB_OIDC_REQUEST_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'pipelines.actions.githubusercontent.com' ||
      url.username || url.password || url.hash) {
    throw new Error('GITHUB_OIDC_REQUEST_URL_NOT_ALLOWED');
  }
  return url;
}

async function requestGithubOidcToken(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const requestToken = String(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();
  if (!requestToken) throw new Error('GITHUB_OIDC_REQUEST_TOKEN_MISSING');
  if (typeof fetchImpl !== 'function') throw new Error('GITHUB_OIDC_FETCH_UNAVAILABLE');

  const url = validateRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', EXPECTED_AUDIENCE);
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      authorization: 'Bearer ' + requestToken,
      accept: 'application/json'
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  if (!response || response.status !== 200) throw new Error('GITHUB_OIDC_TOKEN_REQUEST_FAILED');
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error('GITHUB_OIDC_TOKEN_RESPONSE_INVALID'); }
  const token = String(payload && payload.value || '').trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('GITHUB_OIDC_TOKEN_RESPONSE_INVALID');
  }
  validateGithubOidcClaims(decodeJwtClaims(token), options.nowSeconds);
  return token;
}

function writeTokenOutput(token, env = process.env) {
  const outputPath = String(env.GITHUB_OUTPUT || '').trim();
  if (!outputPath) throw new Error('GITHUB_OUTPUT_REQUIRED');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(token || ''))) {
    throw new Error('GITHUB_OIDC_TOKEN_FORMAT_INVALID');
  }
  fs.appendFileSync(outputPath, 'token=' + token + '\n', { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('::add-mask::' + token + '\n');
  process.stdout.write('VERCEL_TRUSTED_OIDC_TOKEN=PASS\n');
}

async function main() {
  const token = await requestGithubOidcToken();
  writeTokenOutput(token);
}

if (require.main === module) {
  main().catch(error => {
    const code = /^[A-Z0-9_]{1,96}$/.test(String(error && error.message || ''))
      ? String(error.message) : 'GITHUB_OIDC_TOKEN_REQUEST_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_ISSUER,
  EXPECTED_AUDIENCE,
  EXPECTED_REPOSITORY,
  EXPECTED_REF,
  EXPECTED_EVENT,
  EXPECTED_ENVIRONMENT,
  EXPECTED_WORKFLOW_REF,
  EXPECTED_SUBJECT,
  decodeJwtClaims,
  validateGithubOidcClaims,
  validateRequestUrl,
  requestGithubOidcToken,
  writeTokenOutput
};
