'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'sql', 'postgres', '072_deployment_release_evidence_store.sql');
const RECORDER_PATH = path.resolve(__dirname, '..', 'scripts', 'record-deployment-release-evidence.js');
const migrationSql = () => fs.readFileSync(MIGRATION_PATH, 'utf8');

test('migration 072 exists, is a single transaction, and self-verifies its security contract', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.deployment_release_evidence/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /OPSC_DEPLOYMENT_EVIDENCE_STORE_CONTRACT_FAILED/);
});

test('migration 072 binds every row to a real dpl_ deployment, commit, and pipeline', () => {
  const sql = migrationSql();
  assert.match(sql, /deployment_id text PRIMARY KEY CHECK \(deployment_id ~ '\^dpl_\[A-Za-z0-9\]\+\$'\)/);
  assert.match(sql, /source_commit_sha text NOT NULL CHECK \(source_commit_sha ~ '\^\[a-f0-9\]\{40\}\$'\)/);
  assert.match(sql, /pipeline_id text NOT NULL CHECK \(pipeline_id ~ '\^\[0-9\]\{1,15\}\$'\)/);
  assert.match(sql, /evidence_digest_sha256 text NOT NULL CHECK \(evidence_digest_sha256 ~ '\^\[a-f0-9\]\{64\}\$'\)/);
});

test('migration 072 forces RLS and denies the runtime role every privilege', () => {
  const sql = migrationSql();
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.deployment_release_evidence FROM PUBLIC/);
  // Default privileges from migrations 049/059 would pre-grant new tables to
  // opscore_app/opscore_runtime; 072 must revoke them explicitly.
  assert.match(sql, /REVOKE ALL ON public\.deployment_release_evidence FROM opscore_app/);
  assert.match(sql, /REVOKE ALL ON public\.deployment_release_evidence FROM opscore_runtime/);
  assert.match(sql, /USING \(current_user = 'neondb_owner'\)/);
  const verifyBlock = sql.slice(sql.indexOf('$verify$'), sql.indexOf('END\n$verify$'));
  assert.match(verifyBlock, /relforcerowsecurity/);
  assert.match(verifyBlock, /has_table_privilege\('opscore_runtime'/);
});

test('the evidence recorder validates identity before recording and fails closed', () => {
  const source = fs.readFileSync(RECORDER_PATH, 'utf8');
  assert.match(source, /RELEASE_PROOF_COMMIT_MISMATCH/);
  assert.match(source, /RELEASE_PROOF_PIPELINE_MISMATCH/);
  assert.match(source, /RELEASE_PROOF_DEPLOYMENT_MISMATCH/);
  assert.match(source, /EVIDENCE_ROW_ALREADY_RECORDED/);
  assert.match(source, /ON CONFLICT \(deployment_id\) DO NOTHING/);
  assert.match(source, /rejectUnauthorized: true/);
  // The recorder must never echo its connection material.
  assert.equal(/console\.(log|error)\(.*OPSC_EVIDENCE_OWNER_URL/.test(source), false);
  // The gates summary is derived from the live proof, never from caller input.
  assert.equal(source.includes('OPSC_RELEASE_GATES_SUMMARY'), false);
  // The promoted dpl id may be resolved from the live proof, but a supplied id
  // must always be cross-checked against it.
  assert.match(source, /suppliedDeploymentId && deploymentId !== suppliedDeploymentId/);
  assert.match(source, /RELEASE_PROOF_DEPLOYMENT_MISMATCH/);
  assert.match(source, /allGatesPass: proof\.status === 'PASS'/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.deployment_release_evidence/);
});
