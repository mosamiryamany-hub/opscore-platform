'use strict';

const { createDeploymentProof } = require('./deployment-proof');
const fs = require('node:fs');
const path = require('node:path');

const SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
const IDENTITY_SCHEMA = 'opscore.vercel-release-identity.v1';
function normalizedReleaseTag(value) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(raw) ? raw : null;
}

function normalizedSha(value) {
  const raw = String(value || '').trim().toLowerCase();
  return SHA_RE.test(raw) ? raw : null;
}

function normalizedGithubRunUrl(value, repository, pipelineId) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ''))) return null;
  let url;
  try { url = new URL(String(value || '')); }
  catch { return null; }
  const expectedPath = `/${repository}/actions/runs/${pipelineId}`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password ||
      url.pathname !== expectedPath || url.search || url.hash) return null;
  return url.toString();
}

function readCurrentPostgresHttpAcceptance(env) {
  const filePath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json');
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      status: 'NOT_VERIFIED',
      historicalStatus: null,
      testedAt: null,
      evidenceCommit: null,
      evidencePipelineId: null
    };
  }

  const status = String(evidence.status || '');
  const expectedCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT || env.CI_COMMIT_SHA);
  const expectedPipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || env.CI_PIPELINE_ID || '').trim();
  const evidenceCommit = normalizedSha(evidence.commit || evidence.testedCodeCommit || evidence.sourceCommit);
  const evidencePipelineId = String(evidence.pipelineId || '').trim();
  const exactMatch = Boolean(
    status === 'PASS' &&
    expectedCommit &&
    evidenceCommit === expectedCommit &&
    PIPELINE_RE.test(expectedPipelineId) &&
    evidencePipelineId === expectedPipelineId
  );

  return {
    status: status === 'FAIL' ? 'FAIL' : exactMatch ? 'PASS' : 'NOT_VERIFIED',
    historicalStatus: status || null,
    testedAt: evidence.testedAt || evidence.completedAt || evidence.generatedAt || null,
    evidenceCommit,
    evidencePipelineId: evidencePipelineId || null,
    currentCandidateMatch: exactMatch
  };
}

function readEmbeddedBuildIdentity(identityPath = path.join(__dirname, 'opscore-vercel-release-identity.json')) {
  let value;
  try { value = JSON.parse(fs.readFileSync(identityPath, 'utf8')); }
  catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const commitSha = normalizedSha(value.commitSha);
  const pipelineId = String(value.pipelineId || '').trim();
  const ref = String(value.ref || '').trim();
  if (value.schemaVersion !== IDENTITY_SCHEMA || value.deploymentSource !== 'github-actions-cli' ||
      !commitSha || !PIPELINE_RE.test(pipelineId) || ref !== 'main') return null;
  const runAttempt = Number(value.runAttempt);
  return {
    deploymentSource: value.deploymentSource,
    commitSha,
    pipelineId,
    ref,
    runAttempt: Number.isSafeInteger(runAttempt) && runAttempt > 0 ? runAttempt : null,
    pipelineUrl: normalizedGithubRunUrl(value.runUrl, value.repository, pipelineId)
  };
}

