#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const COMMIT_SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function main() {
  const archiveArg = process.argv[2];
  const outputArg = process.argv[3] || path.resolve('dist/COMMERCIAL_RELEASE_STATEMENT.json');
  if (!archiveArg) throw new Error('RELEASE_ARCHIVE_PATH_REQUIRED');
  const archivePath = path.resolve(archiveArg);
  const outputPath = path.resolve(outputArg);
  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) throw new Error('RELEASE_ARCHIVE_NOT_FOUND');
  if (archivePath === outputPath) throw new Error('ATTESTATION_MUST_BE_OUTSIDE_ARCHIVE');
  const projectRoot = path.resolve(__dirname, '..');
  const version = JSON.parse(fs.readFileSync(path.join(projectRoot, 'backend', 'package.json'), 'utf8')).version;
  const commitText = String(process.env.CI_COMMIT_SHA || '').trim().toLowerCase();
  const sourceCommit = COMMIT_SHA_RE.test(commitText) ? commitText : null;
  const pipelineText = String(process.env.CI_PIPELINE_ID || '').trim();
  const ciAttested = process.env.CI_JOB_NAME === 'commercial-closure' && Boolean(sourceCommit) && /^[1-9][0-9]*$/.test(pipelineText);
  const pipelineId = ciAttested ? Number(pipelineText) : null;
  const projectUrl = String(process.env.CI_PROJECT_URL || '').trim();
  const pipelineUrl = ciAttested
    ? (String(process.env.CI_PIPELINE_URL || '').trim() || (projectUrl ? projectUrl + '/-/pipelines/' + pipelineId : null))
    : null;
  const acceptanceCommitText = String(process.env.OPSC_PRODUCTION_ACCEPTANCE_COMMIT || '').trim().toLowerCase();
  const acceptanceAtText = String(process.env.OPSC_PRODUCTION_ACCEPTANCE_AT || '').trim();
  const acceptanceAt = acceptanceAtText ? new Date(acceptanceAtText) : null;
  const acceptanceEvidenceSha = String(process.env.OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256 || '').trim().toLowerCase();
  const productionAcceptanceVerified = Boolean(
    ciAttested &&
    sourceCommit &&
    acceptanceCommitText === sourceCommit &&
    acceptanceAt &&
    !Number.isNaN(acceptanceAt.getTime()) &&
    /^[a-f0-9]{64}$/.test(acceptanceEvidenceSha)
  );
  const statement = {
    schemaVersion: 'opscore.commercial-release-statement.v2',
    artifact: {
      filename: path.basename(archivePath),
      sha256: { algorithm: 'SHA-256', value: sha256(archivePath) },
      bytes: fs.statSync(archivePath).size
    },
    version,
    releaseTag: String(process.env.CI_COMMIT_TAG || '').trim() || null,
    sourceCommit,
    pipelineId,
    pipelineUrl,
    commercialClosure: ciAttested ? 'PASS_WITH_BUYER_RESIDUALS' : 'NOT_ATTESTED',
    productionCertification: false,
    productionAcceptance: {
      status: productionAcceptanceVerified ? 'PASS' : 'NOT_VERIFIED_AT_BUILD',
      commit: productionAcceptanceVerified ? sourceCommit : null,
      checkedAt: productionAcceptanceVerified ? acceptanceAt.toISOString() : null,
      evidenceSha256: productionAcceptanceVerified ? acceptanceEvidenceSha : null,
      scope: productionAcceptanceVerified ? 'commit-bound production evidence supplied to this CI run' : 'production acceptance is evaluated after deployment; this build-time statement does not assert live acceptance'
    },
    officialRepo: String(process.env.CI_PROJECT_PATH || 'mosamiryamany-hub1/opscore-commercial-final'),
    generatedAt: new Date().toISOString(),
    note: 'The archive digest is calculated from the completed ZIP and stored externally to avoid a self-referential checksum. NOT_VERIFIED_AT_BUILD means the build did not receive matching commit-bound production acceptance inputs; it is not a claim about later live endpoint state. productionCertification remains false until separate formal isolation certification is recorded.'
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(statement, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    status: ciAttested ? 'ATTESTED_CI_ARTIFACT_WITH_BUYER_RESIDUALS' : 'ARCHIVE_HASHED_BUT_NOT_CI_ATTESTED',
    archive: statement.artifact.filename,
    sha256: statement.artifact.sha256.value,
    bytes: statement.artifact.bytes,
    sourceCommit,
    pipelineId,
    productionCertification: false,
    output: outputPath
  }, null, 2) + '\n');
}
try { main(); } catch (error) {
  process.stderr.write((error && error.message ? error.message : 'RELEASE_ATTESTATION_FAILED') + '\n');
  process.exitCode = 1;
}
