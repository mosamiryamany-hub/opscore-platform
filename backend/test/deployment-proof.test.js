'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeploymentProof } = require('../src/deployment-proof');

const fixedTime = () => new Date('2026-10-22T20:00:00.000Z');

test('deployment proof exposes the actual Vercel Git identity with a validated commit and deployment id', () => {
  const proof = createDeploymentProof({
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    VERCEL_GIT_COMMIT_REF: 'main',
    VERCEL_GIT_PROVIDER: 'gitlab',
    VERCEL_DEPLOYMENT_ID: 'dpl_CwEH24wVifpz5e7VeHSqTuEEaE38',
    VERCEL_ENV: 'production',
    DATABASE_URL: 'postgres://private-secret'
  }, fixedTime);

  assert.equal(proof.schemaVersion, 'opscore.public-deployment-proof.v2');
  assert.equal(proof.status, 'identified');
  assert.equal(proof.source.provider, 'gitlab');
  assert.equal(proof.source.ref, 'main');
  assert.equal(proof.source.commitSha, '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a');
  assert.equal(proof.deployment.environment, 'production');
  assert.equal(proof.deployment.id, 'dpl_CwEH24wVifpz5e7VeHSqTuEEaE38');
  assert.equal(proof.checkedAt, '2026-10-22T20:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(proof), /private-secret|postgres:\/\//);
  assert.match(proof.note, /Package fingerprint, production behavior, and database isolation are verified separately/);
});

test('deployment proof accepts SHA-256 CI identity and labels its authority explicitly', () => {
  const sha256Commit = '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1';
  const proof = createDeploymentProof({
    OPSC_RELEASE_CI_COMMIT: sha256Commit,
    OPSC_RELEASE_CI_REF: 'main',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production'
  }, fixedTime);
  assert.equal(proof.status, 'identified');
  assert.equal(proof.source.commitSha, sha256Commit);
  assert.equal(proof.source.commitIdentitySource, 'gitlab-ci-runtime-assertion');
  assert.equal(proof.source.provider, 'gitlab');
  assert.equal(proof.source.ref, 'main');
});

test('deployment proof prefers native Vercel Git metadata over a separate CI assertion', () => {
  const proof = createDeploymentProof({
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    OPSC_RELEASE_CI_COMMIT: '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production'
  }, fixedTime);
  assert.equal(proof.source.commitSha, '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a');
  assert.equal(proof.source.commitIdentitySource, 'vercel-git-metadata');
});

test('CLI deployment identity ignores stale Vercel Git variables and uses the explicit CI commit', () => {
  const sha256Commit = '59bd4c8bd4ab8227bd6dce02cb6c9b67d77dd8feafa77658e4ed849df2cce8e1';
  const proof = createDeploymentProof({
    OPSC_RELEASE_DEPLOYMENT_SOURCE: 'gitlab-ci-cli',
    OPSC_RELEASE_CI_COMMIT: sha256Commit,
    OPSC_RELEASE_CI_REF: 'main',
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    VERCEL_GIT_COMMIT_REF: 'stale-branch',
    VERCEL_GIT_PROVIDER: 'gitlab',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production'
  }, fixedTime);
  assert.equal(proof.source.commitSha, sha256Commit);
  assert.equal(proof.source.ref, 'main');
  assert.equal(proof.source.commitIdentitySource, 'gitlab-ci-cli-assertion');
  assert.equal(proof.deployment.method, 'cli');
});

test('deployment proof fails closed when the commit SHA is missing or malformed', () => {
  for (const commit of ['', 'not-a-sha', '0551c92e']) {
    const proof = createDeploymentProof({
      VERCEL_GIT_COMMIT_SHA: commit,
      VERCEL_DEPLOYMENT_ID: 'dpl_123456',
      VERCEL_ENV: 'production'
    }, fixedTime);
    assert.equal(proof.status, 'unavailable');
    assert.equal(proof.source.commitSha, null);
  }
});

test('deployment proof fails closed when deployment identity or environment is missing', () => {
  const noId = createDeploymentProof({
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    VERCEL_ENV: 'production'
  }, fixedTime);
  assert.equal(noId.status, 'unavailable');
  assert.equal(noId.deployment.id, null);

  const noEnvironment = createDeploymentProof({
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456'
  }, fixedTime);
  assert.equal(noEnvironment.status, 'unavailable');
  assert.equal(noEnvironment.deployment.environment, 'unknown');
});

test('deployment proof ignores unsafe ref and unsupported provider values', () => {
  const proof = createDeploymentProof({
    VERCEL_GIT_COMMIT_SHA: '0551c92e543b82312f1a2ac8dc4f37ddd41bc04a',
    VERCEL_GIT_COMMIT_REF: 'main<script>alert(1)</script>',
    VERCEL_GIT_PROVIDER: 'other',
    VERCEL_DEPLOYMENT_ID: 'dpl_123456',
    VERCEL_ENV: 'production'
  }, fixedTime);
  assert.equal(proof.status, 'identified');
  assert.equal(proof.source.ref, null);
  assert.equal(proof.source.provider, 'unknown');
});
