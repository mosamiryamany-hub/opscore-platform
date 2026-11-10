'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('external release attestation binds the exact completed archive digest and does not certify production', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-attestation-'));
  try {
    const archive = path.join(temp, 'package.zip');
    const output = path.join(temp, 'COMMERCIAL_RELEASE_STATEMENT.json');
    fs.writeFileSync(archive, 'controlled test artifact bytes');
    const expectedSha = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const sourceCommit = '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1';
    const pipelineId = '2978621516';
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../scripts/write-release-attestation.js'),
      archive,
      output
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_JOB_NAME: 'commercial-closure',
        CI_COMMIT_SHA: sourceCommit,
        CI_PIPELINE_ID: pipelineId,
        CI_PIPELINE_URL: 'https://gitlab.com/mosamiryamany-hub1/opscore-commercial-final/-/pipelines/2978621516',
        CI_PROJECT_PATH: 'mosamiryamany-hub1/opscore-commercial-final',
        OPSC_PRODUCTION_ACCEPTANCE_COMMIT: '',
        OPSC_PRODUCTION_ACCEPTANCE_AT: '',
        OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: ''
      }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const statement = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(statement.artifact.sha256.value, expectedSha);
    assert.equal(statement.artifact.bytes, fs.statSync(archive).size);
    assert.equal(statement.sourceCommit, sourceCommit);
    assert.equal(statement.pipelineId, Number(pipelineId));
    assert.equal(statement.productionCertification, false);
    assert.equal(statement.productionAcceptance.status, 'NOT_VERIFIED_AT_BUILD');
    assert.match(statement.productionAcceptance.scope, /after deployment/);
    assert.equal(statement.commercialClosure, 'PASS_WITH_BUYER_RESIDUALS');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});


test('external release attestation only carries production acceptance when it matches the attested commit and evidence hash', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opscore-release-acceptance-'));
  try {
    const archive = path.join(temp, 'package.zip');
    const output = path.join(temp, 'COMMERCIAL_RELEASE_STATEMENT.json');
    fs.writeFileSync(archive, 'acceptance-bound test artifact');
    const sourceCommit = 'c'.repeat(40);
    const evidenceSha = 'd'.repeat(64);
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../scripts/write-release-attestation.js'),
      archive,
      output
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_JOB_NAME: 'commercial-closure',
        CI_COMMIT_SHA: sourceCommit,
        CI_PIPELINE_ID: '2978621517',
        CI_PROJECT_PATH: 'mosamiryamany-hub1/opscore-commercial-final',
        OPSC_PRODUCTION_ACCEPTANCE_COMMIT: sourceCommit,
        OPSC_PRODUCTION_ACCEPTANCE_AT: '2026-10-23T10:00:00.000Z',
        OPSC_PRODUCTION_ACCEPTANCE_EVIDENCE_SHA256: evidenceSha
      }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const statement = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(statement.productionAcceptance.status, 'PASS');
    assert.equal(statement.productionAcceptance.commit, sourceCommit);
    assert.equal(statement.productionAcceptance.evidenceSha256, evidenceSha);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
