'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATE_DEPLOYMENT_HOST = /^opscore-platform-[a-z0-9-]+-mosamiryamany-1692\\.vercel\\.app$/;
const CANDIDATE_STORAGE_DIRECTORY = 'opscore-candidate-evidence';

function normalizedCandidateHost(env = process.env) {
  const host = String(env.VERCEL_URL || '').trim().toLowerCase();
  return CANDIDATE_DEPLOYMENT_HOST.test(host) ? host : null;
}

function isHeldProductionCandidate(env = process.env) {
  const token = String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_TOKEN || '').trim();
  return String(env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
    && String(env.OPSC_PRODUCTION_HOLD || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_RELEASE_VERIFIED || '').trim().toLowerCase() === 'false'
    && String(env.OPSC_PRODUCTION_CANDIDATE_MODE || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_SIGNED_CONTEXT_CANDIDATE_PROBE_ENABLED || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_REQUIRE_SIGNED_TENANT_CONTEXT || '').trim().toLowerCase() === 'true'
    && String(env.OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED || '').trim().toLowerCase() !== 'true'
    && String(env.OPSC_SIGNED_TENANT_CONTEXT_SESSION_AUTOBIND_ENABLED || '').trim().toLowerCase() !== 'true'
    && /^[a-f0-9]{64}$/i.test(token)
    && Boolean(normalizedCandidateHost(env));
}

function candidateEvidenceStorageRoot(env = process.env, temporaryDirectory = os.tmpdir()) {
  if (!isHeldProductionCandidate(env)) return null;
  const host = normalizedCandidateHost(env);
  const deploymentKey = crypto.createHash('sha256').update(host).digest('hex').slice(0, 32);
  return path.join(path.resolve(temporaryDirectory), CANDIDATE_STORAGE_DIRECTORY, deploymentKey);
}

function resolveEvidenceStorageRoot(env = process.env, temporaryDirectory = os.tmpdir()) {
  const candidateRoot = candidateEvidenceStorageRoot(env, temporaryDirectory);
  if (candidateRoot) return candidateRoot;
  return path.resolve(
    env.OPSC_RELEASE_VERIFICATION_ROOT || env.OPSC_REPOSITORY_PATH || './data/files'
  );
}

// This cleanup is deliberately constrained to one deployment-specific subdirectory
// below the OS temporary directory. It cannot remove the configured production store.
function cleanupCandidateEvidenceStorage(env = process.env, temporaryDirectory = os.tmpdir()) {
  const root = candidateEvidenceStorageRoot(env, temporaryDirectory);
  if (!root) throw new Error('CANDIDATE_EVIDENCE_STORAGE_ENV_NOT_AUTHORIZED');

  const base = path.resolve(path.resolve(temporaryDirectory), CANDIDATE_STORAGE_DIRECTORY);
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== base) throw new Error('CANDIDATE_EVIDENCE_STORAGE_PATH_INVALID');

  try {
    const metadata = fs.lstatSync(resolved);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('CANDIDATE_EVIDENCE_STORAGE_PATH_UNSAFE');
    }
    fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 1 });
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  if (fs.existsSync(resolved)) throw new Error('CANDIDATE_EVIDENCE_STORAGE_RESIDUE_REMAINS');
  return { status: 'PASS', residue: 0 };
}

module.exports = {
  isHeldProductionCandidate,
  candidateEvidenceStorageRoot,
  resolveEvidenceStorageRoot,
  cleanupCandidateEvidenceStorage
};
