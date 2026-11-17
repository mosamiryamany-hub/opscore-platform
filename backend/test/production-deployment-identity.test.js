'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readProductionDeploymentIdentity } = require('../scripts/lib/production-deployment-identity');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
  };
}

const expectedCommit = 'a'.repeat(40);
const proof = {
  schemaVersion: 'opscore.public-release-proof.v2',
  status: 'UNVERIFIED',
  sourceCommit: expectedCommit,
  sourceCommitIdentitySource: 'github-actions-cli-assertion',
  deployment: {
    status: 'identified',
    environment: 'production',
    id: 'dpl_Production123',
    ref: 'main',
    provider: 'github'
  },
  ci: {
    status: 'PASS',
    commitSha: expectedCommit,
    pipelineId: 123456789,
    pipelineUrl: 'https://github.com/org/repo/actions/runs/123456789'
  }
};

test('accepts only a deployed Production main identity bound to the expected SHA and pipeline', async () => {
  const identity = await readProductionDeploymentIdentity(
    'https://opscore-platform.vercel.app',
    expectedCommit,
    async (url, options) => {
      assert.equal(url, 'https://opscore-platform.vercel.app/api/verify/release');
      assert.equal(options.method, 'GET');
      return response(200, proof);
    }
  );
  assert.equal(identity.commitSha, expectedCommit);
  assert.equal(identity.ciPipelineId, '123456789');
  assert.equal(identity.deploymentId, 'dpl_Production123');
  assert.equal(identity.ref, 'main');
  assert.equal(identity.environment, 'production');
});

test('rejects a workflow SHA that differs from the actually served Production SHA', async () => {
  await assert.rejects(
    readProductionDeploymentIdentity(
      'https://opscore-platform.vercel.app',
      'b'.repeat(40),
      async () => response(200, proof)
    ),
    /PRODUCTION_DEPLOYED_COMMIT_MISMATCH/
  );
});

test('rejects Preview, missing deployment IDs, and non-CI identity', async () => {
  await assert.rejects(
    readProductionDeploymentIdentity(
      'https://opscore-platform.vercel.app',
      expectedCommit,
      async () => response(200, {
        ...proof,
        deployment: { ...proof.deployment, environment: 'preview' }
      })
    ),
    /PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED/
  );
  await assert.rejects(
    readProductionDeploymentIdentity(
      'https://opscore-platform.vercel.app',
      expectedCommit,
      async () => response(200, {
        ...proof,
        deployment: { ...proof.deployment, id: null }
      })
    ),
    /PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED/
  );
  await assert.rejects(
    readProductionDeploymentIdentity(
      'https://opscore-platform.vercel.app',
      expectedCommit,
      async () => response(200, {
        ...proof,
        sourceCommitIdentitySource: 'operator-source-commit'
      })
    ),
    /PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED/
  );
});

test('does not call external hosts, accept non-success status, or accept malformed JSON', async () => {
  await assert.rejects(
    readProductionDeploymentIdentity('https://example.com', expectedCommit, async () => response(200, proof)),
    /PRODUCTION_HTTP_ORIGIN_NOT_APPROVED/
  );
  await assert.rejects(
    readProductionDeploymentIdentity('https://opscore-platform.vercel.app', expectedCommit, async () => response(503, {})),
    /PRODUCTION_RELEASE_IDENTITY_HTTP_503/
  );
  await assert.rejects(
    readProductionDeploymentIdentity('https://opscore-platform.vercel.app', expectedCommit, async () => response(200, '{bad')),
    /PRODUCTION_RELEASE_IDENTITY_JSON_INVALID/
  );
});
