'use strict';

const { createDeploymentProof } = require('./deployment-proof');
const fs = require('node:fs');
const path = require('node:path');

const SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const PIPELINE_RE = /^[1-9][0-9]{0,14}$/;
function normalizedReleaseTag(value) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(raw) ? raw : null;
}

function normalizedSha(value) {
  const raw = String(value || '').trim().toLowerCase();
  return SHA_RE.test(raw) ? raw : null;
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

function createPublicReleaseProof(env = process.env, now = () => new Date()) {
  const deployment = createDeploymentProof(env, now);
  const releaseTag = normalizedReleaseTag(env.OPSC_RELEASE_TAG || env.CI_COMMIT_TAG);
  const sourceCommit = deployment.source.commitSha;
  const ciCommit = normalizedSha(env.OPSC_RELEASE_CI_COMMIT);
  const pipelineId = String(env.OPSC_RELEASE_CI_PIPELINE_ID || '').trim();
  const ciVerified = Boolean(sourceCommit && ciCommit === sourceCommit && PIPELINE_RE.test(pipelineId));
  const postgresHttpAcceptance = readCurrentPostgresHttpAcceptance({ ...env, OPSC_RELEASE_CI_COMMIT: ciCommit, OPSC_RELEASE_CI_PIPELINE_ID: pipelineId });

  const packageCommit = normalizedSha(env.OPSC_RELEASE_PACKAGE_COMMIT);
  const packageSha = String(env.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const packageVerified = Boolean(sourceCommit && packageCommit === sourceCommit && HASH_RE.test(packageSha));

  const acceptanceCommit = normalizedSha(env.OPSC_PRODUCTION_ACCEPTANCE_COMMIT);
  const acceptanceAt = String(env.OPSC_PRODUCTION_ACCEPTANCE_AT || '').trim();
  const acceptanceDate = acceptanceAt ? new Date(acceptanceAt) : null;
  const acceptanceEvidenceSha = String(env.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || '').trim().toLowerCase();
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
      evidenceScope: 'GitHub Actions CI commit-match asserted by the release operator; inspect the linked pipeline for the full gate report.'
    },
    gates: {
      commercialClosure: ciVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
      livePostgresRls: ciVerified ? 'PASS_TEST_SCOPE' : 'UNVERIFIED',
      productionSessionTenantBoundary: acceptanceVerified ? 'PASS_PRODUCTION' : 'NOT_VERIFIED',
      productionRecoveryBundle: acceptanceVerified ? 'PASS_PRODUCTION' : 'NOT_VERIFIED',
      productionIsolationCertification: (String(env.OPSC_PRODUCTION_ISOLATION_CERTIFICATION || '').trim().toUpperCase() === 'CERTIFIED' && acceptanceVerified) ? 'CERTIFIED' : 'NOT_CERTIFIED',
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
}

module.exports = { createPublicReleaseProof };
