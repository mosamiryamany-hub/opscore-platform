'use strict';

const { createPublicReleaseProof } = require('./release-proof');
const { createSelfHostedReleaseProof } = require('./self-hosted-release-proof');

const SELF_HOSTED_SCHEMA = 'opscore.public-self-hosted-release-proof.v1';
const ROUTER_SCHEMA = 'opscore.public-release-proof-router.v1';

/**
 * Selects the proof implementation for the existing public release-verification
 * endpoint. The default is the unchanged Vercel verifier. Self-hosted mode must be
 * selected explicitly and still requires a trusted Ed25519 public key.
 *
 * This function only selects a proof format. It never opens the production hold,
 * enables signed tenant context, or changes database migration policy.
 */
function createPlatformReleaseProof(env = process.env, options = {}) {
  const mode = String(env.OPSC_RELEASE_PROOF_MODE || 'vercel').trim().toLowerCase();

  if (mode === 'vercel') {
    return createPublicReleaseProof(env);
  }

  if (mode === 'self-hosted') {
    return {
      schemaVersion: SELF_HOSTED_SCHEMA,
      ...createSelfHostedReleaseProof(env, options)
    };
  }

  return {
    schemaVersion: ROUTER_SCHEMA,
    status: 'NOT_VERIFIED',
    platform: 'unknown',
    mode,
    reasons: ['RELEASE_PROOF_MODE_UNSUPPORTED'],
    identity: null
  };
}

module.exports = {
  SELF_HOSTED_SCHEMA,
  ROUTER_SCHEMA,
  createPlatformReleaseProof
};
