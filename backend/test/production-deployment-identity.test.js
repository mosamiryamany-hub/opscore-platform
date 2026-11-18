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


test('accepts only the exact OIDC-bound unaliased Production candidate identity and deployment pin', async () => {
  const origin = 'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app';
  const env = {
    OPSC_PRODUCTION_CANDIDATE_MODE: 'true',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_Production123',
    VERCEL_TRUSTED_OIDC_TOKEN: 'header.payload.signature'
  };
  const identity = await readProductionDeploymentIdentity(origin, expectedCommit, async (url, options) => {
    assert.equal(url, origin + '/api/verify/release');
    assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'], env.VERCEL_TRUSTED_OIDC_TOKEN);
    return response(200, proof);
  }, { env });

  assert.equal(identity.deploymentId, 'dpl_Production123');
  assert.equal(identity.environment, 'production');
  assert.equal(identity.ref, 'main');
});

test('candidate identity rejects missing fail-closed flags, wrong team hosts, missing OIDC and deployment-ID mismatch', async () => {
  const origin = 'https://opscore-platform-candidate123-mosamiryamany-1692.vercel.app';
  const env = {
    OPSC_PRODUCTION_CANDIDATE_MODE: 'true',
    OPSC_PRODUCTION_HOLD: 'true',
    OPSC_RELEASE_VERIFIED: 'false',
    OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'true',
    OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_Production123',
    VERCEL_TRUSTED_OIDC_TOKEN: 'header.payload.signature'
  };
  for (const change of [
    { OPSC_PRODUCTION_HOLD: 'false' },
    { OPSC_RELEASE_VERIFIED: 'true' },
    { OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED: 'false' },
    { VERCEL_TRUSTED_OIDC_TOKEN: '' },
    { OPSC_PRODUCTION_CANDIDATE_MODE: 'false' }
  ]) {
    await assert.rejects(
      readProductionDeploymentIdentity(origin, expectedCommit, async () => response(200, proof), { env: { ...env, ...change } }),
      /PRODUCTION_CANDIDATE_HTTP_ORIGIN_NOT_APPROVED/
    );
  }
  await assert.rejects(
    readProductionDeploymentIdentity('https://opscore-platform-candidate123-other-team.vercel.app', expectedCommit,
      async () => response(200, proof), { env }),
    /PRODUCTION_CANDIDATE_HTTP_ORIGIN_NOT_APPROVED/
  );
  await assert.rejects(
    readProductionDeploymentIdentity(origin, expectedCommit, async () => response(200, proof), {
      env: { ...env, OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID: 'dpl_Different123' }
    }),
    /PRODUCTION_RELEASE_IDENTITY_NOT_ATTESTED/
  );
});
