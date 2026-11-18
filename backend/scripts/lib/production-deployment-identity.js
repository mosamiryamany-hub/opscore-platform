'use strict';

const COMMIT_RE = /^[a-f0-9]{40}$/i;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
const DEPLOYMENT_RE = /^dpl_[A-Za-z0-9]+$/;
const APPROVED_PRODUCTION_ORIGIN = 'https://opscore-platform.vercel.app';

async function readProductionDeploymentIdentity(httpBase, expectedCommitSha, fetchImpl = fetch) {
  const base = String(httpBase || '').replace(/\/+$/, '');
  if (base !== APPROVED_PRODUCTION_ORIGIN) throw new Error('PRODUCTION_HTTP_ORIGIN_NOT_APPROVED');
  const expectedCommit = String(expectedCommitSha || '').trim().toLowerCase();
  if (!COMMIT_RE.test(expectedCommit)) throw new Error('EXPECTED_PRODUCTION_COMMIT_SHA_REQUIRED');

  const response = await fetchImpl(base + '/api/verify/release', {
    method: 'GET',
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
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
  const allowMissingDeploymentId = String(process.env.OPSC_EVIDENCE_ALLOW_MISSING_DEPLOYMENT_ID || '').trim() === 'true';
  const deploymentAttested = proof.deployment?.status === 'identified'
    && environment === 'production'
    && DEPLOYMENT_RE.test(deploymentId);
  const coreAttested = proof.schemaVersion === 'opscore.public-release-proof.v2'
    && ref === 'main'
    && COMMIT_RE.test(commitSha)
    && ciCommitSha === commitSha
    && proof.sourceCommitIdentitySource === 'github-actions-cli-assertion'
    && PIPELINE_RE.test(pipelineId);
  // After authorized first-promote the public proof may temporarily report
  // deployment.status=unavailable until release identity is republished.
  // Evidence collectors may opt in via OPSC_EVIDENCE_ALLOW_MISSING_DEPLOYMENT_ID.
  if (!coreAttested) {
    throw new Error('PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED');
  }
  if (!deploymentAttested) {
    if (!(allowMissingDeploymentId && (environment === 'unknown' || environment === 'production') && !DEPLOYMENT_RE.test(deploymentId))) {
      throw new Error('PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED');
    }
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

module.exports = { readProductionDeploymentIdentity };
