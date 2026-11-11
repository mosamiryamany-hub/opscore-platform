'use strict';

const { createDeploymentProof } = require('./deployment-proof');
const crypto = require('node:crypto');
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

function readCurrentPostgresHttpAcceptance(env, filePath = path.join(__dirname, '..', 'docs', 'verification', 'POSTGRES_HTTP_ACCEPTANCE_RESULT.json')) {
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

function readProductionAcceptanceEvidence(env, expectedCommit, expectedPipelineId, evidencePath = path.join(__dirname, '..', 'docs', 'verification', 'PRODUCTION_ACCEPTANCE_RESULT.json'), now = () => new Date()) {
  let raw;
  let evidence;
  try {
    raw = fs.readFileSync(evidencePath, 'utf8');
    evidence = JSON.parse(raw);
  } catch {
    return { status: 'NOT_VERIFIED', evidenceSha256: null, sourceCommit: null, pipelineId: null, testedAt: null };
  }

  const evidenceSha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const publishedSha = String(env.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || '').trim().toLowerCase();
  const sourceCommit = normalizedSha(evidence.sourceCommit);
  const pipelineId = String(evidence.pipelineId || '').trim();
  const testedAt = String(evidence.testedAt || '').trim();
  const testedDate = testedAt ? new Date(testedAt) : null;
  const checks = evidence.checks && typeof evidence.checks === 'object' ? evidence.checks : {};
  const role = evidence.runtimeRole && typeof evidence.runtimeRole === 'object' ? evidence.runtimeRole : {};
  const tableCoverage = evidence.tenantTableCoverage && typeof evidence.tenantTableCoverage === 'object' ? evidence.tenantTableCoverage : {};
  const routeCoverage = evidence.apiRouteCoverage && typeof evidence.apiRouteCoverage === 'object' ? evidence.apiRouteCoverage : {};
  const nowMs = now().getTime();
  const testedMs = testedDate ? testedDate.getTime() : NaN;
  const roleSafe = role.name === 'opscore_runtime' &&
    role.login === true && role.superuser === false && role.bypassRls === false &&
    role.createRole === false && role.createDatabase === false &&
    role.elevatedMembershipCount === 0;
  const coverageSafe = tableCoverage.status === 'PASS' &&
    Number.isSafeInteger(tableCoverage.totalTables) && tableCoverage.totalTables > 0 &&
    tableCoverage.testedTables === tableCoverage.totalTables &&
    routeCoverage.status === 'PASS' &&
    Number.isSafeInteger(routeCoverage.totalRoutes) && routeCoverage.totalRoutes > 0 &&
    routeCoverage.testedRoutes === routeCoverage.totalRoutes;
  const checksSafe = checks.migration053 === 'PASS' &&
    checks.tenantSessionIsolation === 'PASS' &&
    checks.crossTenantAccessDenied === 'PASS' &&
    checks.recoveryRestore === 'PASS' &&
    checks.backupIntegrity === 'PASS';
  const exactMatch = Boolean(
    evidence.schemaVersion === 'opscore.production-acceptance.v1' &&
    evidence.status === 'PASS' &&
    evidence.environment === 'production' &&
    evidence.databaseEngine === 'postgres' &&
    sourceCommit && sourceCommit === expectedCommit &&
    PIPELINE_RE.test(String(expectedPipelineId || '')) &&
    pipelineId === String(expectedPipelineId) &&
    testedDate && !Number.isNaN(testedMs) && testedMs <= nowMs &&
    checksSafe && coverageSafe && roleSafe &&
    HASH_RE.test(publishedSha) && publishedSha === evidenceSha256
  );

  return {
    status: exactMatch ? 'PASS' : 'NOT_VERIFIED',
    evidenceSha256: exactMatch ? evidenceSha256 : null,
    sourceCommit,
    pipelineId: pipelineId || null,
    testedAt: testedDate && !Number.isNaN(testedMs) ? testedDate.toISOString() : null
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
  const packageSha256 = String(value.packageSha256 || '').trim().toLowerCase();
  const packageCommit = normalizedSha(value.packageCommit || value.commitSha);
  const packageOk = Boolean(packageSha256 && HASH_RE.test(packageSha256) && packageCommit && packageCommit === commitSha);
  return {
    deploymentSource: value.deploymentSource,
    commitSha,
    pipelineId,
    ref,
    runAttempt: Number.isSafeInteger(runAttempt) && runAttempt > 0 ? runAttempt : null,
    pipelineUrl: normalizedGithubRunUrl(value.runUrl, value.repository, pipelineId),
    packageSha256: packageOk ? packageSha256 : null,
    packageCommit: packageOk ? packageCommit : null
  };
}

function createPublicReleaseProof(env = process.env, now = () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath) {
  const identity = readEmbeddedBuildIdentity(identityPath);
  const proofEnv = identity ? {
    ...env,
    OPSC_RELEASE_DEPLOYMENT_SOURCE: identity.deploymentSource,
    OPSC_RELEASE_CI_COMMIT: identity.commitSha,
    OPSC_RELEASE_CI_PIPELINE_ID: identity.pipelineId,
    OPSC_RELEASE_CI_REF: identity.ref,
    OPSC_SOURCE_COMMIT_SHA: identity.commitSha,
    OPSC_RELEASE_PACKAGE_SHA256: identity.packageSha256 || env.OPSC_RELEASE_PACKAGE_SHA256,
    OPSC_RELEASE_PACKAGE_COMMIT: identity.packageCommit || identity.commitSha || env.OPSC_RELEASE_PACKAGE_COMMIT
  } : env;
  const deployment = createDeploymentProof(proofEnv, now);
  const releaseTag = normalizedReleaseTag(proofEnv.OPSC_RELEASE_TAG || proofEnv.CI_COMMIT_TAG);
  const sourceCommit = deployment.source.commitSha;
  const ciCommit = normalizedSha(proofEnv.OPSC_RELEASE_CI_COMMIT);
  const pipelineId = String(proofEnv.OPSC_RELEASE_CI_PIPELINE_ID || '').trim();
  const ciVerified = Boolean(sourceCommit && ciCommit === sourceCommit && PIPELINE_RE.test(pipelineId));
  const postgresHttpAcceptance = readCurrentPostgresHttpAcceptance({ ...proofEnv, OPSC_RELEASE_CI_COMMIT: ciCommit, OPSC_RELEASE_CI_PIPELINE_ID: pipelineId }, postgresHttpAcceptancePath);

  const packageCommit = normalizedSha(proofEnv.OPSC_RELEASE_PACKAGE_COMMIT);
  const packageSha = String(proofEnv.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const packageVerified = Boolean(sourceCommit && packageCommit === sourceCommit && HASH_RE.test(packageSha));

  const productionAcceptance = readProductionAcceptanceEvidence(
    proofEnv,
    sourceCommit,
    pipelineId,
    productionAcceptanceEvidencePath,
    now
  );
  const acceptanceVerified = ciVerified && productionAcceptance.status === 'PASS';
  const releaseIdentityVerified = Boolean(
    ciVerified &&
    packageVerified &&
    deployment.status === 'identified' &&
    deployment.deployment.environment === 'production' &&
    deployment.source.ref === 'main'
  );

  return {
    schemaVersion: 'opscore.public-release-proof.v2',
    product: 'OpsCore',
    version: '0.11.62',
    releaseTag,
    sourceCommitIdentitySource: deployment.source.commitIdentitySource,
    status: releaseIdentityVerified ? 'PASS_WITH_BUYER_RESIDUALS' : 'UNVERIFIED',
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
      commitSha: acceptanceVerified ? productionAcceptance.sourceCommit : null,
      pipelineId: acceptanceVerified ? productionAcceptance.pipelineId : null,
      checkedAt: acceptanceVerified ? productionAcceptance.testedAt : null,
      evidenceSha256: acceptanceVerified ? productionAcceptance.evidenceSha256 : null,
      evidenceNote: acceptanceVerified ? 'SHA-256 was recomputed from the embedded production acceptance JSON and matched the published digest.' : null
    },
    postgresHttpAcceptance,
    packageFingerprint: {
      algorithm: 'SHA-256',
      status: packageVerified ? 'PUBLISHED' : 'UNVERIFIED',
      value: packageVerified ? packageSha : null,
      sourceCommit: packageVerified ? packageCommit : null
    },
    checkedAt: now().toISOString(),
    note: 'Release evidence is bound to the source commit reported by the running Vercel deployment. PostgreSQL RLS CI evidence is test-scoped and does not certify every production API route. PostgreSQL HTTP acceptance is PASS only when its evidence commit and pipeline exactly match the running release; historical HTTP acceptance remains NOT_VERIFIED for a newer candidate. Production session/recovery evidence is shown only when an acceptance record matches the deployed commit and OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 publishes the SHA-256 of a behavioral evidence document (login/session/recovery isolation). productionIsolationCertification is CERTIFIED only when OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED is explicitly set and the embedded production acceptance evidence file is schema-valid, hash-verified, and bound to the exact deployed commit and pipeline; otherwise NOT_CERTIFIED. Signed mobile binaries, native-speaker localization review, and a licensed street-map provider remain buyer-owned.'
  };
};

function hasVerifiedProductionRelease(env = process.env, identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath) {
  const proof = createPublicReleaseProof(env, () => new Date(), identityPath, productionAcceptanceEvidencePath, postgresHttpAcceptancePath);
  return proof.status === 'PASS_WITH_BUYER_RESIDUALS' &&
    proof.ci.status === 'PASS' &&
    proof.packageFingerprint.status === 'PUBLISHED' &&
    proof.deployment.status === 'identified' &&
    proof.deployment.environment === 'production' &&
    proof.deployment.ref === 'main' &&
    proof.sourceCommitIdentitySource === 'github-actions-cli-assertion' &&
    proof.postgresHttpAcceptance.status === 'PASS' &&
    proof.productionAcceptance.status === 'PASS' &&
    proof.gates.productionIsolationCertification === 'CERTIFIED';
}

module.exports = { createPublicReleaseProof, hasVerifiedProductionRelease, readEmbeddedBuildIdentity, readProductionAcceptanceEvidence };
