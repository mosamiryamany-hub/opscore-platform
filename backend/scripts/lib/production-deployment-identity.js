'use strict';

const COMMIT_RE = /^[a-f0-9]{40}$/i;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
const DEPLOYMENT_RE = /^dpl_[A-Za-z0-9]+$/;
const APPROVED_PRODUCTION_ORIGIN = 'https://opscore-platform.vercel.app';


const CANDIDATE_HOST_RE = /^opscore-platform-[a-z0-9-]+-mosamiryamany-1692\.vercel\.app$/;

function candidateProbeOrigin(base, env = process.env) {
  let url;
  try { url = new URL(String(base || '')); }
  catch { throw new Error('PRODUCTION_CANDIDATE_HTTP_ORIGIN_NOT_APPROVED'); }
  const oidcToken = String(env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
  const expectedDeploymentId = String(env.OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID || '').trim();
  const candidateEnabled = String(env.OPSC_PRODUCTION_CANDIDATE_MODE || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_RELEASE_VERIFIED || '').trim().toLowerCase() === 'false'
    && String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED || '').trim().toLowerCase() === 'true';
  if (url.protocol !== 'https:' || !CANDIDATE_HOST_RE.test(url.hostname.toLowerCase())
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || !candidateEnabled || !DEPLOYMENT_RE.test(expectedDeploymentId)
      || oidcToken.split('.').length !== 3) {
    throw new Error('PRODUCTION_CANDIDATE_HTTP_ORIGIN_NOT_APPROVED');
  }
  return { origin: url.origin, expectedDeploymentId, oidcToken };
}

async function readProductionDeploymentIdentity(httpBase, expectedCommitSha, fetchImpl = fetch, options = {}) {
  const base = String(httpBase || '').replace(/\/+$/, '');
  const env = options.env || process.env;
  const candidate = base === APPROVED_PRODUCTION_ORIGIN ? null : candidateProbeOrigin(base, env);
  if (!candidate && base !== APPROVED_PRODUCTION_ORIGIN) throw new Error('PRODUCTION_HTTP_ORIGIN_NOT_APPROVED');
  const expectedCommit = String(expectedCommitSha || '').trim().toLowerCase();
  if (!COMMIT_RE.test(expectedCommit)) throw new Error('EXPECTED_PRODUCTION_COMMIT_SHA_REQUIRED');

  const response = await fetchImpl(base + '/api/verify/release', {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      ...(candidate ? { 'x-vercel-trusted-oidc-idp-token': candidate.oidcToken } : {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('PRODUCTION_RELEASE_IDENTITY_HTTP_' + response.status);
  let proof;
  try { proof = JSON.parse(raw); } catch { throw new Error('PRODUCTION_RELEASE_IDENTITY_JSON_INVALID'); }

  const commitSha = String(proof.sourceCommit || '').trim().toLowerCase();
  const ciCommitSha = String(proof.ci && proof.ci.commitSha || '').trim().toLowerCase();
  const pipelineId = String(proof.ci && proof.ci.pipelineId || '').trim();
  const deploymentId = String(proof.deployment && proof.deployment.id || '').trim();
  const ref = String(proof.deployment && proof.deployment.ref || '').trim();
  const environment = String(proof.deployment && proof.deployment.environment || '').trim().toLowerCase();
  if (proof.schemaVersion !== 'opscore.public-release-proof.v2'
      || proof.deployment?.status !== 'identified'
      || environment !== 'production'
      || ref !== 'main'
      || !DEPLOYMENT_RE.test(deploymentId)
      || (candidate && deploymentId !== candidate.expectedDeploymentId)
      || !COMMIT_RE.test(commitSha)
      || ciCommitSha !== commitSha
      || proof.sourceCommitIdentitySource !== 'github-actions-cli-assertion'
      || !PIPELINE_RE.test(pipelineId)) {
    throw new Error('PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED');
  }
  if (commitSha !== expectedCommit) throw new Error('PRODUCTION_DEPLOYED_COMMIT_MISMATCH');

  return {
    schemaVersion: proof.schemaVersion,
    environment,
    ref,
    deploymentId,
    commitSha,
    ciPipelineId: pipelineId,
    sourceCommitIdentitySource: proof.sourceCommitIdentitySource,
    observedAt: new Date().toISOString(),
    releaseProofStatus: String(proof.status || 'UNVERIFIED')
  };
}

module.exports = { readProductionDeploymentIdentity, candidateProbeOrigin };
