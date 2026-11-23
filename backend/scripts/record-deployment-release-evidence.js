'use strict';
/**
 * Record the promoted production deployment's release evidence in the
 * deployment_release_evidence store (migration 072).
 *
 * Called ONLY after the public domain resolves to the promoted deployment and
 * every release gate has passed. Verifies the live release proof on the public
 * domain matches the expected commit/pipeline/deployment id before inserting;
 * any mismatch exits non-zero and records nothing. Never prints a credential,
 * hostname, or connection string.
 */
const crypto = require('node:crypto');

const REQUIRED_CONFIRM = 'RECORD_PROMOTED_DEPLOYMENT_RELEASE_EVIDENCE';
const EXPECTED_SCHEMA = 'opscore.public-release-proof.v2';
const DEFAULT_DOMAIN = 'opscore-platform.vercel.app';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function fetchReleaseProof(domain) {
  const response = await fetch(`https://${domain}/api/verify/release`, { redirect: 'manual' });
  if (response.status !== 200) throw new Error('RELEASE_PROOF_NOT_200:' + response.status);
  return response.json();
}

async function main() {
  if (process.argv[2] !== REQUIRED_CONFIRM) {
    console.log('CONFIRM_INPUT_INVALID');
    process.exit(2);
  }
  const suppliedDeploymentId = String(process.env.OPSC_PROMOTED_DEPLOYMENT_ID || '').trim();
  const domain = String(process.env.OPSC_PROMOTED_DOMAIN || DEFAULT_DOMAIN).trim();
  const expectedCommit = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  const expectedPipeline = String(process.env.GITHUB_RUN_ID || '').trim();
  if (suppliedDeploymentId && !/^dpl_[A-Za-z0-9]+$/.test(suppliedDeploymentId)) { console.log('PROMOTED_DEPLOYMENT_ID_INVALID'); process.exit(2); }
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) { console.log('COMMIT_IDENTITY_INVALID'); process.exit(2); }
  if (!/^[0-9]{1,15}$/.test(expectedPipeline)) { console.log('PIPELINE_IDENTITY_INVALID'); process.exit(2); }
  const proof = await fetchReleaseProof(domain);
  if (proof.schemaVersion !== EXPECTED_SCHEMA) { console.log('RELEASE_PROOF_SCHEMA_INVALID'); process.exit(1); }
  if (proof.status !== 'PASS') { console.log('RELEASE_PROOF_NOT_PASS:' + proof.status); process.exit(1); }
  if (String(proof.sourceCommit || '').toLowerCase() !== expectedCommit) { console.log('RELEASE_PROOF_COMMIT_MISMATCH'); process.exit(1); }
  if (String((proof.ci || {}).pipelineId || '') !== expectedPipeline) { console.log('RELEASE_PROOF_PIPELINE_MISMATCH'); process.exit(1); }
  // When no dpl id is supplied, the proof's own deployment id is adopted —
  // safe because the commit AND pipeline bindings above already pin this
  // exact run's promoted deployment.
  const deploymentId = suppliedDeploymentId || String((proof.deployment || {}).id || '').trim();
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)
      || (proof.deployment || {}).environment !== 'production') { console.log('RELEASE_PROOF_DEPLOYMENT_MISMATCH'); process.exit(1); }
  if (suppliedDeploymentId && deploymentId !== suppliedDeploymentId) { console.log('RELEASE_PROOF_DEPLOYMENT_MISMATCH'); process.exit(1); }

  const recordedReleaseProof = {
    sourceCommit: proof.sourceCommit,
    pipelineId: proof.ci.pipelineId,
    deploymentId,
    status: proof.status
  };
  // The gates summary is derived from the LIVE proof, never from caller input.
  // Migration 072 requires gates_summary to carry BOTH 'allGatesPass' and
  // 'evidenceDigestSha256' (CHECK constraint, error 23514 in run 45190356382).
  // The digest is computed over the digest-free summary plus the recorded
  // release proof, then the summary is published with the digest embedded.
  const baseSummary = { allGatesPass: proof.status === 'PASS', releaseStatus: proof.status, gates: proof.gates || {} };
  const evidenceDigest = sha256(JSON.stringify({ recordedReleaseProof, gatesSummary: baseSummary }));
  const gatesSummary = { ...baseSummary, evidenceDigestSha256: evidenceDigest };

  const { Client } = require('pg');
  const client = new Client({
    connectionString: String(process.env.OPSC_EVIDENCE_OWNER_URL || '').trim(),
    ssl: { rejectUnauthorized: true },
    application_name: 'opscore-deployment-evidence-recorder',
    connectionTimeoutMillis: 12000,
    statement_timeout: 10000
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Self-bootstrap: the store is created idempotently by the owner role with
    // the exact 072 contract, so recording never depends on migration ordering.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.deployment_release_evidence (
        deployment_id text PRIMARY KEY CHECK (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
        evidence_schema_version text NOT NULL CHECK (evidence_schema_version = 'opscore.deployment-release-evidence.v1'),
        source_commit_sha text NOT NULL CHECK (source_commit_sha ~ '^[a-f0-9]{40}$'),
        pipeline_id text NOT NULL CHECK (pipeline_id ~ '^[0-9]{1,15}$'),
        environment text NOT NULL CHECK (environment = 'production'),
        promoted_domain text NOT NULL CHECK (promoted_domain IN ('opscore-platform.vercel.app')),
        gates_summary jsonb NOT NULL CHECK (gates_summary ? 'allGatesPass' AND gates_summary ? 'evidenceDigestSha256'),
        evidence_digest_sha256 text NOT NULL CHECK (evidence_digest_sha256 ~ '^[a-f0-9]{64}$'),
        recorded_at timestamptz NOT NULL DEFAULT now(),
        recorded_by text NOT NULL DEFAULT current_user
      );
      ALTER TABLE public.deployment_release_evidence ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.deployment_release_evidence FORCE ROW LEVEL SECURITY;
      DO $pol$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deployment_release_evidence' AND policyname='deployment_release_evidence_owner_all') THEN
          CREATE POLICY deployment_release_evidence_owner_all ON public.deployment_release_evidence FOR ALL
            USING (current_user = 'neondb_owner') WITH CHECK (current_user = 'neondb_owner');
        END IF;
      END
      $pol$;
      REVOKE ALL ON public.deployment_release_evidence FROM PUBLIC;
    `);
    const inserted = await client.query(
      `INSERT INTO public.deployment_release_evidence
         (deployment_id, evidence_schema_version, source_commit_sha, pipeline_id,
          environment, promoted_domain, gates_summary, evidence_digest_sha256)
       VALUES ($1,'opscore.deployment-release-evidence.v1',$2,$3,'production',$4,$5,$6)
       ON CONFLICT (deployment_id) DO NOTHING
       RETURNING deployment_id`,
      [deploymentId, expectedCommit, expectedPipeline, domain, gatesSummary, evidenceDigest]
    );
    if (inserted.rowCount !== 1) { console.log('EVIDENCE_ROW_ALREADY_RECORDED'); await client.query('ROLLBACK'); process.exit(1); }
    await client.query('COMMIT');
    console.log('DEPLOYMENT_RELEASE_EVIDENCE_RECORDED deploymentId=' + deploymentId + ' evidenceDigestSha256=' + evidenceDigest);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    console.log('EVIDENCE_RECORD_FAILED:' + String(error && error.code || 'DB_ERROR'));
    process.exit(1);
  } finally {
    try { await client.end(); } catch { /* already closed */ }
  }
}

main().catch(error => {
  console.log('EVIDENCE_RECORDER_UNEXPECTED:' + String((error && error.code) || 'ERROR'));
  process.exit(1);
});