function createPublicReleaseProof(env = process.env, now = () => new Date(), identityPath) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  const proofEnv = identity ? {
    ...env,
    OPSC_RELEASE_DEPLOYMENT_SOURCE: identity.deploymentSource,
    OPSC_RELEASE_CI_COMMIT: identity.commitSha,
    OPSC_RELEASE_CI_PIPELINE_ID: identity.pipelineId,
    OPSC_RELEASE_CI_REF: identity.ref,
    OPSC_SOURCE_COMMIT_SHA: identity.commitSha
  } : env;
  const deployment = createDeploymentProof(proofEnv, now);
  const releaseTag = normalizedReleaseTag(proofEnv.OPSC_RELEASE_TAG || proofEnv.CI_COMMIT_TAG);
  const sourceCommit = deployment.source.commitSha;
  const ciCommit = normalizedSha(proofEnv.OPSC_RELEASE_CI_COMMIT);
  const pipelineId = String(proofEnv.OPSC_RELEASE_CI_PIPELINE_ID || '').trim();
  const ciVerified = Boolean(sourceCommit && ciCommit === sourceCommit && PIPELINE_RE.test(pipelineId));
  const postgresHttpAcceptance = readCurrentPostgresHttpAcceptance({ ...proofEnv, OPSC_RELEASE_CI_COMMIT: ciCommit, OPSC_RELEASE_CI_PIPELINE_ID: pipelineId });

  const packageCommit = normalizedSha(proofEnv.OPSC_RELEASE_PACKAGE_COMMIT);
  const packageSha = String(proofEnv.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const packageVerified = Boolean(sourceCommit && packageCommit === sourceCommit && HASH_RE.test(packageSha));

  const acceptanceCommit = normalizedSha(proofEnv.OPSC_PRODUCTION_ACCEPTANCE_COMMIT);
  const acceptanceAt = String(proofEnv.OPSC_PRODUCTION_ACCEPTANCE_AT || '').trim();
  const acceptanceDate = acceptanceAt ? new Date(acceptanceAt) : null;
  const acceptanceEvidenceSha = String(proofEnv.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || '').trim().toLowerCase();
  // PASS_PRODUCTION requires commit+time match AND a published SHA-256 of a production-acceptance evidence document.
  // Env timestamps alone are not behavioral proof.
  const acceptanceVerified = Boolean(
    ciVerified &&
    sourceCommit &&
    acceptanceCommit === sourceCommit &&
    acceptanceDate &&
    !Number.isNaN(acceptanceDate.getTime()) &&
    HASH_RE.test(acceptanceEvidenceSha)
  );

  return {
    schemaVersion: 'opscore.public-release-proof.v2',
    product: 'OpsCore',
    version: '0.11.62',
    releaseTag,
    sourceCommitIdentitySource: deployment.source.commitIdentitySource,
    status: ciVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
    sourceCommit,
    deployment: {
      status: deployment.status,
      environment: deployment.deployment.environment,
      id: deployment.deployment.id,
      ref: deployment.source.ref,
      provider: deployment.source.provider
    },
    ci: {
      status: ciVerified ? 'PASS' : 'UNVERIFIED',
      pipelineId: ciVerified ? Number(pipelineId) : null,
      commitSha: ciVerified ? ciCommit : null,
      pipelineUrl: ciVerified ? identity?.pipelineUrl || null : null,
      runAttempt: ciVerified ? identity?.runAttempt || null : null,
      evidenceScope: 'GitHub Actions CI commit-match is bound to the embedded build identity; use pipelineUrl to inspect the full gate report.'
    },
    gates: {
      commercialClosure: ciVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
      livePostgresRls: ciVerified ? 'PASS_TEST_SCOPE' : 'UNVERIFIED',
      productionSessionTenantBoundary: acceptanceVerified ? 'PASS_PRODUCTION' : 'NOT_VERIFIED',
      productionRecoveryBundle: acceptanceVerified ? 'PASS_PRODUCTION' : 'NOT_VERIFIED',
      productionIsolationCertification: (String(proofEnv.OPSC_PRODUCTION_ISOLATION_CERTIFICATION || '').trim().toUpperCase() === 'CERTIFIED' && acceptanceVerified) ? 'CERTIFIED' : 'NOT_CERTIFIED',
      mobileStoreArtifacts: 'REMAINING_BUYER',
      nativeTranslationReview: 'REMAINING_BUYER',
      licensedStreetMap: 'REMAINING_BUYER',
      postgresHttpAcceptance: postgresHttpAcceptance.status
    },
    productionAcceptance: {
      status: acceptanceVerified ? 'PASS' : 'NOT_VERIFIED',
      commitSha: acceptanceVerified ? acceptanceCommit : null,
      checkedAt: acceptanceVerified ? acceptanceDate.toISOString() : null,
      evidenceSha256: acceptanceVerified ? acceptanceEvidenceSha : null,
      evidenceNote: acceptanceVerified
        ? 'SHA-256 of production-acceptance evidence document bound by operator; inspect the GitHub Actions verification path for the JSON body.'
        : null
    },
    postgresHttpAcceptance,
    packageFingerprint: {
      algorithm: 'SHA-256',
      status: packageVerified ? 'PUBLISHED' : 'UNVERIFIED',
      value: packageVerified ? packageSha : null,
      sourceCommit: packageVerified ? packageCommit : null
    },
    checkedAt: now().toISOString(),
    note: 'Release evidence is bound to the source commit reported by the running Vercel deployment. PostgreSQL RLS CI evidence is test-scoped and does not certify every production API route. PostgreSQL HTTP acceptance is PASS only when its evidence commit and pipeline exactly match the running release; historical HTTP acceptance remains NOT_VERIFIED for a newer candidate. Production session/recovery evidence is shown only when an acceptance record matches the deployed commit and OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 publishes the SHA-256 of a behavioral evidence document (login/session/recovery isolation). productionIsolationCertification is CERTIFIED only when OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED is explicitly set and production acceptance evidence is bound to the deployed commit; otherwise NOT_CERTIFIED. Signed mobile binaries, native-speaker localization review, and a licensed street-map provider remain buyer-owned.'
  };
};

function hasVerifiedProductionRelease(env = process.env, identityPath) {
  const proof = createPublicReleaseProof(env, () => new Date(), identityPath);
  return proof.status === 'PASS_WITH_BUYER_RESIDUALS' &&
    proof.ci.status === 'PASS' &&
    proof.deployment.status === 'identified' &&
    proof.deployment.environment === 'production' &&
    proof.deployment.ref === 'main' &&
    proof.sourceCommitIdentitySource === 'github-actions-cli-assertion';
}

module.exports = { createPublicReleaseProof, hasVerifiedProductionRelease, readEmbeddedBuildIdentity };
