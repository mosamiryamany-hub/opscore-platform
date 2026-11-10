'use strict';

const COMMIT_SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const DEPLOYMENT_ID_RE = /^dpl_[A-Za-z0-9]+$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const ENVIRONMENTS = new Set(['production', 'preview', 'development']);

function normalizedCommit(value) {
  const raw = String(value || '').trim();
  return COMMIT_SHA_RE.test(raw) ? raw.toLowerCase() : null;
}

function createDeploymentProof(env = process.env, now = () => new Date()) {
  const vercelCommit = normalizedCommit(env.VERCEL_GIT_COMMIT_SHA);
  const opscSource = normalizedCommit(env.OPSC_SOURCE_COMMIT_SHA);
  const ciCommit = normalizedCommit(env.OPSC_RELEASE_CI_COMMIT);
  // A CLI deployment can inherit stale/custom VERCEL_GIT_* variables. When the
  // deploy pipeline explicitly identifies its transport, bind identity only to
  // that pipeline's commit assertion rather than claiming native Vercel Git provenance.
  const deploymentSource = String(env.OPSC_RELEASE_DEPLOYMENT_SOURCE || '').trim().toLowerCase();
  const cliDeployment = deploymentSource === 'github-actions-cli' || deploymentSource === 'gitlab-ci-cli' || deploymentSource === 'cli';
  const commitSha = cliDeployment ? ciCommit : (vercelCommit || opscSource || ciCommit);
  const commitIdentitySource = cliDeployment
    ? (ciCommit ? 'github-actions-cli-assertion' : 'unavailable')
    : vercelCommit
      ? 'vercel-git-metadata'
      : opscSource
        ? 'operator-source-commit'
        : ciCommit
          ? 'github-actions-runtime-assertion'
          : 'unavailable';
  const rawRef = String((cliDeployment ? env.OPSC_RELEASE_CI_REF : env.VERCEL_GIT_COMMIT_REF) || env.OPSC_RELEASE_CI_REF || '').trim();
  const ref = REF_RE.test(rawRef) ? rawRef : null;
  const rawDeploymentId = String(env.VERCEL_DEPLOYMENT_ID || '').trim();
  const deploymentId = DEPLOYMENT_ID_RE.test(rawDeploymentId) ? rawDeploymentId : null;
  const rawEnvironment = String(env.VERCEL_ENV || '').trim().toLowerCase();
  const environment = ENVIRONMENTS.has(rawEnvironment) ? rawEnvironment : 'unknown';
  const rawProvider = String(env.VERCEL_GIT_PROVIDER || '').trim().toLowerCase();
  const provider = cliDeployment
    ? (ciCommit ? 'github' : 'unknown')
    : ['gitlab', 'github', 'bitbucket'].includes(rawProvider)
      ? rawProvider
      : (ciCommit || opscSource)
        ? 'github'
        : 'unknown';
  const identified = Boolean(commitSha && deploymentId && environment !== 'unknown');
  return {
    schemaVersion: 'opscore.public-deployment-proof.v2',
    product: 'OpsCore',
    status: identified ? 'identified' : 'unavailable',
    source: { provider, ref, commitSha, commitIdentitySource },
    deployment: { environment, id: deploymentId, method: cliDeployment ? 'cli' : (vercelCommit ? 'git' : 'unknown') },
    checkedAt: now().toISOString(),
    note: 'Identifies the running Vercel deployment. commitIdentitySource distinguishes native Vercel Git metadata, operator-supplied source commit, and GitHub Actions CI assertion. Package fingerprint, production behavior, and database isolation are verified separately.'
  };
}

module.exports = { createDeploymentProof };
