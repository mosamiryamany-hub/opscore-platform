'use strict';

const fs = require('node:fs');
const path = require('node:path');
const COMMIT_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const RUN_ID_RE = /^[1-9][0-9]{0,14}$/;
const OUTPUT_PATH = path.resolve(__dirname, '..', 'backend', 'src', 'opscore-vercel-release-identity.json');

function createIdentity(env = process.env) {
  const ref = String(env.GITHUB_REF || '').trim();
  const refName = String(env.GITHUB_REF_NAME || '').trim();
  const commitSha = String(env.GITHUB_SHA || '').trim().toLowerCase();
  const pipelineId = String(env.GITHUB_RUN_ID || '').trim();
  const runAttempt = String(env.GITHUB_RUN_ATTEMPT || '').trim();
  const serverUrl = String(env.GITHUB_SERVER_URL || '').replace(/\/$/, '');
  const repository = String(env.GITHUB_REPOSITORY || '').trim();

  if (ref !== 'refs/heads/main' || refName !== 'main') throw new Error('UNAPPROVED_PRODUCTION_REF');
  if (!COMMIT_RE.test(commitSha)) throw new Error('GITHUB_COMMIT_SHA_INVALID');
  if (!RUN_ID_RE.test(pipelineId)) throw new Error('GITHUB_RUN_ID_INVALID');
  if (!/^[1-9][0-9]{0,5}$/.test(runAttempt)) throw new Error('GITHUB_RUN_ATTEMPT_INVALID');

  const runUrl = serverUrl && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `${serverUrl}/${repository}/actions/runs/${pipelineId}`
    : null;
  const packageSha = String(env.OPSC_RELEASE_PACKAGE_SHA256 || '').trim().toLowerCase();
  const packageCommit = String(env.OPSC_RELEASE_PACKAGE_COMMIT || commitSha).trim().toLowerCase();
  const HASH_RE = /^(?:[a-f0-9]{64})$/;
  if (packageSha && !HASH_RE.test(packageSha)) throw new Error('PACKAGE_SHA256_INVALID');
  if (packageSha && packageCommit !== commitSha) throw new Error('PACKAGE_COMMIT_MISMATCH');

  return {
    schemaVersion: 'opscore.vercel-release-identity.v1',
    deploymentSource: 'github-actions-cli',
    commitSha,
    pipelineId,
    runAttempt: Number(runAttempt),
    ref: refName,
    repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ? repository : null,
    runUrl,
    packageSha256: packageSha || null,
    packageCommit: packageSha ? packageCommit : null
  };
}

function writeIdentity(outputPath = OUTPUT_PATH, env = process.env) {
  const identity = createIdentity(env);
  const destination = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(identity, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return { outputPath: destination, identity };
}

if (require.main === module) {
  const result = writeIdentity();
  console.log(`VERCEL_RELEASE_IDENTITY=PASS ref=${result.identity.ref} run=${result.identity.pipelineId} commit=${result.identity.commitSha} package=${result.identity.packageSha256 || 'none'}`);
}

module.exports = { OUTPUT_PATH, createIdentity, writeIdentity };
